import { put, call, takeEvery } from 'redux-saga/effects'

import * as actions from '../actions/globalActions'

import { Rate } from "../services/rate"
import { push } from 'react-router-redux';
import { addTranslationForLanguage, setActiveLanguage } from 'react-localize-redux';
import { getTranslate } from 'react-localize-redux';
import constants from "../services/constants"
import Language from "../../../lang"
import * as common from "../utils/common";
import * as converter from "../utils/converter"
import { store } from '../store'

export function* getLatestBlock(action) {
  const ethereum = action.payload
  try{
    const block = yield call([ethereum, ethereum.call], "getLatestBlock")
    yield put(actions.updateBlockComplete(block))
  }catch(e){
    console.log(e)
  }
}

export function* goToRoute(action) {
  yield put(push(action.payload));
}

export function* clearSession() {
  var state = store.getState();
  var wallet = state.account.wallet;
  
  if (wallet && wallet.clearSession){
    wallet.clearSession()
  }

  yield put(actions.clearSessionComplete());

  if (window.kyberBus) { window.kyberBus.broadcast('wallet.clear', null); }
}

export function* updateAllRate(action) {
  var state = store.getState()
  
  var rateUSD = state.tokens.tokens.ETH.rateUSD
  const { ethereum, tokens } = action.payload
  if (!rateUSD) {
    try {
      rateUSD = yield call([ethereum, ethereum.call],"getRateETH")
      yield put(actions.updateAllRateUSDComplete(rateUSD))
      yield put(actions.showBalanceUSD())
    }
    catch(err) {
      console.log(err.message)
      rateUSD = "0"
    }
  }
  try {
    const rates = yield call([ethereum, ethereum.call],"getAllRates", tokens)
    yield put(actions.updateAllRateComplete(rates, rateUSD))
    yield call(updateTitleWithRate);
  }
  catch (err) {
    console.log(err.message)
  }
}

export function* updateTitle() {
  try {
    yield call(updateTitleWithRate);
  } catch (err) {
    console.log(err);
  }
}

function updateTitleWithRate() {
  const state = store.getState();
  let title = state.global.documentTitle;
  const { pathname } = window.location;

  if (common.isAtSwapPage(pathname)) {
    let { sourceTokenSymbol, destTokenSymbol } = common.getTokenPairFromRoute(pathname);
    sourceTokenSymbol = sourceTokenSymbol.toUpperCase();
    destTokenSymbol = destTokenSymbol.toUpperCase();

    if (sourceTokenSymbol !== destTokenSymbol) {
      if (sourceTokenSymbol === "ETH") {
        // 1 token = 1 / rateEth (Eth)
        const rateEth = converter.convertBuyRate(state.tokens.tokens[destTokenSymbol].rateEth);
        if (rateEth != 0) {
          title = `${converter.roundingRateNumber(rateEth)} ${title}`;
        }
      } else {
        // 1 src token = rate src token * rateEth dest token
        const rateSourceToEth = converter.toT(state.tokens.tokens[sourceTokenSymbol].rate);
        const rateEthToDest = converter.toT(state.tokens.tokens[destTokenSymbol].rateEth);
        const rate = rateSourceToEth * rateEthToDest;
        if (rate != 0) {
          title = `${converter.roundingRateNumber(rate)} ${title}`;
        }
      }
    } 
  }

  document.title = title;
}

export function* checkConnection(action) {
  var { ethereum, count, maxCount, isCheck } = action.payload
  try {
    const isConnected = yield call([ethereum, ethereum.call], "isConnectNode")
    if (isConnected){
      yield put(actions.setNetworkError(""))
      yield put(actions.updateCountConnection(0))
    }
  }catch(err){
      if (count >= maxCount) {
        let translate = getTranslate(store.getState().locale)
        yield put(actions.setNetworkError(translate('error.network_error') || 'Cannot connect to node right now. Please check your network!'))
        yield put(actions.updateCountConnection(++count))
        return
      }
      if (count < maxCount) {
        yield put(actions.updateCountConnection(++count))
        return
      }
  }
}

export function* setGasPrice(action) {
  var safeLowGas, standardGas, fastGas, defaultGas, superFastGas
  var state = store.getState();
  var ethereum = state.connection.ethereum;
  var maxGasPrice = state.exchange.maxGasPrice

  try {
    const gasPrice = yield call([ethereum, ethereum.call], "getGasPrice")

    safeLowGas = converter.stringToNumber(gasPrice.low)
    standardGas = converter.stringToNumber(gasPrice.standard)
    defaultGas = converter.stringToNumber(gasPrice.default)
    fastGas = converter.stringToNumber(gasPrice.fast)
   
    
    var selectedGas = 's'

    superFastGas = 2 * fastGas;

    if (fastGas <= 20){
      defaultGas = fastGas
      selectedGas = 'f'
    }

    if (fastGas <= 10) {
      superFastGas = 20;
    }

    if (superFastGas > maxGasPrice) superFastGas = maxGasPrice;
    if (safeLowGas > maxGasPrice) safeLowGas = maxGasPrice;
    if (standardGas > maxGasPrice) standardGas = maxGasPrice;
    if (defaultGas > maxGasPrice) defaultGas = maxGasPrice;
    if (fastGas > maxGasPrice) fastGas = maxGasPrice;

    yield put(actions.setGasPriceComplete(safeLowGas, standardGas, fastGas, superFastGas, defaultGas, selectedGas));
  }catch (err) {
    console.log(err.message)
  }
}

export function* changelanguage(action) {
  const { ethereum, lang, locale } = action.payload

  if (Language.supportLanguage.indexOf(lang) < 0) return
  try {
    var activeLang = lang
    if (!Language.loadAll && lang !== Language.defaultLanguage) {
      activeLang = lang == Language.defaultLanguage ? Language.defaultLanguage : Language.defaultAndActive[1]
      if (!locale || locale.translations["pack"][1] !== lang) {
        var languagePack = yield call(ethereum.call,"getLanguagePack", lang)
        if (!languagePack) return;

        yield put.resolve(addTranslationForLanguage(languagePack, activeLang))
      }
    }
    yield put(setActiveLanguage(activeLang))
  } catch (err) {
    console.log(err)
  }
}

export function* checkUserEligible(action) {  
  try{
    var {ethereum} = action.payload
    var state = store.getState()
    var account = state.account.account
    var address = account.address
    var result = yield call([ethereum, ethereum.call], "getUserMaxCap", address)

    if(result.success && result.eligible){
      yield put(actions.clearErrorEligible())
    } else {
      yield put(actions.throwErrorEligible(result.message))
    }

  }catch(e){
    console.log(e)
    yield put(actions.clearErrorEligible())
  }
}


export function* watchGlobal() {
  yield takeEvery("GLOBAL.NEW_BLOCK_INCLUDED_PENDING", getLatestBlock)
  yield takeEvery("GLOBAL.GO_TO_ROUTE", goToRoute)
  yield takeEvery("GLOBAL.CLEAR_SESSION", clearSession)
  yield takeEvery("GLOBAL.CHANGE_LANGUAGE", changelanguage)
  yield takeEvery("GLOBAL.CHECK_CONNECTION", checkConnection)
  yield takeEvery("GLOBAL.CHECK_USER_ELIGIBLE", checkUserEligible)
  yield takeEvery("GLOBAL.SET_GAS_PRICE", setGasPrice)
  yield takeEvery("GLOBAL.RATE_UPDATE_ALL_PENDING", updateAllRate)
  yield takeEvery("GLOBAL.UPDATE_TITLE_WITH_RATE", updateTitle)
}
