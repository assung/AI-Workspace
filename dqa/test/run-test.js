'use strict';

const { buildPayload, envConsistency } = require('../src/core/payload');
const { loadData } = require('../src/node/data');
const { storybook, production } = require('./fixture');

const { tokens, rubric } = loadData();
const payload = buildPayload(storybook, production, { tokens, rubric });

console.log('=== deterministic_violations ===');
for (const v of payload.deterministic_violations) {
  console.log(`[${v.severity.padEnd(6)}] ${v.code} @ ${v.node}`);
  console.log(`          證據: ${JSON.stringify(v.evidence)}`);
  console.log(`          依據: ${v.source}`);
}

console.log('\n=== skipped_checks(量不到,誠實跳過) ===');
if (!payload.skipped_checks.length) console.log('  (無)');
for (const s of payload.skipped_checks) console.log(`  ${s.code} ← ${s.reason} @ ${s.node}`);

console.log('\n=== unresolved(AI 的作業範圍) ===');
for (const u of payload.unresolved) {
  console.log(`  ${u.id}${u.prop ? `  sb=${u.sb}  prod=${u.prod}` : ''}`);
}

console.log('\n=== emphasis facts(事實層,不下判斷) ===');
for (const n of payload.nodes) {
  if (n.emphasis) {
    console.log(`  ${n.path.padEnd(20)} score=${n.emphasis.score}  heading=${n.emphasis.isHeading}  contrast=${n.emphasis.contrastVsBg}`);
  }
}

/* ------------------------------------------------------------- assertions */

const codes = payload.deterministic_violations.map((v) => v.code);
const expected = ['TOKEN-001', 'TOKEN-002', 'GESTALT-001', 'ALIGN-001', 'TRUNC-001', 'RENDER-001'];
const missing = expected.filter((c) => !codes.includes(c));

console.log('\n=== 驗收 ===');
for (const c of expected) {
  console.log(`  ${codes.includes(c) ? '✓' : '✗'} ${c}`);
}

const truncCount = codes.filter((c) => c === 'TRUNC-001').length;
console.log(`  ${truncCount === 1 ? '✓' : '✗'} TRUNC-001 只在 production 側判定一次(未因兩側狀態不同而誤報)`);

const emphasisIsAi = payload.unresolved.some((u) => u.rule === 'EMPHASIS-001');
console.log(`  ${emphasisIsAi ? '✓' : '✗'} EMPHASIS-001 留在 unresolved,未被程式硬判`);

const nodesSent = payload.nodes.length > 0 && payload.nodes_storybook.length > 0;
console.log(`  ${nodesSent ? '✓' : '✗'} 完整鄰域脈絡照送(nodes ${payload.nodes.length} 筆)`);

/* ------------------------------------------------------------- 環境鎖 */

const baseEnv = (theme) => ({ viewportWidth: 1280, dpr: 1, theme });
const envCases = [
  {
    name: 'density 兩側都宣告且不同 → 擋下',
    sb: baseEnv({ 'data-theme': 'light', 'data-density': 'md' }),
    prod: baseEnv({ 'data-theme': 'light', 'data-density': 'lg' }),
    expect: 'ENV_DENSITY_MISMATCH',
  },
  {
    name: 'density 兩側相同 → 放行',
    sb: baseEnv({ 'data-theme': 'light', 'data-density': 'md' }),
    prod: baseEnv({ 'data-theme': 'light', 'data-density': 'md' }),
    expect: null,
  },
  {
    name: 'production 沒宣告 density → 量不到,不猜預設值(ADR-006)',
    sb: baseEnv({ 'data-theme': 'light', 'data-density': 'md' }),
    prod: baseEnv({ 'data-theme': 'light' }),
    expect: null,
  },
];

console.log('\n=== 環境鎖 ===');
let envFailed = 0;
for (const c of envCases) {
  const errs = envConsistency(c.sb, c.prod);
  const got = errs.length ? errs[0].code : null;
  const ok = got === c.expect;
  if (!ok) envFailed += 1;
  console.log(`  ${ok ? '✓' : '✗'} ${c.name.padEnd(46)} ${got || '(無)'}`);
}

if (envFailed) {
  console.error(`\n環境鎖 ${envFailed} 項失敗。`);
  process.exit(1);
}

if (missing.length) {
  console.error(`\n漏抓: ${missing.join(', ')}`);
  process.exit(1);
}
console.log('\n全部通過。');
