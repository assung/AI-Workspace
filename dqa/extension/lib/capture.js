/**
 * DQA Extension —— 擷取流程
 *
 * popup 與 background(鍵盤快速鍵)共用同一份流程。
 * 量測本身完全在 browser/preflight.js + browser/extract.js 裡完成 ——
 * 這兩支與 Playwright 共用同一份檔案,這裡只負責注入、傳參、收結果。
 */
'use strict';

/* eslint-disable no-var */
var DQA_CAPTURE = (function () {
  const INJECT_FILES = ['browser/preflight.js', 'browser/extract.js'];

  const PREFLIGHT_MESSAGES = {
    PF_DOC_NOT_COMPLETE: '頁面尚未載入完成',
    PF_FONTS_API_MISSING: '瀏覽器沒有 document.fonts,字型度量不可信(ADR-010)',
    PF_FONTS_READY_REJECTED: 'document.fonts.ready 被拒絕,字型狀態不明',
    PF_FONTS_PENDING: '仍有字型未載入完成 —— 現在量到的 baseline / 寬度是 fallback 字型的值',
    PF_VIEWPORT_NOT_SPECIFIED: '沒有指定 viewport 寬度',
    PF_VIEWPORT_MISMATCH: 'viewport 寬度與設定不符 —— 幾何不可比,請先校正視窗寬度',
    PF_PINCH_ZOOM_ACTIVE: '頁面正在縮放中,先按 Ctrl+0 還原',
    EXT_NOT_INJECTED: '注入失敗:這個分頁不允許擴充套件執行(chrome:// 或商店頁面)',
    EXT_NO_TARGET: '找不到目標節點 —— 先用挑選器選一個,或在頁面上加 data-dqa-target',
    EXT_EXTRACT_FAILED: '擷取過程丟出例外',
  };

  function describeErrors(errors) {
    return (errors || []).map((e) => {
      const base = PREFLIGHT_MESSAGES[e.code] || e.code;
      if (e.detail == null) return base;
      const d = typeof e.detail === 'object' ? JSON.stringify(e.detail) : e.detail;
      return `${base}(${d})`;
    });
  }

  async function activeTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) throw new Error('找不到作用中的分頁');
    return tab;
  }

  async function inject(tabId, files) {
    await chrome.scripting.executeScript({ target: { tabId }, files });
  }

  /* --------------------------------------------------------- 頁面內執行的函式 */
  /* 以下三支會被序列化後送進頁面,不能引用這個檔案裡的任何外部變數。 */

  async function pageCapture(opts) {
    const D = window.__DQA__;
    if (!D || !D.preflight || !D.extract) return { ok: false, errors: [{ code: 'EXT_NOT_INJECTED' }] };

    const picked = D.picked && D.picked.isConnected ? D.picked : null;
    const target = picked || (opts.fallbackSelector ? document.querySelector(opts.fallbackSelector) : null);
    if (!target) return { ok: false, errors: [{ code: 'EXT_NO_TARGET' }] };

    // 挑選器的框線是 document.body 的子節點。extract 會走訪鄰域根節點的 children,
    // 框線留著就會被當成鄰域裡的一個節點 —— 量測期間必須整個拿掉,不是設成 display:none。
    const toggle = D.picker && D.picker.setOverlaysVisible;
    if (toggle) toggle(false);
    try {
      const pf = await D.preflight({
        expectedViewportWidth: opts.viewportWidth,
        themeAttrs: opts.themeAttrs,
        fontSettleMs: opts.fontSettleMs,
      });
      if (!pf.ok) return { ok: false, errors: pf.errors, env: pf.env };

      const extraction = D.extract(target, {
        affordanceAttrs: opts.affordanceAttrs,
        maxNodes: opts.maxNodes,
      });
      return {
        ok: true,
        env: pf.env,
        extraction,
        targetInfo: D.describe ? D.describe(target) : { tag: target.tagName.toLowerCase() },
      };
    } catch (e) {
      return { ok: false, errors: [{ code: 'EXT_EXTRACT_FAILED', detail: String((e && e.message) || e) }] };
    } finally {
      if (toggle) toggle(true);
    }
  }

  function pageReadSelection() {
    const D = window.__DQA__;
    if (!D) return null;
    if (D.picked && D.picked.isConnected) {
      return Object.assign({ mode: 'picker' }, D.describe ? D.describe(D.picked) : {});
    }
    return null;
  }

  function pageStartPicker() {
    if (!window.__DQA__ || !window.__DQA__.picker) return false;
    window.__DQA__.picker.start();
    return true;
  }

  function pageUnfreeze() {
    if (window.__DQA__ && window.__DQA__.unfreezeMotion) window.__DQA__.unfreezeMotion();
    if (window.__DQA__ && window.__DQA__.picker) window.__DQA__.picker.clear();
    return true;
  }

  /** 視窗外框與 viewport 的差(捲軸、devtools、系統邊框)每台機器不同,量出來再補。 */
  function pageWidthDelta() {
    return { client: document.documentElement.clientWidth, outer: window.outerWidth };
  }

  /* ------------------------------------------------------------------- 對外 */

  async function ensureInjected(tabId) {
    await inject(tabId, INJECT_FILES.concat(['picker.js']));
  }

  async function startPicker(tab) {
    await ensureInjected(tab.id);
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id }, func: pageStartPicker,
    });
    if (!result) throw new Error('挑選器啟動失敗');
  }

  async function readSelection(tab) {
    try {
      const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId: tab.id }, func: pageReadSelection,
      });
      return result || null;
    } catch (e) {
      return null; // 分頁不允許注入(chrome://、商店頁),不是錯誤,只是沒有選取
    }
  }

  async function readViewport(tab) {
    try {
      const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId: tab.id }, func: pageWidthDelta,
      });
      return result.client;
    } catch (e) {
      return null;
    }
  }

  async function unfreeze(tab) {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: pageUnfreeze });
  }

  /**
   * 把視窗調到讓 viewport 剛好等於設定寬度。
   * 擴充套件無法像 Playwright 那樣宣告 viewport,只能先量再補差值。
   */
  async function calibrateWidth(tab, targetWidth) {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id }, func: pageWidthDelta,
    });
    const chrome_ = result.outer - result.client; // 捲軸 + 視窗邊框
    await chrome.windows.update(tab.windowId, { width: targetWidth + chrome_, state: 'normal' });
    const [{ result: after }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id }, func: pageWidthDelta,
    });
    return after.client;
  }

  /**
   * @param {'A'|'B'} side
   * @returns {Promise<{record:object}>}
   */
  async function captureSide(side) {
    const settings = await DQA_STORE.getSettings();
    const tab = await activeTab();
    await ensureInjected(tab.id);

    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: pageCapture,
      args: [{
        viewportWidth: settings.viewportWidth,
        themeAttrs: settings.themeAttrs,
        fontSettleMs: settings.fontSettleMs,
        affordanceAttrs: settings.affordanceAttrs,
        maxNodes: settings.maxNodes,
        fallbackSelector: settings.fallbackSelector,
      }],
    });

    if (!result || !result.ok) {
      const err = new Error('擷取被環境鎖擋下');
      err.reasons = describeErrors(result && result.errors);
      throw err;
    }

    const record = {
      side,
      role: DQA_STORE.SIDES[side],
      capturedAt: new Date().toISOString(),
      // URL 與標題只留在本機供操作者辨識,不進 payload —— payload 不帶任何可回推內容的字串
      url: tab.url || null,
      title: tab.title || null,
      targetInfo: result.targetInfo || null,
      env: result.env,
      extraction: result.extraction,
    };
    await DQA_STORE.setCapture(side, record);
    await DQA_STORE.refreshBadge();
    return { record };
  }

  return {
    activeTab, ensureInjected, startPicker, readSelection, readViewport,
    unfreeze, calibrateWidth, captureSide, describeErrors,
  };
})();

if (typeof module === 'object' && module.exports) module.exports = DQA_CAPTURE;
