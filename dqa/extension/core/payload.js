/**
 * DQA Payload —— 事實層組裝
 *
 * ADR-005:分流的是規則,不是 payload。
 * nodes 永遠整包送;限縮的是 AI 該回答什麼(unresolved),不是它能看到什麼。
 */
(function (root, factory) {
  'use strict';
  const isNode = typeof module === 'object' && module.exports;
  const deps = isNode
    ? Object.assign({}, require('./tokens'), require('./rubric-engine'))
    : root.DQA_CORE;
  if (!deps || !deps.TokenResolver || !deps.RubricEngine) {
    throw new Error('DQA: payload 需要先載入 core/tokens.js 與 core/rubric-engine.js');
  }
  const api = factory(deps);
  if (isNode) module.exports = api;
  else Object.assign((root.DQA_CORE = root.DQA_CORE || {}), api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (core) {
  'use strict';

  const { TokenResolver, RubricEngine, SPACING_PROPS, COLOR_PROPS, collapseGapEntries } = core;

  /** 已由確定性規則涵蓋的屬性,不再丟給 AI */
  const DETERMINISTICALLY_COVERED = new Set([...SPACING_PROPS]);

  /** 差異存在但程式無法定讞的屬性 —— 這些才進 unresolved */
  const AI_CANDIDATE_PROPS = new Set([
    'boxShadow', 'opacity', 'zIndex',
    'borderTopLeftRadius', 'borderTopRightRadius',
    'borderBottomLeftRadius', 'borderBottomRightRadius',
    'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
    'fontWeight', 'fontSize', 'lineHeight', 'letterSpacing', 'textTransform',
    'color', 'backgroundColor',
    'alignItems', 'justifyContent', 'textAlign',
  ]);

  /**
   * 會整組換掉間距 token 值的屬性。
   *
   * @qijenchen/design-system 的 `--layout-space-loose` 在 md 是 16px、lg 是 24px;
   * `tight` 是 12px / 16px。兩側 density 不同時,鄰域裡每一個間距都會差 ——
   * 而那個差來自環境,不是實作。這正是 ADR-009 的環境鎖要擋的東西。
   */
  const LAYOUT_ATTRS = ['data-density', 'data-layout-space'];

  /** 文件層級的 density —— preflight 把 themeAttrs 記在 env.theme 裡 */
  function documentDensity(env) {
    const theme = (env && env.theme) || {};
    return theme['data-layout-space'] || theme['data-density'] || null;
  }

  function envConsistency(sbEnv, prodEnv) {
    const errors = [];
    if (sbEnv.viewportWidth !== prodEnv.viewportWidth) {
      errors.push({ code: 'ENV_VIEWPORT_MISMATCH', sb: sbEnv.viewportWidth, prod: prodEnv.viewportWidth });
    }
    if (sbEnv.dpr !== prodEnv.dpr) {
      errors.push({ code: 'ENV_DPR_MISMATCH', sb: sbEnv.dpr, prod: prodEnv.dpr });
    }
    const sbTheme = JSON.stringify(sbEnv.theme['data-theme'] ?? sbEnv.theme['prefers-color-scheme']);
    const prodTheme = JSON.stringify(prodEnv.theme['data-theme'] ?? prodEnv.theme['prefers-color-scheme']);
    if (sbTheme !== prodTheme) {
      errors.push({ code: 'ENV_THEME_MISMATCH', sb: sbTheme, prod: prodTheme });
    }

    // 只在兩側都明確宣告時比對。有一側沒宣告 = 它的有效 density 量不到,
    // 不去猜「沒宣告就是預設值」—— 那個預設值是 design system 的知識,不是 DQA 的(ADR-006)。
    for (const attr of LAYOUT_ATTRS) {
      const a = sbEnv.theme[attr];
      const b = prodEnv.theme[attr];
      if (a == null || b == null) continue;
      if (a !== b) errors.push({ code: 'ENV_DENSITY_MISMATCH', attr, sb: a, prod: b });
    }
    return errors;
  }

  /** 依 structural path 配對。配不到的節點單獨列出,本身就是結構差異的訊號。 */
  function pairNodes(sbNodes, prodNodes) {
    const sbMap = new Map(sbNodes.map((n) => [n.path, n]));
    const prodMap = new Map(prodNodes.map((n) => [n.path, n]));
    const paired = [];
    const onlySb = [];
    const onlyProd = [];

    for (const [p, sb] of sbMap) {
      if (prodMap.has(p)) paired.push({ path: p, sb, prod: prodMap.get(p) });
      else onlySb.push(p);
    }
    for (const [p] of prodMap) if (!sbMap.has(p)) onlyProd.push(p);

    return { paired, onlySb, onlyProd };
  }

  /**
   * 配對兩側的 token 結果。
   *
   * gap 的合成必須**兩側都是等向**才做 —— 只有一側 row === column 時合起來,
   * 兩邊比的就不是同一件事了。保守處理:任一側兩軸不等就都拆開比。
   */
  function buildTokenPairs(paired) {
    const out = [];
    for (const { path: p, sb, prod } of paired) {
      const sbEntries = new Map(collapseGapEntries(sb.tokens));
      const prodEntries = new Map(collapseGapEntries(prod.tokens));
      const bothCollapsed = sbEntries.has('gap') && prodEntries.has('gap');

      const expand = (entries) => {
        if (bothCollapsed || !entries.has('gap')) return entries;
        // 另一側是非等向的 → 這一側也拆回兩軸,才對得上
        const m = new Map(entries);
        const g = m.get('gap');
        m.delete('gap');
        m.set('rowGap', g);
        m.set('columnGap', g);
        return m;
      };
      const a = expand(sbEntries);
      const b = expand(prodEntries);

      const props = new Set([...a.keys(), ...b.keys()]);
      // 色彩不在 collapse 的範圍內,另外併進來
      for (const src of [sb.tokens || {}, prod.tokens || {}]) {
        for (const prop of Object.keys(src)) if (COLOR_PROPS.has(prop)) props.add(prop);
      }

      for (const prop of props) {
        if (!SPACING_PROPS.has(prop) && !COLOR_PROPS.has(prop)) continue;
        const sbVal = COLOR_PROPS.has(prop) ? (sb.tokens || {})[prop] : a.get(prop);
        const prodVal = COLOR_PROPS.has(prop) ? (prod.tokens || {})[prop] : b.get(prop);
        out.push({ path: p, prop, sb: sbVal, prod: prodVal });
      }
    }
    return out;
  }

  function buildUnresolved(paired, covered) {
    const unresolved = [];
    for (const { path: p, sb, prod } of paired) {
      const props = new Set([...Object.keys(sb.style || {}), ...Object.keys(prod.style || {})]);
      for (const prop of props) {
        if (DETERMINISTICALLY_COVERED.has(prop)) continue;
        if (!AI_CANDIDATE_PROPS.has(prop)) continue;
        const a = sb.style[prop];
        const b = prod.style[prop];
        if (a === b) continue;
        const key = `${p}.${prop}`;
        if (covered.has(key)) continue;
        unresolved.push({ id: key, node: p, prop, sb: a ?? null, prod: b ?? null });
      }
    }
    return unresolved;
  }

  /**
   * @param {object} sb    { env, extraction }  Storybook 側
   * @param {object} prod  { env, extraction }  Production 側
   * @param {object} opts
   *   opts.tokens        { spacing, colors }  —— 必填,core 不讀檔
   *   opts.rubric        rubric.json 內容本體 —— 必填
   *   opts.captureMode   'playwright' | 'extension'(記錄擷取路徑,供追溯)
   */
  function buildPayload(sb, prod, opts = {}) {
    const resolver = new TokenResolver(opts);
    const engine = new RubricEngine(opts);

    // 節點自己的 density 優先(subtree 可以覆寫);沒有的話退回文件層級記到 env 裡的那個
    resolver.annotate(sb.extraction, documentDensity(sb.env));
    resolver.annotate(prod.extraction, documentDensity(prod.env));
    engine.annotateEmphasis(sb.extraction);
    engine.annotateEmphasis(prod.extraction);

    const envErrors = envConsistency(sb.env, prod.env);
    if (envErrors.length && !opts.allowEnvMismatch) {
      const e = new Error('DQA: 環境不一致,拒絕產出 payload');
      e.details = envErrors;
      throw e;
    }

    const { paired, onlySb, onlyProd } = pairNodes(sb.extraction.nodes, prod.extraction.nodes);

    // 單側規則只跑 production
    const single = engine.evaluateSingleSide(prod.extraction);
    const comparative = engine.evaluateComparative(buildTokenPairs(paired));

    const deterministic = [...single.violations, ...comparative.violations];
    // 程式量得到、但依 spec 不必然構成問題的觀察。不定讞,也不丟給 AI —— 交給人看。
    const notices = [...single.notices, ...comparative.notices];
    const skipped = [...single.skipped, ...comparative.skipped];
    const covered = new Set(
      deterministic
        .filter((v) => v.evidence && v.evidence.prop)
        .map((v) => `${v.node}.${v.evidence.prop}`)
    );

    const unresolved = buildUnresolved(paired, covered);

    // EMPHASIS-001 是常設問題:只要鄰域裡同時有 heading 與非 heading 的文字節點就提出
    const prodNodes = prod.extraction.nodes;
    const hasHeading = prodNodes.some((n) => n.emphasis && n.emphasis.isHeading);
    const hasSibling = prodNodes.some((n) => n.emphasis && !n.emphasis.isHeading);
    if (hasHeading && hasSibling) {
      unresolved.push({
        id: 'EMPHASIS-001@' + prod.extraction.parentPath,
        node: prod.extraction.parentPath,
        rule: 'EMPHASIS-001',
        question: '依 nodes[].emphasis 判斷是否有非 heading 元素的視覺重量超過同層 heading',
      });
    }

    return {
      meta: {
        rubricVersion: engine.rubric.version,
        generatedAt: new Date().toISOString(),
        targetPath: prod.extraction.targetPath,
        // 擷取路徑:兩條路徑的量測邏輯共用,但環境鎖的強制力不同,判讀報告時要知道是哪一條
        captureMode: opts.captureMode || 'playwright',
        env: { sb: sb.env, prod: prod.env, warnings: envErrors },
      },
      // 完整鄰域脈絡 —— 一字不漏照送
      nodes: prod.extraction.nodes,
      nodes_storybook: sb.extraction.nodes,
      structural_diff: { onlySb, onlyProd },
      // 已定讞事實
      deterministic_violations: deterministic,
      // 量得到但不定讞的觀察(規則的 outcome = notice)。人看的,不是 AI 的作業範圍。
      notices,
      // 程式明確放棄判定的項目 —— 第一週要盯的覆蓋率指標
      skipped_checks: skipped,
      // AI 的作業範圍(不是它的視野範圍)
      unresolved,
    };
  }

  return { buildPayload, pairNodes, envConsistency };
});
