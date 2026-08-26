'use strict';

/**
 * 色彩量測的兩個正確性問題(2026-08,接上 @qijenchen/design-system 時發現):
 *
 *  1. DS 的色票是 oklch,Chromium 的 computed value 保留 oklch 不轉 rgb。
 *     正規化在 `src/browser/extract.js` 用 canvas 完成,這裡驗的是它下游的結果 ——
 *     `rgba(...)` 進得了 rgbToHex,alpha 也留得住。
 *  2. DS 的 `--foreground` 是 85% 黑,不是純黑。對比度必須先把前景 alpha
 *     合成到有效背景上再算,否則會算出「純黑 on 白 = 21:1」這種實際看不到的數字。
 *
 * 這兩條在 placeholder 資料下都測不出來(那些色都不透明),所以要獨立一支測試。
 */

const { rgbToHex, TokenResolver } = require('../src/core/tokens');
const { blend, contrastRatio, RubricEngine } = require('../src/core/rubric-engine');
const { loadData } = require('../src/node/data');

const { tokens, rubric } = loadData();
const problems = [];
const near = (a, b, tol) => a != null && Math.abs(a - b) <= tol;
const check = (cond, label, extra) => {
  if (!cond) problems.push(label);
  console.log(`  ${cond ? '✓' : '✗'} ${label}${extra ? `　${extra}` : ''}`);
};

/* ------------------------------------------------- 正規化後的值進得了逆映射 */

console.log('=== 正規化輸出 → rgbToHex ===');
// extract.js 對 oklch(0 0 0 / 0.85) 正規化後送出的就是這個字串(alpha 217/255)
const withAlpha = rgbToHex('rgba(0, 0, 0, 0.851)');
check(withAlpha && withAlpha.hex === '#000000' && near(withAlpha.alpha, 0.851, 0.001),
  '帶 alpha 的正規化值保留 hex 與 alpha', JSON.stringify(withAlpha));

const opaque = rgbToHex('rgb(0, 101, 234)');
check(opaque === '#0065ea', '不透明的正規化值直接得 hex', String(opaque));

check(rgbToHex('oklch(0.54 0.22 258)') === null,
  '未正規化的 oklch 仍然回 null(正規化沒做的話就是這個結果)');

/* ------------------------------------------ alpha 必須參與 token 逆映射 */

console.log('\n=== alpha-aware 逆映射 ===');
const resolver = new TokenResolver({ tokens });

// @qijenchen/design-system 的整條 neutral scale 是「黑色 + 不同 alpha」,
// 九個 token 的 hex 全都是 #000000。只用 6 碼 hex 查表等於把九個壓成一個。
const fg = resolver.resolveColor('rgba(0, 0, 0, 0.851)');     // --foreground = 85% 黑
const fgSecondary = resolver.resolveColor('rgba(0, 0, 0, 0.651)'); // 65% 黑
check(!!fg && !!fg.token, '85% 黑命中 token', fg ? `${fg.token} ${fg.hex} α=${fg.alpha}` : '(無)');
check(!!fgSecondary && !!fgSecondary.token, '65% 黑命中 token',
  fgSecondary ? `${fgSecondary.token} ${fgSecondary.hex}` : '(無)');
check(!!fg && !!fgSecondary && fg.token !== fgSecondary.token,
  '同一個 hex、不同 alpha → 不同 token(6 碼查表會把它們合併)',
  fg && fgSecondary ? `${fg.token} ≠ ${fgSecondary.token}` : '');
check(!!fg && fg.exact === true, '精確命中(含 alpha)算 exact');

const notInScale = resolver.resolveColor('rgba(0, 0, 0, 0.5)');
check(!!notInScale && notInScale.token === null && near(notInScale.alpha, 0.5, 0.001),
  'scale 裡沒有的 alpha → token 為 null,不退回同 hex 的其他 alpha',
  notInScale ? String(notInScale.token) : '');

const opaqueToken = resolver.resolveColor('rgb(0, 101, 234)');
check(!!opaqueToken && !!opaqueToken.token, '不透明色照樣命中',
  opaqueToken ? `${opaqueToken.token} ${opaqueToken.hex}` : '');

/* --------------------------------------------------------- alpha 合成 */

console.log('\n=== 前景 alpha 合成 ===');
const composited = blend({ hex: '#000000', alpha: 0.851 }, '#ffffff');
check(composited === '#262626', 'DS 的 --foreground(85% 黑)on 白 → #262626', composited);

const crComposited = contrastRatio(composited, '#ffffff');
const crNaive = contrastRatio('#000000', '#ffffff');
check(near(crComposited, 15.1, 0.3), '合成後的對比度落在 15:1 附近', String(crComposited));
check(crNaive === 21, '不合成會算成 21:1 —— 這就是 bug 的樣子', String(crNaive));

check(blend({ hex: '#0065ea', alpha: 1 }, '#ffffff') === '#0065ea',
  'alpha = 1 時原樣通過,不做無謂運算');

/* ------------------------------------- 有效背景:半透明背景層要疊回去 */

console.log('\n=== 有效背景堆疊 ===');
// Notion 風格的側欄:不透明白底 → 半透明 hover 底 → 文字
const extraction = {
  nodes: [
    { path: 'g', tag: 'div', role: null, order: 0, box: [0, 0, 240, 400], baselineY: null,
      style: { backgroundColor: 'rgb(255, 255, 255)' }, text: null },
    { path: 'g>div0', tag: 'div', role: null, order: 0, box: [0, 0, 240, 32], baselineY: null,
      style: { backgroundColor: 'rgba(0, 0, 0, 0.06)' }, text: null },
    { path: 'g>div0>span0', tag: 'span', role: null, order: 0, box: [8, 6, 120, 20], baselineY: 20,
      style: { color: 'rgba(0, 0, 0, 0.851)', fontSize: '14px', fontWeight: '400' },
      text: { chars: 8, lineHeightPx: 20 } },
  ],
};
resolver.annotate(extraction);
new RubricEngine({ rubric }).annotateEmphasis(extraction);

const leaf = extraction.nodes.find((n) => n.path === 'g>div0>span0');
check(leaf.emphasis !== null, 'emphasis 不再是 null(oklch 時代的失效點)');
check(leaf.emphasis && leaf.emphasis.bgEffective === '#f0f0f0',
  '半透明 hover 底疊到白底 → #f0f0f0', leaf.emphasis && leaf.emphasis.bgEffective);
check(leaf.emphasis && leaf.emphasis.fgEffective === '#242424',
  '前景 85% 黑再疊到那個底 → #242424', leaf.emphasis && leaf.emphasis.fgEffective);
check(leaf.emphasis && near(leaf.emphasis.contrastVsBg, 13.4, 0.5),
  '對比度以合成後的兩色計算', leaf.emphasis && String(leaf.emphasis.contrastVsBg));

if (problems.length) {
  console.error(`\n${problems.length} 項失敗。`);
  process.exit(1);
}
console.log('\n色彩量測全部正確。');
