'use strict';

/**
 * 把報告模型渲染成一份自足的 HTML —— CLI 這條路徑的產出。
 *
 * 為什麼不跟擴充套件共用渲染:那邊是 DOM,這邊是字串,真的是不同的事。
 * 共用的是**分區與排序**(`src/core/report.js`),那才是會分岔出問題的部分。
 *
 * 安全性:findings 的 evidence 是模型產生的字串,一律 escape。
 * 這份 HTML 會被人在瀏覽器裡打開,模型輸出不該有機會變成標記。
 */

const fs = require('fs');
const path = require('path');

const { buildReport } = require('../core/report');
const { loadData } = require('./data');

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const ORIGIN_LABEL = {
  deterministic: { text: '程式判', title: '確定性規則,100% 可複現,AI 不得推翻' },
  ai: { text: 'AI 判', title: '門檻不存在於任何 spec,由模型依鄰域脈絡判斷' },
  notice: { text: '提示', title: '量得到但不足以定讞,交給人' },
};

function sourceLink(source) {
  if (!source) return '';
  const isUrl = /^https?:\/\//.test(source);
  return isUrl
    ? `<a class="src" href="${esc(source)}" target="_blank" rel="noreferrer">依據:${esc(source)}</a>`
    : `<span class="src">依據:${esc(source)}</span>`;
}

function evidenceHtml(row) {
  if (row.evidenceKind === 'lines') {
    if (!row.evidence.length) return '';
    return `<ul class="ev">${row.evidence.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>`;
  }
  const entries = Object.entries(row.evidence || {});
  if (!entries.length) return '';
  return `<table class="ev">${entries.map(([k, v]) => {
    const value = typeof v === 'object' ? JSON.stringify(v) : String(v);
    return `<tr><td>${esc(k)}</td><td>${esc(value)}</td></tr>`;
  }).join('')}</table>`;
}

function rowHtml(row) {
  const origin = ORIGIN_LABEL[row.origin] || ORIGIN_LABEL.deterministic;
  return `<article class="finding sev-${esc(row.severity)}">
  <header>
    <span class="code">${esc(row.code)}</span>
    <span class="sev">${esc(row.severity)}</span>
    <span class="origin" title="${esc(origin.title)}">${esc(origin.text)}</span>
    <span class="node">${esc(row.node)}</span>
  </header>
  ${row.description ? `<p class="desc">${esc(row.description)}</p>` : ''}
  ${evidenceHtml(row)}
  ${sourceLink(row.source)}
</article>`;
}

function section(title, count, note, body, empty) {
  return `<section>
  <h2>${esc(title)} <span class="count">${count}</span></h2>
  ${note ? `<p class="note">${note}</p>` : ''}
  ${count ? body : `<p class="empty">${esc(empty)}</p>`}
</section>`;
}

function listSection(title, count, note, rows, empty) {
  return section(title, count, note, rows.map(rowHtml).join('\n'), empty);
}

const CSS = `
:root{--text:#172b4d;--subtle:#626f86;--border:#dcdfe4;--bg:#fff;--sunken:#f7f8f9;
--high:#ae2e24;--medium:#a54800;--low:#206a83;--info:#626f86;--link:#0c66e4}
*{box-sizing:border-box}
body{margin:0;padding:0 0 64px;background:var(--sunken);color:var(--text);
font:14px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans TC",sans-serif}
.wrap{max-width:1040px;margin:0 auto;padding:0 24px}
header.top{background:var(--bg);border-bottom:1px solid var(--border);padding:22px 0 18px;margin-bottom:24px}
h1{margin:0 0 4px;font-size:20px}
.sub{color:var(--subtle);font-size:12px}
.metrics{display:flex;gap:20px;flex-wrap:wrap;margin-top:12px}
.metric .n{font-size:22px;font-weight:600}
.metric .l{font-size:11px;color:var(--subtle);text-transform:uppercase;letter-spacing:.05em}
section{background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:18px 20px;margin-bottom:18px}
section>h2{margin:0 0 4px;font-size:15px;display:flex;align-items:center;gap:8px}
.count{font-size:11px;font-weight:600;background:var(--sunken);border:1px solid var(--border);
border-radius:10px;padding:1px 8px;color:var(--subtle)}
.note{color:var(--subtle);font-size:12px;margin:0 0 14px}
.empty{color:var(--subtle);font-size:13px;margin:0}
.finding{border:1px solid var(--border);border-left:4px solid var(--info);border-radius:6px;
padding:12px 14px;margin-bottom:10px}
.sev-high{border-left-color:var(--high)}.sev-medium{border-left-color:var(--medium)}
.sev-low{border-left-color:var(--low)}.sev-info{border-left-color:var(--info)}
.finding header{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.code{font-weight:700;letter-spacing:.02em}
.sev,.origin{font-size:11px;font-weight:600;padding:1px 8px;border-radius:10px;letter-spacing:.04em}
.sev-high .sev{background:#ffecea;color:var(--high)}.sev-medium .sev{background:#fff7d6;color:var(--medium)}
.sev-low .sev{background:#e7f3f8;color:var(--low)}.sev-info .sev{background:var(--sunken);color:var(--info)}
.origin{background:#e9f2ff;color:var(--link);cursor:help}
.node,.ev{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px}
.node{color:var(--subtle)}
.desc{margin:6px 0 8px}
table.ev{border-collapse:collapse;margin-top:6px}
table.ev td{padding:2px 14px 2px 0;vertical-align:top}
table.ev td:first-child{color:var(--subtle)}
ul.ev{margin:6px 0 8px;padding-left:18px}
.src{display:block;margin-top:8px;font-size:12px;color:var(--link);text-decoration:none;word-break:break-all}
a.src:hover{text-decoration:underline}
.banner{border-radius:6px;padding:12px 14px;margin-bottom:18px;font-size:13px;border:1px solid;white-space:pre-wrap}
.banner.warn{background:#fff7d6;border-color:#f5e08a;color:var(--medium)}
ul.plain{list-style:none;padding:0;margin:0}
ul.plain li{padding:7px 0;border-bottom:1px solid var(--border);font-size:13px;display:flex;gap:12px;align-items:baseline}
ul.plain li:last-child{border-bottom:0}
ul.plain li .k{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px}
ul.plain li .v{color:var(--subtle);font-size:12px}
`;

function renderReport(report) {
  const c = report.counts;
  const metrics = [
    ['違規', c.violations], ['high', c.high], ['提示', c.notices],
    ['unclassified', c.unclassified], ['跳過', c.skipped], ['鄰域節點', c.nodes],
  ];

  const banners = [];
  if (!report.meta.aiApplied) {
    banners.push('AI 分類尚未執行 —— 這份報告只有確定性判定。'
      + '跑 npm run llm:classify 之後重新產生,才會有 EMPHASIS / ELEVATION 這類需要脈絡的判斷。');
  }
  if (report.meta.ai && report.meta.ai.degraded) banners.push(report.meta.ai.degraded);
  if (report.problems.length) {
    banners.push(`AI 輸出有 ${report.problems.length} 項不合約:\n・${report.problems.join('\n・')}`);
  }
  if (c.unanswered && report.meta.aiApplied) {
    banners.push(`${c.unanswered} 個 unresolved 項目沒有被回答。`);
  }

  return `<!doctype html>
<html lang="zh-Hant"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>DQA 報告</title><style>${CSS}</style></head><body>
<header class="top"><div class="wrap">
  <h1>DQA 報告</h1>
  <div class="sub">rubric ${esc(report.meta.rubricVersion)}　·　擷取路徑 ${esc(report.meta.captureMode)}
　·　目標 ${esc(report.meta.targetPath)}　·　${esc(report.meta.generatedAt)}
${report.meta.ai ? `　·　AI ${esc(report.meta.ai.model)}` : ''}</div>
  <div class="metrics">${metrics.map(([l, n]) =>
    `<div class="metric"><div class="n">${n}</div><div class="l">${esc(l)}</div></div>`).join('')}</div>
</div></header>
<div class="wrap">
${banners.map((b) => `<div class="banner warn">${esc(b)}</div>`).join('\n')}

${listSection('違規', c.violations,
    '程式判定的既定事實與 AI 依脈絡下的判斷,依 severity 合併排序。'
    + '每一列的「程式判 / AI 判」標記說明它的來源 —— 兩者可信度不同,不要混為一談。',
    report.violations, '沒有違規。')}

${listSection('提示', c.notices,
    '量得到但依 spec 不必然構成問題,不定讞也不交給 AI。severity 表達的是「若確認成立有多嚴重」。',
    report.notices, '沒有提示。')}

${listSection('AI 判定為可接受', c.acceptable,
    'AI 看過而且認為沒問題的項目。列出來是為了讓「AI 到底有沒有看」這件事可稽核。',
    report.acceptable, report.meta.aiApplied ? '沒有。' : 'AI 尚未執行。')}

${section('unclassified', c.unclassified,
    '找不到對應 rubric 規則的差異。這一區的**比例**是第一週要盯的指標:'
    + '接近 0 要抽驗 rubric 的 condition 是不是太寬;超過一半代表 rubric 覆蓋不足。',
    `<ul class="plain">${report.unclassified.map((r) =>
      `<li><span class="k">${esc(r.node)}</span></li>`).join('')}</ul>`,
    report.meta.aiApplied ? '沒有無法分類的項目。' : 'AI 尚未執行。')}

${section('跳過的檢查', c.skipped,
    '量不到就說量不到。這一區佔比過高代表規則的實際覆蓋遠小於預期 —— 該做的是重估規則價值,不是放寬 guard。',
    `<ul class="plain">${report.skipped.map((s) =>
      `<li><span class="k">${esc(s.code)}</span><span class="v">${esc(s.reason)}</span>`
      + `<span class="k">${esc(s.node || '')}</span></li>`).join('')}</ul>`,
    '沒有跳過的檢查。')}

${section('結構差異',
    report.structural.onlySb.length + report.structural.onlyProd.length,
    '兩側配不到的 structural path。出現在這裡本身就是訊號。',
    `<ul class="plain">${[
      ...report.structural.onlySb.map((p) => [p, '只存在於 A(Storybook)']),
      ...report.structural.onlyProd.map((p) => [p, '只存在於 B(Production)']),
    ].map(([p, v]) => `<li><span class="k">${esc(p)}</span><span class="v">${esc(v)}</span></li>`).join('')}</ul>`,
    '兩側節點完全配對。')}
</div></body></html>
`;
}

/* ------------------------------------------------------------------ CLI */

function main(argv) {
  const [payloadPath, ...rest] = argv;
  if (!payloadPath) {
    throw new Error('用法: node src/node/report-html.js <payload.json> [findings.json] [out.html]');
  }
  const findingsPath = rest.find((a) => a.endsWith('.json')) || null;
  const outPath = rest.find((a) => a.endsWith('.html')) || null;

  const payload = JSON.parse(fs.readFileSync(payloadPath, 'utf8'));
  const ai = findingsPath ? JSON.parse(fs.readFileSync(findingsPath, 'utf8')) : null;
  const { rubric } = loadData();

  const html = renderReport(buildReport(payload, ai, rubric));
  if (outPath) {
    fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
    fs.writeFileSync(outPath, html);
    console.log(`寫入 ${outPath}`);
  } else {
    process.stdout.write(html);
  }
}

if (require.main === module) {
  try { main(process.argv.slice(2)); } catch (e) { console.error(e.message); process.exit(1); }
}

module.exports = { renderReport, esc };
