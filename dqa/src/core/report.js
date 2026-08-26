/**
 * DQA Report Model —— 把 payload 與 AI findings 併成一份可呈現的資料。
 *
 * 這裡只做「合併、補資料、排序、分區」,不做任何判定。
 * 之所以放進 core 而不是各自寫在兩個渲染端:分區規則本身就是判斷
 * (哪些算違規、哪些只是提示、AI 的 acceptable 要不要露出),
 * 兩份實作遲早會分岔,而使用者看到的東西分岔比數字分岔更難發現(ADR-011)。
 *
 * 渲染留給各自:擴充套件用 DOM,CLI 產 HTML 字串。那是真的不同的事。
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else Object.assign((root.DQA_CORE = root.DQA_CORE || {}), api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SEVERITY_ORDER = { high: 0, medium: 1, low: 2, info: 3 };

  const bySeverityThenCode = (a, b) => {
    const d = (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9);
    return d
      || String(a.code).localeCompare(String(b.code))
      || String(a.node).localeCompare(String(b.node));
  };

  /**
   * 確定性判定的證據是 { 欄位: 值 };AI 的證據是一串字串。
   * 兩者形狀不同,標記出來讓渲染端各自處理,不要硬壓成同一種。
   */
  function deterministicRow(v, origin) {
    return {
      origin,
      code: v.code,
      severity: v.severity,
      node: v.node,
      description: v.description,
      source: v.source,
      evidenceKind: 'fields',
      evidence: v.evidence || {},
    };
  }

  function aiRow(finding, rule) {
    return {
      origin: 'ai',
      code: finding.code,
      severity: finding.severity,
      node: finding.id,
      description: rule ? rule.description : null,
      source: rule ? rule.source : null,
      evidenceKind: 'lines',
      evidence: finding.evidence || [],
      classification: finding.classification,
    };
  }

  /**
   * @param {object} payload  buildPayload 的輸出
   * @param {object} [ai]     { findings, problems, meta } —— llm.js 的輸出,沒接 AI 就不傳
   * @param {object} [rubric] 用來把 AI 只回傳的 code 補回 source / description
   */
  function buildReport(payload, ai, rubric) {
    const findings = (ai && ai.findings) || [];
    const rules = new Map(((rubric && rubric.rules) || []).map((r) => [r.code, r]));
    const problems = [...((ai && ai.problems) || [])];

    const violations = payload.deterministic_violations.map((v) => deterministicRow(v, 'deterministic'));
    const acceptable = [];
    const unclassified = [];

    for (const f of findings) {
      if (f.classification === 'unclassified') {
        unclassified.push(aiRow(f, null));
        continue;
      }
      const rule = rules.get(f.code) || null;
      if (!rule) {
        // 降級路徑(閘道器不支援 structured outputs)之後這件事重新變成可能。
        // 不靜默丟掉也不當成違規 —— 沒有 source 的判定不算數(ADR-007)。
        problems.push(`${f.id}:${f.code} 不在 rubric 裡,這條判定沒有依據,已排除`);
        continue;
      }
      (f.classification === 'acceptable' ? acceptable : violations).push(aiRow(f, rule));
    }

    violations.sort(bySeverityThenCode);
    acceptable.sort(bySeverityThenCode);

    const notices = [...payload.notices || []]
      .map((n) => deterministicRow(n, 'notice'))
      .sort(bySeverityThenCode);

    const answered = new Set(findings.map((f) => f.id));
    const unanswered = (payload.unresolved || []).filter((u) => !answered.has(u.id));

    return {
      meta: Object.assign({}, payload.meta, {
        aiApplied: !!ai,
        ai: (ai && ai.meta) || null,
      }),
      counts: {
        violations: violations.length,
        deterministic: violations.filter((r) => r.origin === 'deterministic').length,
        aiViolations: violations.filter((r) => r.origin === 'ai').length,
        high: violations.filter((r) => r.severity === 'high').length,
        notices: notices.length,
        acceptable: acceptable.length,
        unclassified: unclassified.length,
        skipped: (payload.skipped_checks || []).length,
        unresolved: (payload.unresolved || []).length,
        unanswered: unanswered.length,
        nodes: (payload.nodes || []).length,
      },
      violations,
      notices,
      acceptable,
      unclassified,
      unanswered,
      skipped: payload.skipped_checks || [],
      structural: payload.structural_diff || { onlySb: [], onlyProd: [] },
      problems,
    };
  }

  return { buildReport, SEVERITY_ORDER, bySeverityThenCode };
});
