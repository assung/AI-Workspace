'use strict';

/**
 * DQA 設定頁
 *
 * rubric 的契約檢查在這裡執行一次,不是為了防呆 ——
 * 貼一份沒有 source 的 rubric 進來,等於讓每一條違規都失去可以被質疑的依據(ADR-007)。
 */

const $ = (sel) => document.querySelector(sel);

const SETTING_FIELDS = {
  viewportWidth: 'number',
  fontSettleMs: 'number',
  maxNodes: 'number',
  themeAttrs: 'list',
  affordanceAttrs: 'list',
  fallbackSelector: 'text',
  allowEnvMismatch: 'bool',
};

const VALID_SEVERITY = new Set(['high', 'medium', 'low', 'info']);
const VALID_EVALUATOR = new Set(['deterministic', 'ai']);
// outcome 決定判定進 deterministic_violations 還是 notices;沒寫等於 violation
const VALID_OUTCOME = new Set(['violation', 'notice']);

function show(id, text, kind) {
  const el = $(id);
  el.textContent = text || '';
  el.className = `msg ${kind || ''}`;
}

function readList(v) {
  return v.split(',').map((s) => s.trim()).filter(Boolean);
}

/* --------------------------------------------------------------- 驗證 */

function validateRubric(rubric) {
  const errs = [];
  if (!rubric || typeof rubric !== 'object') return ['rubric 不是物件'];
  if (!rubric.version) errs.push('缺少 version');
  if (!Array.isArray(rubric.rules)) return errs.concat('rules 必須是陣列');

  const seen = new Set();
  rubric.rules.forEach((r, i) => {
    const at = r.code || `#${i}`;
    if (!r.code) errs.push(`${at}:缺少 code`);
    else if (!/^[A-Z]+-\d{3}$/.test(r.code)) errs.push(`${at}:code 不符 DOMAIN-NNN 命名`);
    else if (seen.has(r.code)) errs.push(`${at}:code 重複`);
    seen.add(r.code);

    // 這三條是契約,不是建議
    if (!r.source) errs.push(`${at}:缺少 source —— 沒有依據的規則不准進 rubric(ADR-007)`);
    if (!VALID_SEVERITY.has(r.severity)) errs.push(`${at}:severity 必須是 high/medium/low/info`);
    if (!VALID_EVALUATOR.has(r.evaluator)) errs.push(`${at}:evaluator 必須是 deterministic 或 ai`);
    if (r.outcome && !VALID_OUTCOME.has(r.outcome)) {
      errs.push(`${at}:outcome 只能是 violation 或 notice(留空等於 violation)`);
    }
    if (!r.description) errs.push(`${at}:缺少 description`);
  });
  return errs;
}

function validateSpacing(doc) {
  const scale = (doc && doc.scale) || doc;
  const errs = [];
  if (!scale || typeof scale !== 'object') return ['spacing scale 不是物件'];
  const entries = Object.entries(scale).filter(([k]) => !k.startsWith('_'));
  if (!entries.length) errs.push('spacing scale 是空的');
  for (const [k, v] of entries) {
    if (typeof v !== 'number' || Number.isNaN(v)) errs.push(`${k}:值必須是數字(px)`);
  }
  return errs;
}

function validateColors(doc) {
  const scale = (doc && doc.scale) || doc;
  const errs = [];
  if (!scale || typeof scale !== 'object') return ['color primitives 不是物件'];
  const entries = Object.entries(scale).filter(([k]) => !k.startsWith('_'));
  if (!entries.length) errs.push('color primitives 是空的');
  for (const [k, v] of entries) {
    // #rrggbbaa 是必要的:alpha 不同的兩個 token 是兩個不同的顏色,壓成 6 碼會被合併
    if (typeof v !== 'string' || !/^#[0-9a-f]{6}([0-9a-f]{2})?$/.test(v)) {
      errs.push(`${k}:值必須是小寫 #rrggbb 或 #rrggbbaa`);
    }
  }
  return errs;
}

function parseOrThrow(text, what) {
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error(`${what} 不是合法 JSON:${e.message}`);
  }
}

/* --------------------------------------------------------------- 載入 */

async function loadSettings() {
  const s = await DQA_STORE.getSettings();
  for (const [key, kind] of Object.entries(SETTING_FIELDS)) {
    const el = $(`#${key}`);
    if (kind === 'bool') el.checked = !!s[key];
    else if (kind === 'list') el.value = (s[key] || []).join(', ');
    else el.value = s[key];
  }
}

function fillData(data) {
  $('#rubric').value = JSON.stringify(data.rubric, null, 2);
  $('#spacing').value = JSON.stringify(data.tokens.spacing, null, 2);
  $('#colors').value = JSON.stringify(data.tokens.colors, null, 2);
  const pill = $('#data-state');
  const custom = data.source === 'override';
  pill.textContent = custom ? `自訂(${new Date(data.savedAt).toLocaleString('zh-TW', { hour12: false })})` : '內建 placeholder';
  pill.className = `status-pill ${custom ? 'ok' : ''}`;
}

async function loadData() {
  fillData(await DQA_STORE.getData());
}

async function loadBundled() {
  const [rubric, spacing, colors] = await Promise.all([
    fetch(chrome.runtime.getURL('data/rubric.json')).then((r) => r.json()),
    fetch(chrome.runtime.getURL('data/spacing-scale.json')).then((r) => r.json()),
    fetch(chrome.runtime.getURL('data/color-primitives.json')).then((r) => r.json()),
  ]);
  $('#rubric').value = JSON.stringify(rubric, null, 2);
  $('#spacing').value = JSON.stringify(spacing, null, 2);
  $('#colors').value = JSON.stringify(colors, null, 2);
}

/* --------------------------------------------------------------- 事件 */

$('#save-settings').addEventListener('click', async () => {
  const patch = {};
  for (const [key, kind] of Object.entries(SETTING_FIELDS)) {
    const el = $(`#${key}`);
    if (kind === 'bool') patch[key] = el.checked;
    else if (kind === 'list') patch[key] = readList(el.value);
    else if (kind === 'number') patch[key] = Number(el.value);
    else patch[key] = el.value.trim();
  }
  if (!Number.isFinite(patch.viewportWidth) || patch.viewportWidth < 320) {
    show('#settings-msg', 'viewport 寬度必須是 320 以上的數字。', 'err');
    return;
  }
  if (!patch.themeAttrs.length) {
    show('#settings-msg', '至少要有一個主題屬性,否則兩側 theme 不一致時偵測不到。', 'err');
    return;
  }
  await DQA_STORE.setSettings(patch);
  show('#settings-msg', patch.allowEnvMismatch
    ? '已儲存。注意:「允許環境不一致」是開著的,幾何差異會混入環境變因。'
    : '已儲存。', patch.allowEnvMismatch ? 'warn' : 'ok');
});

$('#reset-settings').addEventListener('click', async () => {
  await DQA_STORE.resetSettings();
  await loadSettings();
  show('#settings-msg', '已還原預設值。', 'ok');
});

$('#save-data').addEventListener('click', async () => {
  try {
    const rubric = parseOrThrow($('#rubric').value, 'rubric.json');
    const spacing = parseOrThrow($('#spacing').value, 'spacing-scale.json');
    const colors = parseOrThrow($('#colors').value, 'color-primitives.json');

    const errs = [
      ...validateRubric(rubric),
      ...validateSpacing(spacing),
      ...validateColors(colors),
    ];
    if (errs.length) {
      show('#data-msg', `不予儲存,${errs.length} 項不符契約:\n・${errs.join('\n・')}`, 'err');
      return;
    }
    await DQA_STORE.setData(rubric, { spacing, colors });
    await loadData();
    const aiRules = rubric.rules.filter((r) => r.evaluator === 'ai').length;
    const notices = rubric.rules.filter((r) => r.outcome === 'notice').length;
    show('#data-msg',
      `已儲存。${rubric.rules.length} 條規則(${rubric.rules.length - aiRules} 條程式判、${aiRules} 條 AI 判,`
      + `其中 ${notices} 條只出提示不定讞),全部帶有 source。`, 'ok');
  } catch (e) {
    show('#data-msg', e.message, 'err');
  }
});

$('#reload-bundled').addEventListener('click', async () => {
  await loadBundled();
  show('#data-msg', '已把內建版本載入編輯區(尚未儲存)。', 'ok');
});

$('#clear-data').addEventListener('click', async () => {
  await DQA_STORE.clearData();
  await loadData();
  show('#data-msg', '已清除自訂內容,改用內建的 placeholder。', 'warn');
});

(async function init() {
  await loadSettings();
  await loadData();
}());
