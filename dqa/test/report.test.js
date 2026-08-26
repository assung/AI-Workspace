'use strict';

/**
 * 報告的分區與合併(T4)。
 *
 * 這一支盯的是三件容易在呈現層出錯、而且錯了不會有人發現的事:
 *   1. 確定性判定與 AI 判定合併排序後,每一列仍看得出出處 —— 兩者可信度不同
 *   2. 沒有 source 的 AI 判定不算數(ADR-007),但也不可以靜默丟掉
 *   3. 模型產生的字串會進 HTML,一律 escape
 */

const { buildReport } = require('../src/core/report');
const { renderReport } = require('../src/node/report-html');
const { buildPayload } = require('../src/core/payload');
const { loadData } = require('../src/node/data');
const { storybook, production } = require('./fixture');

const data = loadData();
const payload = buildPayload(storybook, production, data);

const problems = [];
const check = (cond, label, extra) => {
  if (!cond) problems.push(label);
  console.log(`  ${cond ? '✓' : '✗'} ${label}${extra ? `　${extra}` : ''}`);
};

const EMPHASIS_ID = payload.unresolved.find((u) => u.rule === 'EMPHASIS-001').id;
const SHADOW_ID = payload.unresolved.find((u) => u.prop === 'boxShadow').id;

const ai = {
  meta: { model: 'claude-opus-4-6' },
  problems: [],
  findings: [
    {
      id: EMPHASIS_ID, classification: 'violation', code: 'EMPHASIS-001', severity: 'medium',
      evidence: ['g>div2.emphasis.score = 3.75', 'g>div0>div0>span1.emphasis.score = 1.75'],
    },
    {
      id: SHADOW_ID, classification: 'acceptable', code: 'ELEVATION-001', severity: 'medium',
      evidence: ['g>div0.boxShadow = rgba(0, 0, 0, 0.1) 0px 2px 4px 0px'],
    },
  ],
};

/* ------------------------------------------------------------ 合併與排序 */

console.log('=== 合併與排序 ===');
const report = buildReport(payload, ai, data.rubric);

const sevRank = { high: 0, medium: 1, low: 2, info: 3 };
const ranks = report.violations.map((r) => sevRank[r.severity]);
check(ranks.every((r, i) => i === 0 || ranks[i - 1] <= r),
  '違規依 severity 排序', report.violations.map((r) => r.severity).join(' → '));

const origins = new Set(report.violations.map((r) => r.origin));
check(origins.has('deterministic') && origins.has('ai'),
  '確定性判定與 AI 判定合併在同一份清單', [...origins].join(' + '));
check(report.violations.every((r) => r.origin === 'deterministic' || r.origin === 'ai'),
  '每一列都標了出處 —— 兩者可信度不同,不可混為一談');

const aiRow = report.violations.find((r) => r.origin === 'ai');
check(aiRow && aiRow.source && /^https?:/.test(aiRow.source),
  'AI 判定補回了 rubric 的 source(模型只回 code)', aiRow && aiRow.source.split('/src/')[1]);
check(aiRow && aiRow.evidenceKind === 'lines' && aiRow.evidence.length === 2,
  'AI 的證據是字串陣列,與確定性判定的欄位表分開標記');

const detRow = report.violations.find((r) => r.origin === 'deterministic');
check(detRow && detRow.evidenceKind === 'fields' && typeof detRow.evidence === 'object',
  '確定性判定的證據維持欄位表');

check(report.acceptable.length === 1 && report.acceptable[0].code === 'ELEVATION-001',
  'AI 判為 acceptable 的獨立一區,不混進違規');
check(!report.violations.some((r) => r.code === 'ELEVATION-001'),
  'acceptable 沒有被誤算成違規');
check(report.counts.unanswered === 0, 'unresolved 都被回答了', String(report.counts.unanswered));

/* -------------------------------------------------- 沒有 source 就不算數 */

console.log('\n=== 沒有依據的判定 ===');
const rogue = buildReport(payload, {
  meta: {}, problems: [],
  findings: [{ id: EMPHASIS_ID, classification: 'violation', code: 'GHOST-001', severity: 'high', evidence: ['x'] }],
}, data.rubric);
check(!rogue.violations.some((r) => r.code === 'GHOST-001'),
  'rubric 裡沒有的 code 不進違規清單(ADR-007)');
check(rogue.problems.some((p) => /GHOST-001/.test(p)),
  '但也不靜默丟掉 —— 進 problems 讓人看到', rogue.problems[0]);

/* ------------------------------------------------ unclassified 是指標 */

console.log('\n=== unclassified ===');
const unc = buildReport(payload, {
  meta: {}, problems: [],
  findings: [{ id: EMPHASIS_ID, classification: 'unclassified', code: null, severity: null, evidence: [] }],
}, data.rubric);
check(unc.counts.unclassified === 1, 'unclassified 單獨計數(T5 要盯的比例)');
check(!unc.violations.some((r) => r.origin === 'ai'), 'unclassified 不算違規');

/* --------------------------------------------------------------- HTML */

console.log('\n=== HTML 輸出 ===');
const html = renderReport(report);
check(/<a class="src" href="https/.test(html),
  'source 是可以點的連結(T4 驗收:3 秒內點到 spec 依據)');
check(html.includes('程式判') && html.includes('AI 判'), 'HTML 上看得出每一列的出處');

// 模型輸出會進 HTML —— 它不該有機會變成標記
const xss = buildReport(payload, {
  meta: {}, problems: [],
  findings: [{
    id: EMPHASIS_ID, classification: 'violation', code: 'EMPHASIS-001', severity: 'medium',
    evidence: ['<img src=x onerror="alert(1)">'],
  }],
}, data.rubric);
const xssHtml = renderReport(xss);
check(!/<img src=x/.test(xssHtml) && xssHtml.includes('&lt;img src=x'),
  '模型產生的字串被 escape,不會變成標記');

const noAi = renderReport(buildReport(payload, null, data.rubric));
check(noAi.includes('AI 分類尚未執行'), '沒接 AI 時報告明說,而不是看起來像沒問題');

if (problems.length) {
  console.error(`\n${problems.length} 項失敗。`);
  process.exit(1);
}
console.log('\n報告輸出全部正確。');
