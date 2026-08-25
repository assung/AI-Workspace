# 實作任務

依序做。每個任務的驗收條件是**可執行的**,不是「看起來對」。

---

## T0 — 換掉 placeholder(阻擋所有後續任務)

`tokens/*.json` 與 `rubric.json` 的 `source` 目前是假的。

- [ ] `tokens/spacing-scale.json` 換成專案真實 scale
- [ ] `tokens/color-primitives.json` 換成真實 primitives
- [ ] `rubric.json` 每條的 `source` 指到真實 spec 路徑或 URL
- [ ] 若某條規則找不到真實 source → **從 rubric 移除**,不要留著(ADR-007)

**驗收**:`npm test` 仍全綠(fixture 的數值可能要跟著調整,這是預期的)。

---

## T1 — 驗證瀏覽器端量測(最高風險)

`src/browser/*.js` 原本完全沒被測過。fixture 測不到瀏覽器程式碼。

- [x] 建一個 local HTML fixture(`test/browser-fixture/`),用真實業務結構:Jira issue detail 的 property list
- [x] 用真的 Chromium 載入,跑 `preflight` + `extract`,對結果 assert(`npm run test:e2e`)
- [x] 重點驗 `baselineY`:實測落在行盒頂端往下 0.850 個 `lineHeight`,在 0.5~0.95 的合理帶內
- [ ] 重點驗 `measuredWidth`:目前只驗「有值且未溢出」。還缺**已知寬度的等寬字串誤差 < 1px** 這條
- [ ] 驗 `document.fonts.ready` 之前 / 之後量到的值確實不同(證明 ADR-010 的鎖有作用)
      —— 需要一個真的會延遲載入的 webfont,系統字型測不出這條

**驗收**:`npm run test:e2e` 通過(五條確定性規則在真實排版的頁面上全部觸發),
且刻意移除 `await document.fonts.ready` 後測試會失敗 ← 後半尚未成立,見上面兩個未完項。

**已知**:e2e 需要 Chromium 與圖形環境(無畫面時用 `xvfb-run`),所以不進 `npm run test:all`。

---

## T2 — 第一次對真實環境跑

- [ ] 填 `config.json`(Storybook iframe URL + STG URL + selector)
- [ ] 跑 `npm run dqa config.json out`
- [ ] **先不看違規報告**,只看 `out/payload.json` 的 `nodes[].baselineY` 與 `text.measuredWidth` 合不合理
- [ ] 確認 `meta.env.warnings` 為空(環境一致)
- [ ] 確認 `nodes` 筆數合理(鄰域應該是十幾到幾十筆,不是幾百筆)

**驗收**:量測值通過肉眼合理性檢查。這一步不通過,後面的報告全部沒有意義。

---

## T3 — AI 層接上

- [ ] 決定 egress 路徑(公司 gateway / Bedrock / 地端)
- [ ] 寫 `src/node/llm.js`,吃 `prompt.txt` 吐 JSON
- [ ] 驗證輸出的每個 `code` 都在 rubric 的 `evaluator: "ai"` 清單內;不在就當作格式錯誤重試
- [ ] 驗證 `classification: "unclassified"` 時 `code` 必須為 `null`

**驗收**:餵一個刻意不在 rubric 內的差異(例如 `letter-spacing` 微調),AI 必須輸出 `unclassified` 而非硬塞分類。

---

## T4 — 報告輸出

- [ ] `deterministic_violations` 與 AI findings 合併,依 severity 排序
- [ ] 每條顯示:code / severity / node path / 證據數字 / **source 連結**
- [ ] `skipped_checks` 獨立一區,不要混進違規列表

**驗收**:任意一條違規,都能在 3 秒內點到它的 spec 依據。

---

## T5 — 第一週維運

三個指標,在 `out/` 累積:

| 指標 | 判讀 | 錯誤的反應 |
|---|---|---|
| 確定性規則誤報率 | 高 → rubric `condition` 太鬆 | ~~直接調低 severity~~ |
| `unclassified` 比例 | 接近 0 → 抽驗 20 筆對 `condition`;>50% → rubric 覆蓋不足 | ~~調 LLM confidence 閾值~~(沒有校準的旋鈕) |
| `skipped_checks` 佔比 | 過高 → GESTALT-001 實際覆蓋遠小於預期,重估規則價值 | ~~放寬 guard~~(違反 ADR-006) |

抓到第一批誤報時,先分辨是**規則條件太鬆**還是**量測本身就不該發生**——兩者修法不同。

---

## T6 — 裁決 `gap` 的三重計數

真實頁面實測(`npm run test:e2e`):把 `.property-group { gap: 8px }` 改成 `12px`,
一個 CSS 宣告產生 **三筆** TOKEN-002 —— `gap`、`rowGap`、`columnGap` 是同一個宣告的三種讀法,
`getComputedStyle` 三個都回值,`SPACING_PROPS` 三個都收。

單元 fixture 看不出這件事(fixture 只寫 `gap` 一個屬性),真實頁面一定會踩到。

- [ ] 決定合併規則:同一節點上 `gap` 與 `rowGap` / `columnGap` 值相同時,只報 `gap`
- [ ] 確認 `row-gap` 與 `column-gap` 分開宣告成不同值時,兩條都要留
- [ ] 三處同步:`src/core/rubric-engine.js` / `test/fixture.js` 加一個雙軸不同值的案例 / `README.md`

**這不是放寬 guard**(ADR-006 管的是「量不到就跳過」),是同一個事實被數了三次。
但它會改變確定性違規的筆數,所以要當成決策做,不要當成清理順手改掉。

**驗收**:e2e 對同一個 fixture 的 TOKEN-002 筆數從 9 降到 3,且五條規則仍全部觸發。

---

## 明確不做

- Icon glyph 的 optical centering(需要 raster)
- Pixel diff / 視覺回歸(見 ADR-003 的取捨)
- 非 flex/grid 容器的間距關係(ADR-006)
- 修改 production build 設定以取得可追溯的 class 命名(待裁決)
