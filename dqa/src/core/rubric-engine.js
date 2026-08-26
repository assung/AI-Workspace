/**
 * DQA Rubric Engine —— 確定性規則
 *
 * 這支同時在 Node(CLI)與 Chrome Extension(報告頁)裡跑,rubric 由呼叫端注入。
 * 確定性規則的結果是「既定事實」,兩條路徑跑出來的判定必須一模一樣,故不可有第二份實作。
 */
(function (root, factory) {
  'use strict';
  const deps = typeof module === 'object' && module.exports
    ? require('./tokens')
    : root.DQA_CORE;
  if (!deps || !deps.SPACING_PROPS) {
    throw new Error('DQA: rubric-engine 需要先載入 core/tokens.js');
  }
  const api = factory(deps);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else Object.assign((root.DQA_CORE = root.DQA_CORE || {}), api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (tokensModule) {
  'use strict';

  const { SPACING_PROPS } = tokensModule;

  /* ---------------------------------------------------------------- helpers */

  const parentPath = (p) => {
    if (!p || p === 'g') return null;
    const i = p.lastIndexOf('>');
    return i === -1 ? null : p.slice(0, i);
  };

  const byPath = (nodes) => new Map(nodes.map((n) => [n.path, n]));

  const childrenOf = (nodes, p) =>
    nodes.filter((n) => parentPath(n.path) === p).sort((a, b) => a.order - b.order);

  const median = (arr) => {
    if (!arr.length) return null;
    const s = [...arr].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };

  const round = (n, p = 2) => Math.round(n * 10 ** p) / 10 ** p;

  /* --------------------------------------------------------------- contrast */

  function hexToRgb(hex) {
    const h = hex.replace('#', '');
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  }

  function relLuminance(hex) {
    const [r, g, b] = hexToRgb(hex).map((v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  function contrastRatio(fgHex, bgHex) {
    const a = relLuminance(fgHex);
    const b = relLuminance(bgHex);
    const [hi, lo] = a > b ? [a, b] : [b, a];
    return round((hi + 0.05) / (lo + 0.05), 2);
  }

  function toHex(rgb) {
    return `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
  }

  /** source-over 合成:把帶 alpha 的上層疊到不透明的下層上 */
  function blend(top, bottomHex) {
    if (!top || top.alpha == null || top.alpha >= 1) return top ? top.hex : bottomHex;
    const a = top.alpha;
    const f = hexToRgb(top.hex);
    const b = hexToRgb(bottomHex);
    return toHex([0, 1, 2].map((i) => f[i] * a + b[i] * (1 - a)));
  }

  /**
   * 有效背景色 —— 往上收集背景層,疊到第一個不透明的那層為止。
   *
   * 不能只回「第一個 alpha === 1 的背景」:半透明的背景層會改變實際看到的顏色,
   * 而對比度是拿「實際看到的」在算。design system 用 alpha 疊色是常態
   * (@qijenchen/design-system 的 --surface 在 dark 就是 --white-a08)。
   */
  function effectiveBg(node, map) {
    const layers = [];   // 由內而外
    let cur = node;
    let opaque = null;
    while (cur) {
      const t = cur.tokens && cur.tokens.backgroundColor;
      if (t && t.alpha > 0) {
        if (t.alpha >= 1) { opaque = t.hex; break; }
        layers.push(t);
      }
      cur = map.get(parentPath(cur.path));
    }
    // 一路到頂都沒有不透明背景 → 只能假設頁面底色是白的。這是假設,不是量到的。
    let base = opaque || '#ffffff';
    for (let i = layers.length - 1; i >= 0; i -= 1) base = blend(layers[i], base);
    return base;
  }

  /* --------------------------------------------------------------- gap 採集 */

  /**
   * 只有在 parent 為 flex/grid、且無子節點脫離文件流時才採集間距。
   *
   * 理由(這條是爭出來的,不要放寬):
   * 傳統 block flow 的縫隙來自 margin collapse、父層 padding、line-height 撐開的隱形空間,
   * 三者混在一起壓成一個 gap 數字,必然產生大量誤報。
   * 量不到就說量不到 —— 寧可少報一條,也不送出看起來精確的推測值。
   */
  function collectGaps(parent, kids) {
    if (!parent || kids.length < 2) {
      return { gaps: null, skip: 'INSUFFICIENT_CHILDREN' };
    }
    const display = parent.style.display || '';
    const isFlexOrGrid = /\b(flex|inline-flex|grid|inline-grid)\b/.test(display);
    if (!isFlexOrGrid) {
      return { gaps: null, skip: 'BLOCK_FLOW_NOT_MEASURABLE' };
    }
    const escaped = kids.some((k) => ['absolute', 'fixed'].includes(k.style.position));
    if (escaped) {
      return { gaps: null, skip: 'CHILD_OUT_OF_FLOW' };
    }

    const dir = parent.style.flexDirection || 'row';
    const vertical = /column/.test(dir) || /grid/.test(display);

    const sorted = [...kids].sort((a, b) =>
      vertical ? a.box[1] - b.box[1] : a.box[0] - b.box[0]);

    // 換行的 flex 無法用一維相減表達
    if (!vertical && /wrap/.test(parent.style.flexWrap || '')) {
      const rows = new Set(sorted.map((k) => Math.round(k.box[1])));
      if (rows.size > 1) return { gaps: null, skip: 'FLEX_WRAPPED' };
    }

    const gaps = [];
    for (let i = 0; i < sorted.length - 1; i += 1) {
      const a = sorted[i];
      const b = sorted[i + 1];
      const g = vertical
        ? b.box[1] - (a.box[1] + a.box[3])
        : b.box[0] - (a.box[0] + a.box[2]);
      if (g < -0.5) return { gaps: null, skip: 'OVERLAPPING_SIBLINGS' };
      gaps.push(round(g));
    }
    return { gaps, skip: null, axis: vertical ? 'y' : 'x' };
  }

  /* ------------------------------------------------------------------ 判定去向 */

  /**
   * 一條規則判出來的東西該進哪條輸出線:
   *
   *   violation(預設)→ deterministic_violations。既定事實,AI 不得推翻。
   *   notice         → notices。程式量得到,但依 spec 不必然是問題,交給人看。
   *
   * 為什麼需要第二條線:確定性規則的價值在「可複現」,不在「一定是錯的」。
   * TOKEN-001 就是這種 —— 對照基準的判準是「同值在 ≥ 2 處需同步才必開 token」,
   * 而 DQA 從單一鄰域只看得到「值有沒有名字」,看不到「有沒有同步義務」。
   * 硬定讞會系統性誤報,丟給 AI 猜也不對(它一樣看不到別的 consumer)。
   *
   * 注意:降級的是**定不定讞**,不是 severity。
   * 用調低 severity 來讓報告好看是 ADR-004 明令禁止的假修法。
   */
  const OUTCOMES = new Set(['violation', 'notice']);

  /* ------------------------------------------------------------------ engine */

  class RubricEngine {
    /**
     * @param {object} opts
     * @param {object} opts.rubric  rubric.json 的內容本體(不是路徑)—— core 不讀檔
     */
    constructor(opts = {}) {
      const rubric = opts.rubric;
      if (!rubric || !Array.isArray(rubric.rules)) {
        throw new Error('DQA: 缺少 rubric。rubric 必須由呼叫端注入,core 不讀檔。');
      }
      const badOutcome = rubric.rules.filter((r) => r.outcome && !OUTCOMES.has(r.outcome));
      if (badOutcome.length) {
        throw new Error(
          `DQA: 以下規則的 outcome 不合法(只能是 ${[...OUTCOMES].join(' / ')}): `
          + badOutcome.map((r) => `${r.code}=${r.outcome}`).join(', ')
        );
      }
      const noSource = rubric.rules.filter((r) => !r.source);
      if (noSource.length) {
        // ADR-007:沒有 source 的規則不准進 rubric,載入時就擋掉,不要等到報告出來才發現
        throw new Error(
          `DQA: rubric 契約違反 —— 以下規則沒有 source: ${noSource.map((r) => r.code).join(', ')}`
        );
      }
      this.rubric = rubric;
      this.rules = new Map(rubric.rules.map((r) => [r.code, r]));
    }

    rule(code) {
      const r = this.rules.get(code);
      if (!r) throw new Error(`DQA: rubric 缺少規則 ${code}`);
      return r;
    }

    violation(code, nodePath, evidence) {
      const r = this.rule(code);
      return {
        code,
        severity: r.severity,
        node: nodePath,
        source: r.source,
        description: r.description,
        evidence,
      };
    }

    /* ------------------------------------------------------ 單側規則(prod) */

    /** 依規則的 outcome 把判定推進對應的清單 */
    emit(buckets, code, nodePath, evidence) {
      const rule = this.rule(code);
      const v = this.violation(code, nodePath, evidence);
      if ((rule.outcome || 'violation') === 'notice') buckets.notices.push(v);
      else buckets.violations.push(v);
      return v;
    }

    evaluateSingleSide(extraction) {
      const nodes = extraction.nodes;
      const map = byPath(nodes);
      const violations = [];
      const notices = [];
      const skipped = [];
      const buckets = { violations, notices };

      /* TOKEN-001 —— 魔術數字。severity 固定,與 delta 無關。 */
      for (const n of nodes) {
        for (const [prop, t] of Object.entries(n.tokens || {})) {
          if (!SPACING_PROPS.has(prop)) continue;
          if (t.token === null) {
            this.emit(buckets, 'TOKEN-001', n.path, {
              prop, px: t.px, nearest: t.nearest, delta: t.delta,
            });
          }
        }
      }

      /* GESTALT-001 —— intra vs inter */
      const P = extraction.parentPath;
      const G = extraction.rootPath;
      const pNode = map.get(P);
      const gNode = map.get(G);

      const intra = collectGaps(pNode, childrenOf(nodes, P));
      const inter = collectGaps(gNode, childrenOf(nodes, G));

      if (intra.skip) skipped.push({ code: 'GESTALT-001', reason: `intra:${intra.skip}`, node: P });
      if (inter.skip) skipped.push({ code: 'GESTALT-001', reason: `inter:${inter.skip}`, node: G });

      if (intra.gaps && inter.gaps) {
        const gi = median(intra.gaps);
        const ge = median(inter.gaps);
        if (gi !== null && ge !== null && gi >= ge) {
          this.emit(buckets, 'GESTALT-001', P, {
            intra_gap: gi, inter_gap: ge,
            intra_samples: intra.gaps, inter_samples: inter.gaps,
          });
        }
      }

      /* ALIGN-001 —— 同列 baseline */
      const groups = new Map();
      for (const n of nodes) {
        const pp = parentPath(n.path);
        if (!pp || n.baselineY == null) continue;
        if (!groups.has(pp)) groups.set(pp, []);
        groups.get(pp).push(n);
      }
      for (const [pp, sibs] of groups) {
        for (let i = 0; i < sibs.length; i += 1) {
          for (let j = i + 1; j < sibs.length; j += 1) {
            const a = sibs[i];
            const b = sibs[j];
            const overlap = Math.min(a.box[1] + a.box[3], b.box[1] + b.box[3])
              - Math.max(a.box[1], b.box[1]);
            const minH = Math.min(a.box[3], b.box[3]);
            if (minH <= 0 || overlap / minH < 0.5) continue; // 不同列
            const d = Math.abs(a.baselineY - b.baselineY);
            if (d >= 0.5 && d <= 4) {
              this.emit(buckets, 'ALIGN-001', pp, {
                a: a.path, b: b.path, baselineDelta: round(d),
              });
            }
          }
        }
      }

      /* TRUNC-001 —— 單側判定,不進 diff */
      for (const n of nodes) {
        const t = n.text;
        if (t && t.truncated && !t.hasAffordance) {
          this.emit(buckets, 'TRUNC-001', n.path, {
            measuredWidth: t.measuredWidth,
            availWidth: t.availWidth,
            overflowX: t.overflowX,
            chars: t.chars,
          });
        }
      }

      return { violations, notices, skipped };
    }

    /* -------------------------------------------------- 事實層:emphasis 分數 */

    /** 不下判斷,只把數字算成事實寫進 payload,交給 AI 依脈絡判定(EMPHASIS-001) */
    annotateEmphasis(extraction) {
      const map = byPath(extraction.nodes);
      for (const n of extraction.nodes) {
        const fgToken = n.tokens && n.tokens.color ? n.tokens.color : null;
        if (!fgToken || !n.text) { n.emphasis = null; continue; }
        const bg = effectiveBg(n, map);
        // 前景本身可能帶 alpha —— @qijenchen/design-system 的 --foreground 就是 85% 黑。
        // 不合成就會把「85% 黑 on 白」算成純黑的 21:1,而實際看到的只有 15:1 左右。
        const fg = blend(fgToken, bg);
        const cr = contrastRatio(fg, bg);
        const size = parseFloat(n.style.fontSize) || 0;
        const weight = parseInt(n.style.fontWeight, 10) || 400;
        n.emphasis = {
          fontSize: size,
          fontWeight: weight,
          contrastVsBg: cr,
          // 合成後的實際前景色。與 tokens.color.hex 不同時代表原色帶 alpha,
          // 判讀對比度時看的是這個值,不是 style 裡寫的那個。
          fgEffective: fg,
          bgEffective: bg,
          // 公式僅為排序用途,不承載門檻;門檻不存在於任何 spec,故不做確定性判定
          score: round((size / 16) * (weight / 400) * Math.min(cr / 4.5, 2), 3),
          isHeading: /^h[1-6]$/.test(n.tag) || n.role === 'heading',
        };
      }
      return extraction;
    }

    /* ------------------------------------------------------ 比較規則(兩側) */

    evaluateComparative(pairs) {
      const violations = [];
      const notices = [];
      const buckets = { violations, notices };
      for (const { path: p, prop, sb, prod } of pairs) {
        if (!sb || !prod) continue;
        if (sb.token && prod.token && sb.token !== prod.token) {
          this.emit(buckets, 'TOKEN-002', p, {
            prop, sb: sb.token, prod: prod.token,
            sbPx: sb.px, prodPx: prod.px,
          });
        } else if (sb.token && prod.token && sb.token === prod.token
                   && Math.abs(sb.px - prod.px) < 2 && Math.abs(sb.px - prod.px) > 0) {
          this.emit(buckets, 'RENDER-001', p, {
            prop, token: sb.token, delta: round(prod.px - sb.px),
          });
        }
      }
      return { violations, notices };
    }
  }

  return { RubricEngine, collectGaps, contrastRatio, blend, parentPath, childrenOf };
});
