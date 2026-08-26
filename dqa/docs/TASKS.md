# 實作任務

依序做。每個任務的驗收條件是**可執行的**,不是「看起來對」。

---

## T0 — 對齊真實 design system(阻擋所有後續任務)

對照基準已確定:**@qijenchen/design-system**(<https://github.com/ajenchen/design-system>)。
完整對照與證據見 `docs/DESIGN-SYSTEM.md`。

已完成:

- [x] `rubric.json` 每條的 `source` 指到該 repo 的實際 spec 檔(全部可點開)
- [x] `config.example.json` 換成真實 Storybook URL + 真實 story id + density globals
- [x] `envConsistency` 比對 `data-density` / `data-layout-space`(density 會整組換掉間距值)

仍未完成 —— 這三項是三個不同性質的問題,不要混在一起處理:

- [x] **色彩正規化**(bug,已修 —— ADR-014 / ADR-015)
      `extract.js` 用 canvas 把色值正規化成 `rgb()` / `rgba()` 後才進 `style`(瀏覽器自己的引擎,
      不自己實作色彩空間數學);`contrastRatio` 先把前景 alpha 合成到有效背景上,
      `effectiveBg()` 也會把中間的半透明層疊回去。
      **驗收結果**:`npm run test:color` 全過(85% 黑 on 白 → `#262626`,對比度 15.13 而非 21);
      `npm run test:e2e` 的 fixture 改用 `oklch(0 0 0 / 0.65)`,正規化拔掉會有 7 項斷言失敗。

- [x] **色彩 token 定義檔**(已產出 —— ADR-016 / ADR-017)
      `scripts/extract-tokens.mjs` 從 DS 的 CSS 抽出 149 個相異色值(17 個帶 alpha),
      走的是與量測同一個正規化器。token 定義檔改用 `#rrggbbaa`,逆映射索引鍵含 alpha ——
      該 DS 的整條 neutral scale 是「黑 + 不同 alpha」,只比 hex 會把九個 token 壓成一個。
      **驗收結果**:`npm run test:tokens` 全過;端對端實測 `oklch(0 0 0 / 0.65)` → `fg-secondary`。
      重抽指令與參數見 `docs/DESIGN-SYSTEM.md`。

- [ ] **決定 spacing 逆映射怎麼做**(這是設計,不是填值)
      DS 沒有數字階梯。間距來自語意 token(隨 density 變)、family 尺寸、Tailwind 4px 倍數三個來源。
      「16px 是哪個 token」沒有唯一答案(md 的 loose = lg 的 tight = 16)。
      **不要**把它硬壓成一張平表填進 `tokens/spacing-scale.json` —— 那是 ADR-006 明令禁止的推測值。
      **驗收**:`resolveSpacing` 吃得到 density,且對「md 16px」與「lg 16px」給出不同的 token 名。

- [ ] **裁決 TOKEN-001 的去留**
      DS 的判準是「同值在 ≥ 2 處需同步 → 必開 token」,單一 consumer 的 hardcode 合法。
      DQA 量的是「值有沒有名字」,兩者不是同一條規則 → 系統性誤報。
      三個選項(降級成提示 / 改判鄰域內同語意位置的值不一致 / 依 ADR-007 移除)見 `docs/DESIGN-SYSTEM.md`。
      **驗收**:對 DS Storybook 的任一 story 跑一次,TOKEN-001 的誤報率可被說明,而不是「看起來很多」。

**目前可用的規則**:GESTALT-001 / ALIGN-001 / TRUNC-001 / ELEVATION-001 / EMPHASIS-001
(色彩那一側從量測到逆映射已完整)。
TOKEN-002 / RENDER-001 要等 spacing 逆映射;TOKEN-001 要等規則裁決。

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
