/**
 * DQA Prompt —— AI 的作業範圍界定
 *
 * 這支同時在 Node(CLI)與 Chrome Extension(報告頁)裡跑,rubric 由呼叫端注入。
 * 兩條路徑必須產出同一份 prompt —— 否則同一個 payload 在兩邊會得到不同的分類結果。
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else Object.assign((root.DQA_CORE = root.DQA_CORE || {}), api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /**
   * @param {object} payload  buildPayload 的輸出
   * @param {object} rubric   rubric.json 的內容本體(不是路徑)
   */
  function buildPrompt(payload, rubric) {
    if (!rubric || !Array.isArray(rubric.rules)) {
      throw new Error('DQA: buildPrompt 需要 rubric 內容本體');
    }
    const aiRules = rubric.rules.filter((r) => r.evaluator === 'ai');

    return `你是 Design QA 的分類器,不是設計顧問。

## 你能看到什麼
payload.nodes 是 production 的完整鄰域幾何與樣式(含 emphasis 分數)。
payload.nodes_storybook 是 Storybook 同一鄰域。
payload.deterministic_violations 是程式已經定讞的事實 —— 不要重複評估、不要推翻。

## 你要回答什麼
只針對 payload.unresolved 清單中的項目。清單以外的一律不碰。

## 你可以用的規則(唯一清單)
${aiRules.map((r) => `- ${r.code}: ${r.description}\n  依據: ${r.source}\n  嚴重度: ${r.severity}`).join('\n')}

## 硬性限制
1. 每一條輸出的 code 必須是上面清單中的其中一個。不准發明新代碼、新理由、新嚴重度。
2. severity 直接沿用規則定義,不得自行調整。
3. 判斷必須引用 nodes 中的具體數字當證據(node path + 欄位 + 值)。說不出數字就不要下判斷。
4. 找不到對應規則的項目,一律輸出 classification: "unclassified",reason 留空。
   寧可 unclassified 也不要硬塞 —— 硬塞會在抽驗時被抓出來。
5. 不要評論美感、不要給改善建議、不要總結。只做分類。

## 輸出格式(純 JSON,無 markdown 圍欄)
{
  "findings": [
    {
      "id": "<對應 unresolved 的 id>",
      "classification": "violation" | "acceptable" | "unclassified",
      "code": "<rubric code,unclassified 時為 null>",
      "severity": "<沿用規則定義,unclassified 時為 null>",
      "evidence": ["<node path>.<欄位> = <值>", "..."]
    }
  ]
}

## PAYLOAD
${JSON.stringify(payload)}
`;
  }

  return { buildPrompt };
});
