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

- [x] **spacing 逆映射**(已完成 —— ADR-019 / ADR-020)
      `resolveSpacing(value, density)`;scale 檔改成 `densities: { md, lg }`,
      由 `npm run tokens:extract -- --kind spacing --density md,lg` 從 DS 的 CSS 抽出。
      density 是每個節點各自的屬性(subtree 可覆寫),不明時不猜預設值 ——
      TOKEN-001 進 `skipped_checks`、TOKEN-002 整組跳過。
      另外排除 margin / padding 的 `0px`(與「沒設定」的 computed value 相同,分不出是不是決定),
      提示因此從 66 筆降到 2 筆。
      **驗收結果**:`npm run test:density` 全過(md 的 16px = `layout-space-loose`、
      lg 的 16px = `layout-space-tight`);端對端實測 TOKEN-002 回報真實 token 名。

- [x] **ELEVATION-001 維持 AI 判**(2026-08 裁決)
      spec 的配對規則看似機械可查,但要套用它得先知道元素是內容層還是浮層 ——
      那是角色判斷,不在 computed style 裡。程式送事實,判定給 AI。

**T0 已全部完成。**

**目前可用的規則**:八條全部。TOKEN-002 / RENDER-001 / GESTALT-001 / ALIGN-001 / TRUNC-001 定讞,
TOKEN-001 出提示,EMPHASIS-001 / ELEVATION-001 交給 AI。

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

- [x] 決定 egress 路徑 —— 公司內部 gateway(2026-08 user 裁決,見 ADR-022)
- [x] 寫 `src/node/llm.js`,吃 payload 吐經過驗證的 findings
- [x] 驗證輸出的每個 `code` 都在 rubric 的 `evaluator: "ai"` 清單內
      —— 用 structured outputs 讓它**結構上不可能**發生,不是事後重試
- [x] 驗證 `classification: "unclassified"` 時 `code` 必須為 `null`
- [x] 連線體檢 `npm run llm:check`:回報閘道器實際支援哪些能力
      (Messages API / adaptive thinking + effort / structured outputs)

**驗收**:餵一個刻意不在 rubric 內的差異,AI 必須輸出 `unclassified` 而非硬塞分類。
→ **尚未對真實 gateway 驗收**。離線的合約檢查已全部通過(`npm run test:llm`),
但「模型面對 rubric 外的差異會不會硬塞」只能對真模型跑才算數。

### 上線前要跑的順序

```bash
export DQA_LLM_BASE_URL='https://<internal-gateway>'
export DQA_LLM_API_KEY='...'        # 或 DQA_LLM_AUTH_TOKEN(Bearer)
npm run llm:check                    # 先確認閘道器支援什麼
npm run llm:classify out/payload.json out/findings.json
```

`llm:check` 三項全綠才有意義往下走。`structured outputs` 那項若是紅的,
`llm.js` 會自動降級成純文字 JSON —— 那時 `validateFindings()` 是唯一防線,
誤分類的風險明顯上升,要在報告裡標明。

**尚未做**:把 findings 併進報告(那是 T4)。

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
| `notices` 人工確認成立比例 | 長期偏低 → 這條規則對這個 DS 沒價值,依 ADR-007 移除 | ~~把它升回 violation 讓數字好看~~ |
| `unclassified` 比例 | 接近 0 → 抽驗 20 筆對 `condition`;>50% → rubric 覆蓋不足 | ~~調 LLM confidence 閾值~~(沒有校準的旋鈕) |
| `skipped_checks` 佔比 | 過高 → GESTALT-001 實際覆蓋遠小於預期,重估規則價值 | ~~放寬 guard~~(違反 ADR-006) |

抓到第一批誤報時,先分辨是**規則條件太鬆**還是**量測本身就不該發生**——兩者修法不同。

---

## T6 — `gap` 的三重計數(已完成 —— ADR-021)

真實頁面實測:一個 `gap` 宣告產生三筆 TOKEN-002,因為 `gap` / `rowGap` / `columnGap`
是同一個宣告的三種讀法,`getComputedStyle` 三個都回值。

- [x] 合併規則:`rowGap` 與 `columnGap` 解析結果相同時只報一筆 `gap`
- [x] `row-gap` 與 `column-gap` 分開宣告成不同值時,兩條都留(fixture 的 ⑥ 就是這個案例)
- [x] `gap` 簡寫永遠不逆映射 —— 兩軸不同時它的 computed 是 `"8px 16px"`,
      `parseFloat` 會安靜地取到 8。**原本的實作有這個 bug**,只是兩軸相同時看不出來
- [x] 三處同步:`src/core/tokens.js`(`collapseGapEntries`)/ `src/core/rubric-engine.js` /
      `src/core/payload.js`(比較時兩側都等向才合成)/ `test/fixture.js` 加了雙軸不同的案例 / `README.md`

**驗收結果**:e2e 同一份 fixture 的 TOKEN-002 從 15 筆降到 4 筆,五條規則仍全部觸發。

---

## T7 — 觀察 Tailwind 4px 倍數的提示成立比例(2026-08 決定)

該 DS 的間距有一部分來自 Tailwind utility(`p-2` / `gap-3`),它們是 4px 的倍數但**不是具名 token**,
所以一律落在「不對應任何 token」→ 出 TOKEN-001 提示。

**決定先不收斂**,用 T5 的「`notices` 人工確認成立比例」判斷,而不是先猜一個門檻。
理由同 ADR-018:提示的價值在可複現,該不該收斂要看人工確認的結果,
不是看它有幾筆(那是用數量粉飾判斷)。

- [ ] 累積至少 20 筆 Tailwind 倍數的提示,人工確認有幾筆真的該改
- [ ] 成立比例偏低 → 考慮把 4px 倍數視為「合法但無名」另立一類,或依 ADR-007 收窄 TOKEN-001
- [ ] 成立比例高 → 維持現狀,這些提示本來就該看

**錯誤的反應**:直接把 4px 倍數加進 spacing scale 當成 token。
那個 DS 的 token 定義裡沒有它們,硬加等於偽造依據(違反 ADR-007 與 ADR-016)。

---

## 明確不做## 明確不做

- Icon glyph 的 optical centering(需要 raster)
- Pixel diff / 視覺回歸(見 ADR-003 的取捨)
- 非 flex/grid 容器的間距關係(ADR-006)
- 修改 production build 設定以取得可追溯的 class 命名(待裁決)
