/* eslint-env browser */
/**
 * DQA Extract —— 鄰域擷取與脫敏量測
 *
 * 三個不可妥協的原則:
 *  1. 擷取範圍是「鄰域」不是 subtree —— Gestalt 的證據在 sibling 身上。
 *  2. 樣式走 allowlist,再過一次 sanitize —— 任何含 url( 或引號的值一律丟棄。
 *  3. 文字只出數字不出字串 —— measureText 需要真實字串,但字串永遠留在瀏覽器內。
 */
(() => {
  const DQA = (window.__DQA__ = window.__DQA__ || {});

  /* ---------------------------------------------------------------- allowlist */

  // 只有排版與色彩相關、且不可能承載內容的屬性
  const STYLE_ALLOWLIST = [
    'display', 'position', 'flexDirection', 'flexWrap', 'justifyContent',
    'alignItems', 'alignSelf', 'gap', 'rowGap', 'columnGap',
    'gridAutoFlow', 'gridTemplateColumns', 'gridTemplateRows',
    'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
    'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
    'width', 'height', 'minWidth', 'maxWidth', 'minHeight', 'maxHeight',
    'fontSize', 'fontWeight', 'fontStyle', 'lineHeight', 'letterSpacing',
    'textAlign', 'textTransform', 'textDecorationLine',
    'color', 'backgroundColor', 'opacity',
    'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
    'borderTopColor', 'borderRightColor', 'borderBottomColor', 'borderLeftColor',
    'borderTopLeftRadius', 'borderTopRightRadius',
    'borderBottomLeftRadius', 'borderBottomRightRadius',
    'boxShadow', 'outlineWidth', 'outlineOffset', 'outlineColor',
    'zIndex', 'overflow', 'overflowX', 'overflowY',
    'textOverflow', 'whiteSpace', 'wordBreak',
    'visibility', 'pointerEvents',
  ];

  // 明確拒絕清單(即使誤入 allowlist 也要擋)——這些是實際的外洩節點
  const STYLE_DENYLIST = new Set([
    'backgroundImage',   // url(https://cdn.internal.corp/logos/customer-acme.png)
    'content',           // ::before 的字面文字,例如 "已核准"
    'fontFamily',        // 內部授權字型名 / 專案代號 → 改送 hash
    'gridTemplateAreas', // 具名區域可能洩漏資料分類,例如 "pii-panel"
    'listStyleImage',
    'borderImageSource',
    'maskImage',
    'filter',            // 可能含 url(#...)
    'clipPath',          // 可能含 url(#...)
    'cursor',            // 可能含 url(...)
    'src',
  ]);

  /**
   * 需要正規化成 sRGB 的屬性。
   * 這份清單必須與 `src/core/tokens.js` 的 COLOR_PROPS 相同 —— 那邊是逆映射的入口,
   * 這邊是量測的出口,少一個屬性就等於那個屬性的 token 永遠解析不到。
   */
  const COLOR_PROPS = new Set([
    'color', 'backgroundColor',
    'borderTopColor', 'borderRightColor', 'borderBottomColor', 'borderLeftColor',
    'outlineColor',
  ]);

  /** 最後一道防線:任何含 url( 或引號的值一律丟棄 */
  function sanitize(value) {
    if (typeof value !== 'string') return value;
    if (/url\s*\(/i.test(value)) return null;
    if (/["']/.test(value)) return null;
    if (/var\s*\(\s*--/.test(value)) return null; // custom property 可能帶 feature flag 名
    if (value.length > 120) return null;          // 異常長的值不明來源,不送
    return value;
  }

  /* ---------------------------------------------------------------- utilities */

  /** FNV-1a —— 給 fontFamily 用。跨環境可比對,但不可讀。 */
  function hashStr(s) {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i += 1) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return `h${h.toString(16)}`;
  }

  const round = (n, p = 2) => Math.round(n * 10 ** p) / 10 ** p;

  /** 結構路徑 ID —— 跨環境配對節點的唯一依據。不用 class 名(兩側可能不同)。 */
  function pathFrom(root, el) {
    if (el === root) return 'g';
    const parts = [];
    let cur = el;
    while (cur && cur !== root) {
      const parent = cur.parentElement;
      if (!parent) return null;
      const idx = Array.prototype.indexOf.call(parent.children, cur);
      parts.unshift(`${cur.tagName.toLowerCase()}${idx}`);
      cur = parent;
    }
    return `g>${parts.join('>')}`;
  }

  /* --------------------------------------------------------- text measurement */

  let _canvasCtx = null;
  function canvasCtx() {
    if (!_canvasCtx) {
      _canvasCtx = document.createElement('canvas').getContext('2d');
    }
    return _canvasCtx;
  }

  /* ------------------------------------------------------- color 正規化 */

  /**
   * 把任何 CSS 色值正規化成 rgb() / rgba()。
   *
   * 為什麼用 canvas 而不是自己算:現代 design system 的色票是 oklch,
   * 而 Chromium 的 computed value **保留 oklch 不轉回 rgb** ——
   * `getComputedStyle(el).color` 直接回 `oklch(0.54 0.22 258)`。
   * 下游的 rgbToHex() 只認 rgb()/#hex,遇到 oklch 一律回 null,
   * 於是色彩 token 全部解析不到、emphasis 全是 null、EMPHASIS-001 永遠不觸發 ——
   * 而且完全沒有錯誤訊息。
   *
   * 自己實作 oklch → sRGB 的問題不在那段矩陣運算,在色域外的 gamut mapping:
   * 那份實作必須永遠跟「畫出這個頁面的引擎」一致,否則就是同一個事實有兩份答案(ADR-011)。
   * canvas 用的就是同一顆引擎,連 relative color syntax 都已經在 computed 階段解析完。
   *
   * 正規化的目標空間是 **sRGB**:DS 有色票超出 sRGB 色域,在 P3 螢幕上的實際顯色與此不同。
   * 這是刻意的取捨 —— 要的是兩側可比、跨機器可複現,sRGB 是唯一站得住的正規空間。
   */
  let _colorCtx = null;
  const _colorCache = new Map();

  function colorCtx() {
    if (!_colorCtx) {
      const c = document.createElement('canvas');
      c.width = 1;
      c.height = 1;
      _colorCtx = c.getContext('2d', { willReadFrequently: true });
    }
    return _colorCtx;
  }

  function normalizeColor(value) {
    if (typeof value !== 'string' || !value) return null;
    if (_colorCache.has(value)) return _colorCache.get(value);

    const ctx = colorCtx();
    // fillStyle 遇到不合法的值會「保留原值」而不是丟錯 —— 用兩個哨兵確認它真的被接受,
    // 避免把上一個顏色誤認成這次的解析結果。
    let accepted = false;
    for (const sentinel of ['#000000', '#ffffff']) {
      ctx.fillStyle = sentinel;
      ctx.fillStyle = value;
      if (ctx.fillStyle !== sentinel) { accepted = true; break; }
    }
    if (!accepted) { _colorCache.set(value, null); return null; }

    ctx.clearRect(0, 0, 1, 1);
    ctx.fillRect(0, 0, 1, 1);
    let px;
    try {
      px = ctx.getImageData(0, 0, 1, 1).data;
    } catch (e) {
      _colorCache.set(value, null);
      return null;
    }
    const [r, g, b, a] = px;
    const out = a === 255
      ? `rgb(${r}, ${g}, ${b})`
      : `rgba(${r}, ${g}, ${b}, ${round(a / 255, 3)})`;
    _colorCache.set(value, out);
    return out;
  }

  /** 只取直接子文字節點的文字。字串永不離開此函式。 */
  function directText(el) {
    let t = '';
    for (const n of el.childNodes) {
      if (n.nodeType === Node.TEXT_NODE) t += n.nodeValue;
    }
    return t.replace(/\s+/g, ' ').trim();
  }

  function hasTooltipAffordance(el, attrs) {
    for (const a of attrs) {
      if (el.hasAttribute(a) && el.getAttribute(a).trim()) return true;
    }
    // 常見做法:文字節點外層包一層帶 title 的 span
    return !!el.querySelector(attrs.map((a) => `[${a}]`).join(','));
  }

  /**
   * 量測文字,輸出「純數字」。
   * truncated 用 scrollWidth > clientWidth 判定(比自己算可靠),
   * 但同時保留 measuredWidth / availWidth 讓 AI 能看到溢出的程度。
   */
  function textMetrics(el, cs, opts) {
    const text = directText(el);
    if (!text) return null;

    const ctx = canvasCtx();
    const fontStr = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} / ${cs.lineHeight} ${cs.fontFamily}`;
    ctx.font = fontStr;

    let m = null;
    try { m = ctx.measureText(text); } catch (e) { m = null; }

    const fontSize = parseFloat(cs.fontSize) || 0;
    const lineHeight = cs.lineHeight === 'normal'
      ? fontSize * 1.2
      : parseFloat(cs.lineHeight) || fontSize * 1.2;

    const padL = parseFloat(cs.paddingLeft) || 0;
    const padR = parseFloat(cs.paddingRight) || 0;
    const availWidth = round(el.clientWidth - padL - padR);
    const measuredWidth = m ? round(m.width) : null;

    // 實際渲染行數:用 Range 取行盒數量,比 height/lineHeight 可靠
    let lines = null;
    try {
      const range = document.createRange();
      range.selectNodeContents(el);
      const rects = range.getClientRects();
      lines = rects.length || null;
    } catch (e) { /* noop */ }

    const overflowX = round(el.scrollWidth - el.clientWidth);
    const clipping = cs.textOverflow === 'ellipsis'
      || cs.overflow === 'hidden' || cs.overflowX === 'hidden';

    return {
      chars: text.length,          // 只有長度
      measuredWidth,               // 單行意向寬度
      availWidth,                  // 容器可用寬度
      lines,
      overflowX,
      truncated: overflowX > 0.5 && clipping,
      hasAffordance: hasTooltipAffordance(el, opts.affordanceAttrs),
      // 字型只出 hash
      fontHash: hashStr(cs.fontFamily),
      ascent: m && m.fontBoundingBoxAscent != null ? round(m.fontBoundingBoxAscent) : null,
      descent: m && m.fontBoundingBoxDescent != null ? round(m.fontBoundingBoxDescent) : null,
      lineHeightPx: round(lineHeight),
    };
  }

  /**
   * 第一行 baseline 的 y 座標(相對 viewport)。
   * baseline = 行盒 top + (lineHeight - (ascent+descent))/2 + ascent
   * 沒有任何 computed style 屬性叫 baseline —— 這是四個量的合成,必須自己算。
   */
  function baselineY(el, tm) {
    if (!tm || tm.ascent == null) return null;
    let firstLineTop = null;
    try {
      const range = document.createRange();
      range.selectNodeContents(el);
      const rects = range.getClientRects();
      if (rects.length) firstLineTop = rects[0].top;
    } catch (e) { /* noop */ }
    if (firstLineTop == null) return null;

    const half = (tm.lineHeightPx - (tm.ascent + tm.descent)) / 2;
    return round(firstLineTop + half + tm.ascent);
  }

  /* ------------------------------------------------------------ node snapshot */

  function styleSnapshot(el) {
    const cs = getComputedStyle(el);
    const out = {};
    for (const prop of STYLE_ALLOWLIST) {
      if (STYLE_DENYLIST.has(prop)) continue;
      const raw = cs[prop];
      const clean = sanitize(raw);
      if (clean === null || clean === undefined || clean === '') continue;
      // 先 sanitize 再正規化:denylist / sanitize 是資安防線,順序不能倒過來。
      // 正規化失敗時保留 sanitize 後的原字串 —— 少送一個欄位比送一個看不懂的值糟。
      out[prop] = COLOR_PROPS.has(prop) ? (normalizeColor(clean) || clean) : clean;
    }
    return { cs, out };
  }

  function snapshotNode(el, root, rootRect, opts) {
    const { cs, out } = styleSnapshot(el);
    const r = el.getBoundingClientRect();
    const tm = textMetrics(el, cs, opts);
    const bl = baselineY(el, tm);

    return {
      path: pathFrom(root, el),
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute('role') || null,
      // 座標一律相對鄰域根節點 —— 兩個環境的頁面偏移量不同,絕對座標不可比
      box: [round(r.left - rootRect.left), round(r.top - rootRect.top), round(r.width), round(r.height)],
      baselineY: bl == null ? null : round(bl - rootRect.top),
      order: el.parentElement
        ? Array.prototype.indexOf.call(el.parentElement.children, el)
        : 0,
      style: out,
      text: tm,
    };
  }

  /* ------------------------------------------------------------------ extract */

  /**
   * 鄰域定義(這是我們爭出來的結論,不要改回 subtree):
   *   T  = 目標節點
   *   P  = T 的 parent        → 取 P 的全部直接 children(= T 的 siblings)  → intra
   *   G  = P 的 parent        → 取 G 的全部直接 children(= P 的 siblings)  → inter
   *   另外附上 T 的直接 children,讓 T 內部的對齊也看得到。
   */
  /**
   * 對外露出正規化器。`scripts/extract-tokens.mjs` 用它把 token 定義解析成 sRGB ——
   * token 定義那一側與量測那一側必須經過**同一個**正規化器,
   * 否則逆映射是拿兩種量化結果在做精確比對,永遠對不上。
   */
  DQA.normalizeColor = normalizeColor;

  DQA.extract = function extract(targetSelector, opts = {}) {
    const options = {
      affordanceAttrs: opts.affordanceAttrs || ['title', 'aria-label', 'data-tooltip'],
      maxNodes: opts.maxNodes || 120,
    };

    // Playwright 端傳 selector 字串;Extension 的挑選器直接傳 Element,
    // 免得為了描述「使用者剛剛點的那個節點」而去合成一條可能不唯一的 selector。
    const target = typeof targetSelector === 'string'
      ? document.querySelector(targetSelector)
      : targetSelector;
    if (!target || target.nodeType !== 1) {
      throw new Error(`DQA: target not found: ${typeof targetSelector === 'string' ? targetSelector : '(element)'}`);
    }

    const P = target.parentElement;
    const G = P ? P.parentElement : null;
    const root = G || P || target;
    const rootRect = root.getBoundingClientRect();

    const set = new Set();
    const add = (el) => { if (el && el.nodeType === 1) set.add(el); };

    add(root);
    add(target);
    add(P);
    if (P) for (const c of P.children) add(c);
    if (G) for (const c of G.children) add(c);
    for (const c of target.children) add(c);

    const nodes = [];
    for (const el of set) {
      if (nodes.length >= options.maxNodes) break;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      const snap = snapshotNode(el, root, rootRect, options);
      if (!snap.path) continue;
      nodes.push(snap);
    }
    nodes.sort((a, b) => a.path.localeCompare(b.path));

    return {
      targetPath: pathFrom(root, target),
      parentPath: P ? pathFrom(root, P) : null,
      rootPath: 'g',
      rootSize: [round(rootRect.width), round(rootRect.height)],
      nodes,
    };
  };
})();
