'use strict';

/**
 * spacing 逆映射的 density 相依性(ADR-019)。
 *
 * 對照基準 @qijenchen/design-system 沒有數字階梯的 spacing scale,
 * 它的 layout space token 隨 density 整組換值:
 *
 *   --layout-space-loose   md 16px   lg 24px
 *   --layout-space-tight   md 12px   lg 16px
 *
 * 於是「16px 是哪個 token」在不知道 density 的情況下有**兩個**答案。
 * 這支測試盯的就是:知道 density 時答對,不知道時誠實跳過、不亂猜。
 */

const { TokenResolver } = require('../src/core/tokens');
const { RubricEngine } = require('../src/core/rubric-engine');
const { loadData } = require('../src/node/data');

const { tokens, rubric } = loadData();
const resolver = new TokenResolver({ tokens });

const problems = [];
const check = (cond, label, extra) => {
  if (!cond) problems.push(label);
  console.log(`  ${cond ? '✓' : '✗'} ${label}${extra ? `　${extra}` : ''}`);
};

/* ------------------------------------------------ 同一個 px,不同 density */

console.log('=== 同一個值在不同 density 下是不同 token ===');
const md16 = resolver.resolveSpacing('16px', 'md');
const lg16 = resolver.resolveSpacing('16px', 'lg');
check(md16.token === 'layout-space-loose', 'md 的 16px = layout-space-loose', md16.token);
check(lg16.token === 'layout-space-tight', 'lg 的 16px = layout-space-tight', lg16.token);
check(md16.token !== lg16.token,
  '沒有 density 就答不出來 —— 這正是要吃 density 參數的理由');

const md12 = resolver.resolveSpacing('12px', 'md');
const lg12 = resolver.resolveSpacing('12px', 'lg');
check(md12.token === 'layout-space-tight', 'md 的 12px = layout-space-tight', md12.token);
check(lg12.token === null, 'lg 沒有 12px 這個值 → 不在 token 定義裡',
  `nearest=${lg12.nearest} delta=${lg12.delta}`);

const md48 = resolver.resolveSpacing('48px', 'md');
const lg48 = resolver.resolveSpacing('48px', 'lg');
check(md48.token === 'layout-space-bottom' && lg48.token === 'layout-space-bottom',
  '不隨 density 變的 token 兩邊都對得上', `${md48.token}`);

/* ------------------------------------------------------ density 不明 */

console.log('\n=== density 不明時不猜 ===');
const unknown = resolver.resolveSpacing('16px', null);
check(unknown.skip === 'DENSITY_UNKNOWN', 'density 為 null → skip,不回傳猜測值', unknown.skip);
check(unknown.token === null && unknown.nearest === null,
  '不給 nearest —— 連「最接近哪個」都取決於 density');

const bogus = resolver.resolveSpacing('16px', 'xl');
check(bogus.skip === 'DENSITY_NOT_IN_SCALE',
  'scale 裡沒有的 density → 一樣是量不到,不是「沒有 token」', bogus.skip);

/* ------------------------------- 節點自帶的 density 蓋過文件層級的 */

console.log('\n=== subtree 覆寫 ===');
const extraction = {
  nodes: [
    { path: 'g', style: { gap: '16px' }, density: null },
    { path: 'g>div0', style: { gap: '16px' }, density: 'lg' },
  ],
};
resolver.annotate(extraction, 'md');
const [root, inner] = extraction.nodes;
check(root.tokens.gap.token === 'layout-space-loose',
  '沒有自帶 density 的節點退回文件層級(md)', root.tokens.gap.token);
check(inner.tokens.gap.token === 'layout-space-tight',
  '自帶 density 的節點用自己的(lg)—— DS 明文支援 subtree 覆寫', inner.tokens.gap.token);

/* ----------------------------------------- 引擎:skip 要進 skipped_checks */

console.log('\n=== 引擎分流 ===');
const engine = new RubricEngine({ rubric });

const noDensity = {
  parentPath: 'g>div0', rootPath: 'g',
  nodes: [{ path: 'g>div0>div0', order: 0, box: [0, 0, 10, 10], baselineY: null,
    style: { paddingTop: '13px' }, text: null, density: null }],
};
resolver.annotate(noDensity, null);
const r1 = engine.evaluateSingleSide(noDensity);
check(r1.notices.length === 0, 'density 不明時不報 TOKEN-001 —— 那會把合法值說成魔術數字');
check(r1.skipped.some((x) => x.code === 'TOKEN-001' && /DENSITY_UNKNOWN/.test(x.reason)),
  'density 不明進 skipped_checks',
  (r1.skipped.find((x) => x.code === 'TOKEN-001') || {}).reason);

const withDensity = {
  parentPath: 'g>div0', rootPath: 'g',
  nodes: [{ path: 'g>div0>div0', order: 0, box: [0, 0, 10, 10], baselineY: null,
    style: { paddingTop: '13px' }, text: null, density: 'md' }],
};
resolver.annotate(withDensity, null);
const r2 = engine.evaluateSingleSide(withDensity);
check(r2.notices.some((n) => n.code === 'TOKEN-001'), 'density 已知時照常出提示');
check(!r2.skipped.some((x) => x.code === 'TOKEN-001'), '已知 density 就不該進 skipped');

/* ------------------------------- 0px 的可觀測性(不是語意判斷) */

console.log('\n=== 0px 分不分得出是決定 ===');
const zeros = {
  parentPath: 'g>div0', rootPath: 'g',
  nodes: [{
    path: 'g>div0>div0', order: 0, box: [0, 0, 10, 10], baselineY: null, text: null, density: 'md',
    // margin/padding 的 0px = 沒設定;gap 沒設定時 computed 是 `normal`,所以 0px 是決定
    style: { marginTop: '0px', paddingLeft: '0px', gap: '0px' },
  }],
};
resolver.annotate(zeros, null);
const r3 = engine.evaluateSingleSide(zeros);
const zeroProps = r3.notices.filter((n) => n.code === 'TOKEN-001').map((n) => n.evidence.prop);
check(!zeroProps.includes('marginTop') && !zeroProps.includes('paddingLeft'),
  'margin / padding 的 0px 不報 —— 跟「沒設定」的 computed value 相同',
  JSON.stringify(zeroProps));
check(zeroProps.includes('gap'),
  'gap 的 0px 照報 —— 沒設定時 computed 是 normal,寫 0 是看得見的決定');
check(!r3.skipped.some((x) => x.prop === 'marginTop'),
  '排除的 0px 也不進 skipped_checks(規則不適用 ≠ 量不到)');

const pairs = [{
  path: 'g', prop: 'gap',
  sb: resolver.resolveSpacing('16px', null),
  prod: resolver.resolveSpacing('12px', 'md'),
}];
const cmp = engine.evaluateComparative(pairs);
check(cmp.violations.length === 0 && cmp.skipped.some((x) => x.code === 'TOKEN-002'),
  '任一側 density 不明 → TOKEN-002 整組跳過,不拿半邊去比',
  (cmp.skipped[0] || {}).reason);

if (problems.length) {
  console.error(`\n${problems.length} 項失敗。`);
  process.exit(1);
}
console.log('\ndensity 相依的逆映射全部正確。');
