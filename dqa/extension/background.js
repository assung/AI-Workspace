/**
 * DQA Extension —— service worker
 *
 * 只做三件事:鍵盤快速鍵、badge、安裝時的提示。
 * 擷取流程本身在 lib/capture.js,與 popup 共用同一份 —— 兩個入口不能有兩套行為。
 */
'use strict';

importScripts('lib/storage.js', 'lib/capture.js');

const SIDE_BY_COMMAND = {
  'capture-storybook': 'A',
  'capture-production': 'B',
};

/** service worker 沒有 DOM,無法用 alert;用 badge 短暫顯示結果。 */
async function flashBadge(text, color) {
  await chrome.action.setBadgeText({ text });
  await chrome.action.setBadgeBackgroundColor({ color });
  setTimeout(() => { DQA_STORE.refreshBadge(); }, 2500);
}

chrome.commands.onCommand.addListener(async (command) => {
  try {
    if (command === 'pick-element') {
      const tab = await DQA_CAPTURE.activeTab();
      await DQA_CAPTURE.startPicker(tab);
      return;
    }
    const side = SIDE_BY_COMMAND[command];
    if (!side) return;
    await DQA_CAPTURE.captureSide(side);
    await flashBadge('✓', '#216e4e');
  } catch (e) {
    // 快速鍵沒有可以顯示長訊息的地方 —— 只標示失敗,細節留給 popup 重跑時顯示
    console.warn('DQA:', e.message, e.reasons || '');
    await flashBadge('!', '#ae2e24');
  }
});

chrome.runtime.onInstalled.addListener(async (details) => {
  await DQA_STORE.refreshBadge();
  if (details.reason === 'install') {
    // 內建的 rubric / tokens 是 placeholder(docs/TASKS.md T0),沒換掉之前報告不具說服力
    chrome.runtime.openOptionsPage();
  }
});

chrome.runtime.onStartup.addListener(() => DQA_STORE.refreshBadge());
