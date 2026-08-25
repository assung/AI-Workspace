---
description: 新增一條 rubric 規則(強制走完契約檢查)
---

新增 rubric 規則:$ARGUMENTS

依序做,不要跳步:

1. **先 grep 既有的**。`rg 'code":' rubric.json` 看命名慣例與已存在的 domain 前綴。
   如果新規則跟既有規則重疊,改既有的,不要新增。

2. **找 source**。這條規則的依據是什麼?必須指回:
   - 既有 spec 檔案路徑,或
   - `tokens/*.json` 的某個定義,或
   - 外部權威(Polaris / Material / Apple HIG / Atlassian / NN/g)的具體章節
   **找不到 source 就停下來問使用者。不准自己發明一個門檻值。**(ADR-007)

3. **決定 evaluator**。問自己:判定門檻存在於某份 spec 裡嗎?
   - 是 → `deterministic`,寫進 `src/node/rubric-engine.js`
   - 否 → `ai`,程式只算「事實」寫進 payload,判定交給 AI
   參考 EMPHASIS-001 這個標準案例。

4. **決定 check_type**。`comparative`(需要兩側)還是 `single_side`(只看 production)?
   若 Storybook 側的值受 story 容器影響而不可比,一律 `single_side`。(ADR-008)

5. **severity 不可隨偏差量浮動。**(ADR-004)

6. **改一處必看三處**:`rubric.json` / `rubric-engine.js` / `test/fixture.js` 三方一次改完。

7. **fixture 用真實業務場景**。Jira / Stripe / Notion / Figma 的可辨識情境。禁止 div1/div2。

8. 跑 `npm test` 確認新規則會觸發,且**沒有讓既有規則誤報**。
