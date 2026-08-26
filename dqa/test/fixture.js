'use strict';

/**
 * Fixture:Jira issue detail 的 property list 鄰域
 *
 *   g            = property list      (flex column)
 *   g>div0       = Assignee 群組  (P)  (flex column)
 *   g>div0>div0  = 目標列         (T)  (flex row) → label + value
 *   g>div1,div2  = 其他群組 / 標題
 *
 * 埋入的五個已知 bug:
 *   ① TOKEN-001  label paddingTop = 13px(不在 token 定義裡;outcome=notice,不定讞)
 *   ② TOKEN-002  群組 gap:Storybook layout-space-loose / production layout-space-tight
 *   ③ GESTALT-001 群組內 gap(12)未小於群組間 gap(12)
 *   ④ ALIGN-001  label 與 value baseline 差 2px
 *   ⑤ TRUNC-001  value 文字截斷且無 tooltip
 *   另加 RENDER-001 誘餌:paddingLeft 16 vs 16.4(同 token,應判為 info)
 *
 * spacing token 的值隨 density 改變(md 的 loose 16px = lg 的 tight 16px),
 * 所以 env 必須宣告 density,否則逆映射不成立、整組會進 skipped_checks。
 */

const text = (over = {}) => ({
  chars: 18,
  measuredWidth: 120,
  availWidth: 200,
  lines: 1,
  overflowX: 0,
  truncated: false,
  hasAffordance: false,
  fontHash: 'h1a2b3c4d',
  ascent: 13.2,
  descent: 3.4,
  lineHeightPx: 20,
  ...over,
});

const env = (over = {}) => ({
  viewportWidth: 1280,
  viewportHeight: 900,
  dpr: 1,
  visualScale: 1,
  theme: { 'data-theme': 'light', 'data-density': 'md', 'prefers-color-scheme': 'light' },
  ua: 'Chrome/x',
  ...over,
});

function nodes({ groupGap, labelPaddingTop, labelPaddingLeft, valueBaseline, truncated, elevated }) {
  return [
    {
      path: 'g', tag: 'div', role: null,
      box: [0, 0, 400, 204], baselineY: null, order: 0,
      style: { display: 'flex', flexDirection: 'column', gap: '12px', position: 'static' },
      text: null,
    },
    {
      path: 'g>div0', tag: 'div', role: null,
      box: [0, 0, 400, 60], baselineY: null, order: 0,
      style: {
        display: 'flex', flexDirection: 'column', gap: `${groupGap}px`, position: 'static',
        // 明確參數,不要掛在 groupGap 的值上 —— 那種耦合會在調整 gap 時
        // 靜默拿掉 ELEVATION-001 的測試覆蓋,而且沒有任何一條斷言會失敗
        boxShadow: elevated ? 'rgba(0, 0, 0, 0.1) 0px 2px 4px 0px' : 'none',
      },
      text: null,
    },
    {
      path: 'g>div0>div0', tag: 'div', role: null,
      box: [0, 0, 400, 24], baselineY: null, order: 0,
      style: { display: 'flex', flexDirection: 'row', gap: '12px', position: 'static' },
      text: null,
    },
    {
      path: 'g>div0>div0>span0', tag: 'span', role: null,
      box: [0, 0, 120, 20], baselineY: 15, order: 0,
      style: {
        display: 'block', position: 'static', fontSize: '14px', fontWeight: '400',
        lineHeight: '20px', color: 'rgb(68, 84, 111)', backgroundColor: 'rgba(0, 0, 0, 0)',
        paddingTop: `${labelPaddingTop}px`, paddingLeft: `${labelPaddingLeft}px`,
      },
      text: text({ chars: 8, measuredWidth: 62, availWidth: 104 }),
    },
    {
      path: 'g>div0>div0>span1', tag: 'span', role: null,
      box: [132, 2, 200, 24], baselineY: valueBaseline, order: 1,
      style: {
        display: 'block', position: 'static', fontSize: '14px', fontWeight: '400',
        lineHeight: '20px', color: 'rgb(23, 43, 77)', backgroundColor: 'rgba(0, 0, 0, 0)',
        textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap',
      },
      text: text({ chars: 31, measuredWidth: 248, availWidth: 200, overflowX: 48, truncated }),
    },
    {
      path: 'g>div0>div1', tag: 'div', role: null,
      box: [0, 36, 400, 24], baselineY: null, order: 1,
      style: { display: 'flex', flexDirection: 'row', gap: '12px', position: 'static' },
      text: null,
    },
    {
      path: 'g>div1', tag: 'div', role: null,
      box: [0, 72, 400, 60], baselineY: null, order: 1,
      style: { display: 'flex', flexDirection: 'column', gap: '12px', position: 'static' },
      text: null,
    },
    {
      path: 'g>div2', tag: 'h2', role: null,
      box: [0, 144, 400, 60], baselineY: 160, order: 2,
      style: {
        display: 'block', position: 'static', fontSize: '20px', fontWeight: '600',
        lineHeight: '28px', color: 'rgb(23, 43, 77)', backgroundColor: 'rgb(255, 255, 255)',
      },
      text: text({ chars: 12, measuredWidth: 160, availWidth: 400, lineHeightPx: 28 }),
    },
  ];
}

const storybook = {
  env: env(),
  extraction: {
    targetPath: 'g>div0>div0',
    parentPath: 'g>div0',
    rootPath: 'g',
    rootSize: [400, 204],
    nodes: nodes({
      groupGap: 16,           // 規格值 layout-space-loose(md)
      labelPaddingTop: 12,    // layout-space-tight(md)
      labelPaddingLeft: 16,   // layout-space-loose(md)
      valueBaseline: 15,      // 對齊
      truncated: false,       // story 容器寬鬆
      elevated: false,        // 規格沒有陰影
    }),
  },
};

const production = {
  env: env(),
  extraction: {
    targetPath: 'g>div0>div0',
    parentPath: 'g>div0',
    rootPath: 'g',
    rootSize: [400, 204],
    nodes: nodes({
      groupGap: 12,           // ② 被改成 layout-space-tight
      labelPaddingTop: 13,    // ① 不在 token 定義裡
      labelPaddingLeft: 16.4, // RENDER-001 誘餌
      valueBaseline: 17,      // ④ 差 2px
      truncated: true,        // ⑤ 真實內容長度下截斷
      elevated: true,         // 實作多了陰影 → ELEVATION-001 的 unresolved 素材
    }),
  },
};

module.exports = { storybook, production };
