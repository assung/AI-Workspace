'use strict';

/**
 * DQA 報告頁
 *
 * payload 與 prompt 都由 core/*.js 產出 —— 與 Node CLI 同一份實作。
 * 這一頁只負責呈現,不做任何判定,也不對外連線。
 */

const $ = (sel) => document.querySelector(sel);
const SEV_ORDER = { high: 0, medium: 1, low: 2, info: 3 };

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

function banner(kind, text) {
  $('#banners').appendChild(el('div', `banner ${kind}`, text));
}

function fmtTime(iso) {
  return new Date(iso).toLocaleString('zh-TW', { hour12: false });
}

function hostOf(url) {
  try { return new URL(url).host + new URL(url).pathname; } catch (e) { return url || '—'; }
}

/* ------------------------------------------------------------------ 呈現 */

function renderSides(captures) {
  const box = $('#sides');
  for (const side of ['A', 'B']) {
    const rec = captures[side];
    const card = el('div', 'side-card');
    card.appendChild(el('b', null, `${side} — ${side === 'A' ? 'Storybook(元件規格)' : 'Production(實作)'}`));
    card.appendChild(el('div', 'mono', hostOf(rec.url)));
    card.appendChild(el('div', 'mono',
      `${fmtTime(rec.capturedAt)}　·　${rec.extraction.nodes.length} 節點　·　viewport ${rec.env.viewportWidth}　·　dpr ${rec.env.dpr}`));
    if (rec.targetInfo && rec.targetInfo.label) {
      card.appendChild(el('div', 'mono', `目標 ${rec.targetInfo.label}`));
    }
    box.appendChild(card);
  }
}

function renderMetrics(payload) {
  const box = $('#metrics');
  const bySev = {};
  for (const v of payload.deterministic_violations) bySev[v.severity] = (bySev[v.severity] || 0) + 1;
  const items = [
    ['違規', payload.deterministic_violations.length],
    ['high', bySev.high || 0],
    ['跳過', payload.skipped_checks.length],
    ['待 AI 判定', payload.unresolved.length],
    ['鄰域節點', payload.nodes.length],
  ];
  for (const [label, n] of items) {
    const m = el('div', 'metric');
    m.appendChild(el('div', 'n', String(n)));
    m.appendChild(el('div', 'l', label));
    box.appendChild(m);
  }
}

function renderViolations(payload) {
  const box = $('#violations');
  const list = [...payload.deterministic_violations].sort((a, b) => {
    const d = (SEV_ORDER[a.severity] ?? 9) - (SEV_ORDER[b.severity] ?? 9);
    return d || a.code.localeCompare(b.code) || a.node.localeCompare(b.node);
  });
  $('#c-violations').textContent = String(list.length);
  if (!list.length) {
    box.appendChild(el('p', 'empty', '沒有確定性違規。'));
    return;
  }
  for (const v of list) {
    const card = el('div', `finding sev-${v.severity}`);
    const head = el('div', 'finding-head');
    head.appendChild(el('span', 'code', v.code));
    head.appendChild(el('span', 'sev', v.severity));
    head.appendChild(el('span', 'mono', v.node));
    card.appendChild(head);
    card.appendChild(el('div', 'desc', v.description));

    const table = el('table', 'evidence');
    for (const [k, val] of Object.entries(v.evidence || {})) {
      const tr = el('tr');
      tr.appendChild(el('td', null, k));
      tr.appendChild(el('td', null, typeof val === 'object' ? JSON.stringify(val) : String(val)));
      table.appendChild(tr);
    }
    card.appendChild(table);
    // source 是爭議發生時大家要看的東西,不是註腳(ADR-007)
    card.appendChild(el('div', 'src', `依據:${v.source}`));
    box.appendChild(card);
  }
}

function renderSkipped(payload) {
  const box = $('#skipped');
  $('#c-skipped').textContent = String(payload.skipped_checks.length);
  if (!payload.skipped_checks.length) {
    box.appendChild(el('p', 'empty', '沒有跳過的檢查。'));
    return;
  }
  const ul = el('ul', 'plain');
  for (const s of payload.skipped_checks) {
    const li = el('li');
    li.appendChild(el('span', 'k', s.code));
    li.appendChild(el('span', 'v', s.reason));
    li.appendChild(el('span', 'k', s.node || ''));
    ul.appendChild(li);
  }
  box.appendChild(ul);
}

function renderUnresolved(payload) {
  const box = $('#unresolved');
  $('#c-unresolved').textContent = String(payload.unresolved.length);
  $('#n-nodes').textContent = String(payload.nodes.length);
  if (!payload.unresolved.length) {
    box.appendChild(el('p', 'empty', '沒有需要 AI 判定的項目。'));
    return;
  }
  const ul = el('ul', 'plain');
  for (const u of payload.unresolved) {
    const li = el('li');
    li.appendChild(el('span', 'k', u.id));
    li.appendChild(el('span', 'v', u.prop
      ? `A = ${u.sb ?? '—'}　B = ${u.prod ?? '—'}`
      : (u.question || '')));
    ul.appendChild(li);
  }
  box.appendChild(ul);
}

function renderStructural(payload) {
  const box = $('#structural');
  const { onlySb, onlyProd } = payload.structural_diff;
  if (!onlySb.length && !onlyProd.length) {
    box.appendChild(el('p', 'empty', '兩側節點完全配對。'));
    return;
  }
  const ul = el('ul', 'plain');
  for (const p of onlySb) {
    const li = el('li');
    li.appendChild(el('span', 'k', p));
    li.appendChild(el('span', 'v', '只存在於 A(Storybook)'));
    ul.appendChild(li);
  }
  for (const p of onlyProd) {
    const li = el('li');
    li.appendChild(el('span', 'k', p));
    li.appendChild(el('span', 'v', '只存在於 B(Production)'));
    ul.appendChild(li);
  }
  box.appendChild(ul);
}

/* ---------------------------------------------------------------- 下載 */

function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

/* ------------------------------------------------------------------ 主流程 */

(async function main() {
  const [captures, data, settings] = await Promise.all([
    DQA_STORE.getCaptures(), DQA_STORE.getData(), DQA_STORE.getSettings(),
  ]);

  if (!captures.A || !captures.B) {
    $('#head-sub').textContent = '兩側都擷取完才能產生報告。';
    banner('err', '缺少擷取結果:'
      + `${captures.A ? '' : 'A(Storybook)'}${!captures.A && !captures.B ? '、' : ''}${captures.B ? '' : 'B(Production)'}`);
    return;
  }

  renderSides(captures);

  let payload;
  try {
    payload = DQA_CORE.buildPayload(
      { env: captures.A.env, extraction: captures.A.extraction },
      { env: captures.B.env, extraction: captures.B.extraction },
      {
        tokens: data.tokens,
        rubric: data.rubric,
        captureMode: 'extension',
        allowEnvMismatch: settings.allowEnvMismatch,
      }
    );
  } catch (e) {
    $('#head-sub').textContent = '拒絕產出 payload。';
    const details = e.details ? `\n${JSON.stringify(e.details, null, 2)}` : '';
    banner('err', `${e.message}${details}\n\n`
      + '環境不一致時的幾何差異來自環境,不是實作 —— 這種報告只會製造誤報。\n'
      + '請把兩側調到同一個 viewport 寬度與同一個 theme 後重新擷取。');
    return;
  }

  $('#head-sub').textContent =
    `rubric ${payload.meta.rubricVersion}${data.source === 'override' ? '(自訂)' : '(內建 placeholder)'}`
    + `　·　擷取路徑 ${payload.meta.captureMode}`
    + `　·　目標 ${payload.meta.targetPath}`
    + `　·　${fmtTime(payload.meta.generatedAt)}`;

  if (payload.meta.env.warnings.length) {
    banner('warn', '環境不一致但被設定允許放行 —— 以下差異會混進幾何比較,判讀時請自行扣除:\n'
      + JSON.stringify(payload.meta.env.warnings, null, 2));
  }
  if (data.source === 'bundled') {
    banner('warn', 'rubric 與 tokens 仍是內建的 placeholder(docs/TASKS.md 的 T0)。'
      + '換成專案真值之前,違規報告不具說服力 —— 到設定頁貼上真實的 rubric.json 與 tokens。');
  }

  renderMetrics(payload);
  renderViolations(payload);
  renderSkipped(payload);
  renderUnresolved(payload);
  renderStructural(payload);

  const prompt = DQA_CORE.buildPrompt(payload, data.rubric);
  $('#prompt').value = prompt;

  // 端對端測試會讀這裡,確認頁面上顯示的與 core 產出的是同一份
  window.__DQA_REPORT__ = { payload, prompt };

  $('#copy-prompt').addEventListener('click', async () => {
    await navigator.clipboard.writeText(prompt);
    $('#copy-state').textContent = `已複製(${prompt.length.toLocaleString()} 字元)`;
  });
  $('#dl-prompt').addEventListener('click', () =>
    download(`dqa-prompt-${stamp()}.txt`, prompt, 'text/plain'));
  $('#dl-payload').addEventListener('click', () =>
    download(`dqa-payload-${stamp()}.json`, JSON.stringify(payload, null, 2), 'application/json'));
}());
