/**
 * DQA Token Resolver —— 本地 token 逆映射
 *
 * 這支同時在 Node(CLI)與 Chrome Extension(報告頁 / service worker)裡跑。
 * 因此它不碰檔案系統:token scale 一律由呼叫端注入。
 * 兩條路徑共用同一份實作 —— 逆映射邏輯一旦分岔,兩邊的 token 判定就不可比。
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else Object.assign((root.DQA_CORE = root.DQA_CORE || {}), api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SPACING_PROPS = new Set([
    'gap', 'rowGap', 'columnGap',
    'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
    'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  ]);

  const COLOR_PROPS = new Set([
    'color', 'backgroundColor',
    'borderTopColor', 'borderRightColor', 'borderBottomColor', 'borderLeftColor',
    'outlineColor',
  ]);

  function rgbToHex(v) {
    const m = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,/\s]+([\d.]+))?\s*\)$/i.exec(v);
    if (!m) return /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : null;
    const [r, g, b] = [m[1], m[2], m[3]].map((n) => Math.round(parseFloat(n)));
    const a = m[4] == null ? 1 : parseFloat(m[4]);
    const hex = `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`;
    return a === 1 ? hex : { hex, alpha: a };
  }

  /** scale 檔的形狀:{ unit?, scale: { name: value } }。兩種形狀都收,少一層讓呼叫端好寫。 */
  function unwrapScale(input, what) {
    if (!input) throw new Error(`DQA: 缺少 ${what} scale。tokens 必須由呼叫端注入,core 不讀檔。`);
    const scale = input.scale || input;
    if (typeof scale !== 'object') throw new Error(`DQA: ${what} scale 格式不正確`);
    return scale;
  }

  class TokenResolver {
    /**
     * @param {object} opts
     * @param {object} opts.tokens           { spacing, colors } —— 各自可為 scale 本體或含 scale 欄位的整份檔案
     * @param {number} [opts.epsilon=0.5]    兩個值都在 scale 上、且相等時允許的浮點誤差
     */
    constructor(opts = {}) {
      const t = opts.tokens || {};
      this.spacing = unwrapScale(t.spacing, 'spacing');
      this.colors = unwrapScale(t.colors, 'color');
      this.spacingEntries = Object.entries(this.spacing).sort((a, b) => a[1] - b[1]);
      this.colorIndex = new Map(
        Object.entries(this.colors).map(([k, v]) => [String(v).toLowerCase(), k])
      );
      this.epsilon = opts.epsilon == null ? 0.5 : opts.epsilon;
    }

    /**
     * @returns {{px:number, token:string|null, exact:boolean, nearest:string|null, delta:number|null}}
     *  token === null 就是魔術數字。這個訊號本身比 delta 大小重要得多。
     */
    resolveSpacing(rawValue) {
      const px = parseFloat(rawValue);
      if (Number.isNaN(px)) return null;

      for (const [name, val] of this.spacingEntries) {
        if (Math.abs(val - px) <= this.epsilon) {
          return { px, token: name, exact: true, nearest: name, delta: 0 };
        }
      }
      let nearest = null;
      let best = Infinity;
      for (const [name, val] of this.spacingEntries) {
        const d = Math.abs(val - px);
        if (d < best) { best = d; nearest = name; }
      }
      return {
        px,
        token: null,
        exact: false,
        nearest,
        delta: Math.round((px - this.spacing[nearest]) * 100) / 100,
      };
    }

    resolveColor(rawValue) {
      const conv = rgbToHex(rawValue);
      if (!conv) return null;
      const hex = typeof conv === 'string' ? conv : conv.hex;
      const alpha = typeof conv === 'string' ? 1 : conv.alpha;
      const token = this.colorIndex.get(hex) || null;
      return { hex, alpha, token, exact: !!token && alpha === 1 };
    }

    /** 把整個 node.style 逐屬性逆映射,結果覆寫回 node.tokens */
    annotateNode(node) {
      const tokens = {};
      for (const [prop, value] of Object.entries(node.style || {})) {
        if (SPACING_PROPS.has(prop)) {
          const r = this.resolveSpacing(value);
          if (r) tokens[prop] = r;
        } else if (COLOR_PROPS.has(prop)) {
          const r = this.resolveColor(value);
          if (r) tokens[prop] = r;
        }
      }
      node.tokens = tokens;
      return node;
    }

    annotate(extraction) {
      for (const n of extraction.nodes) this.annotateNode(n);
      return extraction;
    }
  }

  return { TokenResolver, SPACING_PROPS, COLOR_PROPS, rgbToHex, unwrapScale };
});
