/**
 * DQA Extension —— 設定與擷取結果的持久層
 *
 * 同時給 popup / report / options(一般頁面)與 background(service worker)使用,
 * 因此寫成 classic script:頁面用 <script src>,SW 用 importScripts。
 */
'use strict';

/* eslint-disable no-var */
var DQA_STORE = (function () {
  const KEY_SETTINGS = 'dqa:settings';
  const KEY_DATA = 'dqa:data';
  const SIDES = { A: 'storybook', B: 'production' };
  const keyForSide = (side) => `dqa:capture:${side}`;

  /**
   * viewportWidth 是唯一真正決定幾何可比性的變因(ADR-009)。
   * 這裡不給「自動沿用第一次擷取的寬度」這種選項 —— 那會讓兩側在不同寬度下各自成立。
   */
  const DEFAULT_SETTINGS = {
    viewportWidth: 1280,
    // data-density / data-layout-space 會整組換掉間距 token 的值(md 16px / lg 24px),
    // 兩側不一致時每個間距都會差,而且差在環境不在實作 —— 必須記進 env 才比對得到
    themeAttrs: ['data-theme', 'data-density', 'data-layout-space'],
    fontSettleMs: 120,
    affordanceAttrs: ['title', 'aria-label', 'data-tooltip'],
    maxNodes: 120,
    fallbackSelector: '[data-dqa-target]',
    allowEnvMismatch: false,
  };

  function get(keys) {
    return chrome.storage.local.get(keys);
  }

  async function getSettings() {
    const got = await get(KEY_SETTINGS);
    return Object.assign({}, DEFAULT_SETTINGS, got[KEY_SETTINGS] || {});
  }

  async function setSettings(patch) {
    const next = Object.assign({}, await getSettings(), patch);
    await chrome.storage.local.set({ [KEY_SETTINGS]: next });
    return next;
  }

  async function resetSettings() {
    await chrome.storage.local.remove(KEY_SETTINGS);
    return Object.assign({}, DEFAULT_SETTINGS);
  }

  /**
   * rubric / tokens 的覆寫。沒有覆寫時一律回傳擴充套件內建的 data/(= repo 的 rubric.json 與 tokens/)。
   * 內建那份是 placeholder(見 docs/TASKS.md 的 T0),真正上線前必須換掉。
   */
  async function getData() {
    const got = await get(KEY_DATA);
    const override = got[KEY_DATA];
    if (override && override.rubric && override.tokens) {
      return { rubric: override.rubric, tokens: override.tokens, source: 'override', savedAt: override.savedAt };
    }
    const [rubric, spacing, colors] = await Promise.all([
      fetch(chrome.runtime.getURL('data/rubric.json')).then((r) => r.json()),
      fetch(chrome.runtime.getURL('data/spacing-scale.json')).then((r) => r.json()),
      fetch(chrome.runtime.getURL('data/color-primitives.json')).then((r) => r.json()),
    ]);
    return { rubric, tokens: { spacing, colors }, source: 'bundled' };
  }

  async function setData(rubric, tokens) {
    await chrome.storage.local.set({
      [KEY_DATA]: { rubric, tokens, savedAt: new Date().toISOString() },
    });
  }

  async function clearData() {
    await chrome.storage.local.remove(KEY_DATA);
  }

  async function getCapture(side) {
    const got = await get(keyForSide(side));
    return got[keyForSide(side)] || null;
  }

  async function getCaptures() {
    const got = await get([keyForSide('A'), keyForSide('B')]);
    return { A: got[keyForSide('A')] || null, B: got[keyForSide('B')] || null };
  }

  async function setCapture(side, record) {
    await chrome.storage.local.set({ [keyForSide(side)]: record });
  }

  async function clearCapture(side) {
    await chrome.storage.local.remove(keyForSide(side));
  }

  async function clearAllCaptures() {
    await chrome.storage.local.remove([keyForSide('A'), keyForSide('B')]);
  }

  /** action badge:一眼看出手上有哪幾側。 */
  async function refreshBadge() {
    const { A, B } = await getCaptures();
    const text = `${A ? 'A' : ''}${B ? 'B' : ''}`;
    await chrome.action.setBadgeText({ text });
    if (text) await chrome.action.setBadgeBackgroundColor({ color: text === 'AB' ? '#216e4e' : '#7f5f01' });
  }

  return {
    SIDES,
    DEFAULT_SETTINGS,
    getSettings, setSettings, resetSettings,
    getData, setData, clearData,
    getCapture, getCaptures, setCapture, clearCapture, clearAllCaptures,
    refreshBadge,
  };
})();

if (typeof module === 'object' && module.exports) module.exports = DQA_STORE;
