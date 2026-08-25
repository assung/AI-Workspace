'use strict';

/**
 * gap 採集 guard 的邊界驗證(ADR-006)
 * 這些案例全部必須 SKIP —— 任何一個開始回傳數字,就是有人放寬了 guard。
 */

const { collectGaps } = require('../src/core/rubric-engine');

const kid = (y, h, position = 'static') => ({
  box: [0, y, 400, h], order: 0, style: { position },
});

const cases = [
  {
    name: 'flex column — Jira property 群組',
    parent: { style: { display: 'flex', flexDirection: 'column' } },
    kids: [kid(0, 24), kid(36, 24)],
    expect: { gaps: [12] },
  },
  {
    name: 'block flow — margin collapse 不可解',
    parent: { style: { display: 'block' } },
    kids: [kid(0, 24), kid(36, 24)],
    expect: { skip: 'BLOCK_FLOW_NOT_MEASURABLE' },
  },
  {
    name: 'inline-grid — Stripe table cell',
    parent: { style: { display: 'inline-grid' } },
    kids: [kid(0, 24), kid(40, 24)],
    expect: { gaps: [16] },
  },
  {
    name: 'absolute 子節點脫離文件流',
    parent: { style: { display: 'flex', flexDirection: 'column' } },
    kids: [kid(0, 24), kid(36, 24, 'absolute')],
    expect: { skip: 'CHILD_OUT_OF_FLOW' },
  },
  {
    name: 'flex wrap 換行 — 一維相減無意義',
    parent: { style: { display: 'flex', flexDirection: 'row', flexWrap: 'wrap' } },
    kids: [
      { box: [0, 0, 100, 24], order: 0, style: { position: 'static' } },
      { box: [0, 32, 100, 24], order: 1, style: { position: 'static' } },
    ],
    expect: { skip: 'FLEX_WRAPPED' },
  },
  {
    name: 'sibling 重疊 — 負間距不是間距',
    parent: { style: { display: 'flex', flexDirection: 'column' } },
    kids: [kid(0, 40), kid(20, 24)],
    expect: { skip: 'OVERLAPPING_SIBLINGS' },
  },
  {
    name: '只有一個 child',
    parent: { style: { display: 'flex', flexDirection: 'column' } },
    kids: [kid(0, 24)],
    expect: { skip: 'INSUFFICIENT_CHILDREN' },
  },
];

let failed = 0;
for (const c of cases) {
  const r = collectGaps(c.parent, c.kids);
  const ok = c.expect.skip
    ? r.gaps === null && r.skip === c.expect.skip
    : JSON.stringify(r.gaps) === JSON.stringify(c.expect.gaps);
  if (!ok) failed += 1;
  const actual = r.gaps ? `gaps=${JSON.stringify(r.gaps)}` : `SKIP → ${r.skip}`;
  console.log(`  ${ok ? '✓' : '✗'} ${c.name.padEnd(34)} ${actual}`);
}

if (failed) {
  console.error(`\n${failed} 項失敗。動手修之前先讀 docs/DECISIONS.md 的 ADR-006。`);
  process.exit(1);
}
console.log('\nguard 全部正確,沒有任何一個硬算出數字。');
