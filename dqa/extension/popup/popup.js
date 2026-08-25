'use strict';

/**
 * DQA popup —— 操作面板
 *
 * 這裡只做流程與呈現。擷取邏輯全部在 lib/capture.js(與鍵盤快速鍵共用),
 * 量測邏輯全部在 browser/*.js(與 Playwright 共用)。
 */

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const SIDE_NAME = { A: 'Storybook', B: 'Production' };

let settings = null;
let tab = null;

function setStatus(text, kind) {
  const el = $('#status');
  el.textContent = text || '';
  el.className = kind || '';
}

function timeOf(iso) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function hostOf(url) {
  try { return new URL(url).host; } catch (e) { return url || '—'; }
}

/* ------------------------------------------------------------------ 渲染 */

function renderCapture(side, rec) {
  const box = $(`#side-${side}`);
  const meta = $(`[data-meta="${side}"]`);
  box.classList.toggle('filled', !!rec);
  if (!rec) {
    meta.textContent = '尚未擷取';
    return;
  }
  const themeAttr = settings.themeAttrs.find((a) => rec.env.theme[a]);
  const theme = (themeAttr && rec.env.theme[themeAttr]) || rec.env.theme['prefers-color-scheme'];
  meta.innerHTML = '';
  const lines = [
    `${timeOf(rec.capturedAt)}　${hostOf(rec.url)}`,
    `${rec.extraction.nodes.length} 個節點　·　viewport ${rec.env.viewportWidth}　·　theme ${theme}`,
    rec.targetInfo && rec.targetInfo.label ? `目標 ${rec.targetInfo.label}` : null,
  ].filter(Boolean);
  for (const l of lines) {
    const div = document.createElement('div');
    div.textContent = l;
    meta.appendChild(div);
  }
}

async function renderAll() {
  const [{ A, B }, data] = await Promise.all([DQA_STORE.getCaptures(), DQA_STORE.getData()]);
  renderCapture('A', A);
  renderCapture('B', B);
  $('#report').disabled = !(A && B);
  $('#rubric-version').textContent =
    `rubric ${data.rubric.version}${data.source === 'override' ? '(自訂)' : ''}`;

  // 兩側 viewport 不同 = 幾何不可比(ADR-009)。這是最常見的誤用,提前擋在按鈕上。
  if (A && B && A.env.viewportWidth !== B.env.viewportWidth) {
    setStatus(
      `兩側 viewport 寬度不同(A ${A.env.viewportWidth} / B ${B.env.viewportWidth})。\n`
      + '幾何在不同寬度下不可比,報告會被拒絕產出。請校正視窗寬度後重新擷取。',
      'err'
    );
  }
}

async function renderViewport() {
  $('#vp-target').textContent = `${settings.viewportWidth}px`;
  const pill = $('#vp-state');
  const width = await DQA_CAPTURE.readViewport(tab);
  if (width == null) {
    pill.textContent = '這個分頁無法量測';
    pill.className = 'pill warn';
    return;
  }
  const ok = width === settings.viewportWidth;
  pill.textContent = ok ? `目前 ${width}　✓` : `目前 ${width}　✕`;
  pill.className = `pill ${ok ? 'good' : 'bad'}`;
}

async function renderSelection() {
  const sel = await DQA_CAPTURE.readSelection(tab);
  const el = $('#selection');
  if (sel && sel.label) {
    el.textContent = `${sel.label}　(子 ${sel.childCount} / 同層 ${sel.siblingCount})`;
    el.style.color = '';
  } else {
    el.textContent = `(未選取 —— 未選取時退回 ${settings.fallbackSelector})`;
    el.style.color = 'var(--subtle)';
  }
}

/* ------------------------------------------------------------------ 動作 */

async function withBusy(btn, fn) {
  const old = btn.textContent;
  btn.disabled = true;
  btn.textContent = '…';
  try {
    await fn();
  } catch (e) {
    const reasons = e.reasons && e.reasons.length ? `\n・${e.reasons.join('\n・')}` : '';
    setStatus(`${e.message}${reasons}`, 'err');
  } finally {
    btn.disabled = false;
    btn.textContent = old;
  }
}

async function onCapture(side) {
  const { record } = await DQA_CAPTURE.captureSide(side);
  setStatus(
    `${SIDE_NAME[side]} 已擷取:${record.extraction.nodes.length} 個節點`
    + `,目標 ${record.extraction.targetPath}`,
    'ok'
  );
  await renderAll();
}

function bind() {
  $('#open-options').addEventListener('click', () => chrome.runtime.openOptionsPage());

  $('#pick').addEventListener('click', (e) => withBusy(e.target, async () => {
    await DQA_CAPTURE.startPicker(tab);
    setStatus('挑選器已啟動 —— 到頁面上點選目標,選好再打開這個面板。');
    window.close(); // 面板一定會被頁面點擊關掉,乾脆自己收掉,避免看起來像當掉
  }));

  $('#clear-pick').addEventListener('click', (e) => withBusy(e.target, async () => {
    await DQA_CAPTURE.unfreeze(tab);
    await renderSelection();
    setStatus('已清除選取,並解除頁面凍結。');
  }));

  $('#calibrate').addEventListener('click', (e) => withBusy(e.target, async () => {
    const width = await DQA_CAPTURE.calibrateWidth(tab, settings.viewportWidth);
    await renderViewport();
    setStatus(
      width === settings.viewportWidth
        ? `視窗已校正,viewport = ${width}px。`
        : `校正後 viewport = ${width}px,仍與設定的 ${settings.viewportWidth}px 不符。`
          + '\n可能是視窗已達螢幕寬度上限,或開著 DevTools —— 兩側只要寬度一致即可,'
          + '不一致就把設定改成這個實際值。',
      width === settings.viewportWidth ? 'ok' : 'err'
    );
  }));

  $('#unfreeze').addEventListener('click', (e) => withBusy(e.target, async () => {
    await DQA_CAPTURE.unfreeze(tab);
    setStatus('已解除動畫凍結並移除框線。');
  }));

  $('#clear-all').addEventListener('click', (e) => withBusy(e.target, async () => {
    await DQA_STORE.clearAllCaptures();
    await DQA_STORE.refreshBadge();
    setStatus('兩側擷取已清除。');
    await renderAll();
  }));

  $('#report').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('report/report.html') });
  });

  $$('[data-capture]').forEach((btn) => {
    btn.addEventListener('click', () => withBusy(btn, () => onCapture(btn.dataset.capture)));
  });

  $$('[data-clear]').forEach((btn) => {
    btn.addEventListener('click', () => withBusy(btn, async () => {
      await DQA_STORE.clearCapture(btn.dataset.clear);
      await DQA_STORE.refreshBadge();
      await renderAll();
    }));
  });
}

(async function init() {
  settings = await DQA_STORE.getSettings();
  try {
    tab = await DQA_CAPTURE.activeTab();
  } catch (e) {
    setStatus(e.message, 'err');
    return;
  }
  bind();
  await renderAll();
  // 注入失敗的分頁(chrome://、Web Store)不該讓整個面板掛掉,只是量不到而已
  try {
    await DQA_CAPTURE.ensureInjected(tab.id);
  } catch (e) {
    setStatus('這個分頁不允許擴充套件執行(chrome:// 或 Chrome 線上應用程式商店)。', 'err');
  }
  await renderViewport();
  await renderSelection();
}());
