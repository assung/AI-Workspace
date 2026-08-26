'use strict';

const { buildPayload, envConsistency } = require('../src/core/payload');
const { loadData } = require('../src/node/data');
const { storybook, production } = require('./fixture');

const { tokens, rubric } = loadData();
const payload = buildPayload(storybook, production, { tokens, rubric });

console.log('=== deterministic_violations(已定讞)===');
for (const v of payload.deterministic_violations) {
  console.log(`[${v.severity.padEnd(6)}] ${v.code} @ ${v.node}`);
  console.log(`          證據: ${JSON.stringify(v.evidence)}`);
  console.log(`          依據: ${v.source}`);
}

console.log('\n=== notices(量得到但不定讞,人看的)===');
if (!payload.notices.length) console.log('  (無)');
for (const n of payload.notices) {
  console.log(`  ${n.code} @ ${n.node}　${JSON.stringify(n.evidence)}`);
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
const noticeCodes = payload.notices.map((v) => v.code);
const expected = ['TOKEN-002', 'GESTALT-001', 'ALIGN-001', 'TRUNC-001', 'RENDER-001'];
const missing = expected.filter((c) => !codes.includes(c));

console.log('\n=== 驗收 ===');
for (const c of expected) {
  console.log(`  ${codes.includes(c) ? '✓' : '✗'} ${c}`);
}

// TOKEN-001 的 outcome 是 notice(rubric.json)—— 它必須出現,但不能出現在定讞那一側。
// 這條規則量的是「值有沒有名字」,而對照基準管的是「有沒有同步義務」,不是同一件事。
const tokenNotice = payload.notices.find((n) => n.code === 'TOKEN-001');
console.log(`  ${tokenNotice ? '✓' : '✗'} TOKEN-001 出現在 notices`);
console.log(`  ${!codes.includes('TOKEN-001') ? '✓' : '✗'} TOKEN-001 沒有進 deterministic_violations`);
// 降級的是定不定讞,不是 severity(ADR-004)
console.log(`  ${tokenNotice && tokenNotice.severity === 'medium' ? '✓' : '✗'} TOKEN-001 的 severity 沒有被順手調低`);
if (!tokenNotice || codes.includes('TOKEN-001') || tokenNotice.severity !== 'medium') {
  missing.push('TOKEN-001(notice 分流)');
}
console.log(`  ${noticeCodes.every((c) => c === 'TOKEN-001') ? '✓' : '✗'} notices 只收 outcome = notice 的規則`);

const truncCount = codes.filter((c) => c === 'TRUNC-001').length;
console.log(`  ${truncCount === 1 ? '✓' : '✗'} TRUNC-001 只在 production 側判定一次(未因兩側狀態不同而誤報)`);

const emphasisIsAi = payload.unresolved.some((u) => u.rule === 'EMPHASIS-001');
console.log(`  ${emphasisIsAi ? '✓' : '✗'} EMPHASIS-001 留在 unresolved,未被程式硬判`);

// 兩側樣式差異要進 unresolved,交給 AI 依脈絡判斷(ELEVATION-001 的素材)。
// 這條斷言的存在是因為它曾經靜默消失過:fixture 的 boxShadow 條件本來掛在 groupGap 的值上,
// 調整 gap 就順手拿掉了整條覆蓋,而沒有任何一條斷言會失敗。
const shadowDiff = payload.unresolved.find((u) => u.prop === 'boxShadow');
console.log(`  ${shadowDiff ? '✓' : '✗'} 兩側 boxShadow 差異進 unresolved`);
if (!shadowDiff) missing.push('unresolved: boxShadow');

/* --------------------------------------------- gap 的三個屬性只算一個決定 */

const gapFindings = [...payload.deterministic_violations, ...payload.notices]
  .filter((v) => ['gap', 'rowGap', 'columnGap'].includes((v.evidence || {}).prop));
const onDiv0 = gapFindings.filter((v) => v.node === 'g>div0');
const onDiv1 = gapFindings.filter((v) => v.node === 'g>div1');

console.log(`  ${onDiv0.length === 1 && onDiv0[0].evidence.prop === 'gap' ? '✓' : '✗'} `
  + `兩軸相同 → 合成一筆 gap(不是 gap/rowGap/columnGap 三筆)`
  + `　${onDiv0.map((v) => v.evidence.prop).join(', ')}`);
if (!(onDiv0.length === 1 && onDiv0[0].evidence.prop === 'gap')) missing.push('gap 合成');

// production 的 g>div1 是 row 8 / column 16 —— 合成會把兩個不同的決定壓成一個
const div1Props = onDiv1.map((v) => v.evidence.prop).sort();
const div1Ok = div1Props.length > 0 && !div1Props.includes('gap');
console.log(`  ${div1Ok ? '✓' : '✗'} 兩軸不同 → 各自保留,不合成　${div1Props.join(', ')}`);
if (!div1Ok) missing.push('兩軸不同不可合成');

// gap 簡寫的 computed 在兩軸不同時是 "8px 16px",parseFloat 會安靜地取到 8
const shorthandResolved = payload.nodes.some((n) => n.tokens && n.tokens.gap);
console.log(`  ${!shorthandResolved ? '✓' : '✗'} gap 簡寫沒有被逆映射(它不是單一長度)`);
if (shorthandResolved) missing.push('gap 簡寫被解析');

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
