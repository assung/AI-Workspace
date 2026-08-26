# DQA — Design QA Gate

工程完成 → 設計師 review 之間的第一道 gate。
比對 Storybook canvas 與 production 的 runtime 狀態,輸出**設計判斷**而非技術差異列表。

環境限制:內網、無 codebase 存取、不依賴 CI、payload 必須脫敏。

---

## 動手前必讀

### 不可回退的五條(改動前先讀 `docs/DECISIONS.md` 對應條目)

1. **分流的是規則,不是 payload。** `nodes` 永遠整包送給 AI。限縮 AI 該回答什麼(`unresolved`),不限縮它能看到什麼。
   → 任何「只送 diff 給模型以節省 token」的重構都是回退,見 ADR-005。

2. **擷取範圍是鄰域,不是 subtree。** T + P 的全部 children + G 的全部 children。
   → 改成 `querySelectorAll` 向下遍歷會讓 GESTALT-001 永遠不觸發,見 ADR-002。

3. **量不到就說量不到。** block flow 的間距、無法解析的 token、fallback 字型下的 metrics —— 一律輸出 `null` 並記進 `skipped_checks`,不推測、不取近似值填補。
   → 見 ADR-006。

4. **severity 不隨偏差量浮動。** `token: null`(魔術數字)的嚴重度固定,與 `delta` 大小無關。
   → 「delta < 2px 就降級成次要」是明確的錯誤設計,見 ADR-004。
   規則要降級請改 `outcome`(定不定讞),不要動 severity —— 那是兩個不同的軸,見 ADR-018。

5. **沒有 `source` 的規則不准進 `rubric.json`。** 每條規則必須指回既有 spec 或 token 定義檔。找不到依據的差異輸出 `unclassified`,交給人。
   → 見 ADR-007。

### 專案工作慣例

- **`tokens/color-primitives.json` 是產生檔。** 要改就改抽取參數重跑 `npm run tokens:extract`,不要手改(ADR-016)。
- **新增任何值 / 名 / pattern 前先 grep 既有的。** 特別是 rubric code 命名(`DOMAIN-NNN`)、skip reason 常數、style allowlist 條目。不要憑感覺造新的。
- **改一處必看三處。** 改 `rubric.json` 的規則 → 同時看 `src/node/rubric-engine.js` 的實作、`test/fixture.js` 的對應案例、`README.md` 的表格。三方不同步就是 bug。
- **fixture 要照 computed style 的真實形狀給。** 例如 gap 永遠是 `gap` / `rowGap` / `columnGap`
  三個屬性,只寫簡寫就測不到合成邏輯,而且跟 `extract.js` 送出的資料不一樣(ADR-021)。
- **測試 fixture 必須是可辨識的真實業務場景**(Jira issue detail、Stripe customers table、Notion property list)。禁止 `Option A/B/C`、`div1/div2`、極端不現實的數值。
- **對標世界級。** 新增規則時要能回答「Polaris / Material / Apple HIG / Atlassian / NN/g 怎麼定義這件事?」規則的 `source` 若只是內部慣例而無外部對應,在 ADR 裡寫明為什麼不同。

---

## 架構

```
preflight.js   環境鎖(fonts.ready / viewport / 動畫 / theme)—— 任一項失敗即 throw
     ↓
extract.js     鄰域擷取 → allowlist → sanitize → 幾何 / baseline / 文字度量
               ⚠ 文字字串永不離開瀏覽器,只有 measureText 算出的數字離開
     ↓
tokens.js      本地 token 逆映射 → { px, token, exact, nearest, delta }
     ↓
rubric-engine  確定性規則 → deterministic_violations(既定事實,AI 不得推翻)
               量得到但不足以定讞的 → notices(outcome: notice,人看的)
               量不到的 → skipped_checks
     ↓
payload.js     nodes 整包 + 事實層 + unresolved 清單
     ↓
prompt.js      AI 只答 unresolved,只能引用 rubric code
```

### 兩條擷取路徑

| | Playwright CLI | Chrome Extension |
|---|---|---|
| 進入點 | `src/node/run.js` | `extension/popup/` + `extension/background.js` |
| 目標指定 | config 的 selector | 頁面上用挑選器點 / 後備 `[data-dqa-target]` |
| viewport | `newContext({ viewport })` **宣告** | preflight **斷言**,不符就拒絕(ADR-012) |
| 適用 | 內網可直連、要進 CI 或批次跑 | Storybook / STG 在 SSO 後面,只有瀏覽器進得去 |

**兩條路徑共用同一份實作,不是各寫一份:**

- `src/browser/*.js` —— 量測。Playwright 用 `addScriptTag`,Extension 用 `chrome.scripting`。
- `src/core/*.js` —— token 逆映射、rubric 引擎、payload、prompt。
  **不碰檔案系統**:rubric 與 tokens 一律由呼叫端注入(Node 讀檔、Extension `fetch` 或使用者覆寫)。見 ADR-011。

`extension/` 底下的 `browser/`、`core/`、`data/` 是複製品(Chrome 只載得到自己資料夾裡的檔案)。
**不要手改複製品** —— 改 `src/`,然後 `npm run sync:ext`。`npm run test:sync` 會在不同步時失敗。

只屬於擴充套件的東西不要放進 `src/`:挑選器(`extension/picker.js`)、
chrome API 封裝(`extension/lib/`)、UI(`popup/` `report/` `options/`)。
`src/browser/` 是兩條路徑共用的量測層,不能被單邊需求污染。

---

## 指令

```bash
npm test              # 確定性引擎 fixture 驗證,不需網路
npm run test:guards   # gap guard 的邊界案例
npm run test:sanitize # sanitize 的外洩向量
npm run test:color    # 色彩正規化輸出、alpha 合成、有效背景堆疊
npm run test:density  # spacing 逆映射的 density 相依性、0px 的可觀測性
npm run test:core     # core 在 Node 與瀏覽器兩條路徑上的輸出必須逐字相同
npm run test:sync     # extension/ 的複製品與 src/ 一致
npm run test:ext      # 擴充套件靜態完整性(manifest / script src / 可解析)
npm run test:all      # 以上全部,都不需要瀏覽器

npm run dqa config.json out   # Playwright 路徑
npm run sync:ext              # src/ → extension/ 同步

# 從 design system 的 CSS 抽色彩 token(需要瀏覽器,參數見 docs/DESIGN-SYSTEM.md)
npm run tokens:extract -- --css <ds>/tokens/color/primitives.css --demote '^color-'
npm run tokens:extract -- --kind spacing --css <ds>/tokens/layoutSpace/layoutSpace.css --density md,lg

# 需要瀏覽器,不含在 test:all
DQA_CHROMIUM=/path/to/chrome xvfb-run -a npm run test:e2e     # 擴充套件端對端
DQA_CHROMIUM=/path/to/chrome xvfb-run -a npm run test:tokens  # token 抽取
```

---

## 目前狀態

已驗證(fixture):TOKEN-001 / TOKEN-002 / GESTALT-001 / ALIGN-001 / TRUNC-001 / RENDER-001,
以及 7 種 gap guard 跳過路徑、3 種 sanitize 外洩向量。

已驗證(真實 Chromium,`npm run test:e2e`):五條確定性規則在真的排版過的頁面上全部觸發;
`baselineY` 落在行盒頂端往下 0.850 個 lineHeight;挑選器的框線不會混進鄰域;
viewport 不符時擷取確實被擋下。

**仍未驗證**:`measuredWidth` 的絕對精度(等寬字串誤差 < 1px)、
字型鎖在真的有 webfont 的頁面上的效果 —— 見 `docs/TASKS.md` 的 T1 剩下兩項。

已知盲區:
- icon glyph 的 optical centering(需要 raster,本階段不做)
- 同一個 `gap` 宣告目前會產生三筆 TOKEN-002,見 T6

---

## 接手時第一件事

讀 `docs/DESIGN-SYSTEM.md`。

對照基準是 [@qijenchen/design-system](https://github.com/ajenchen/design-system)。
`rubric.json` 的 `source` 指到它的實際 spec,`tokens/*.json` 兩份都是從該 DS 抽出來的
**產生檔,不要手改**(`npm run tokens:extract`,見 ADR-016)。

spacing 是 **density-aware** 的:`--layout-space-loose` 在 md 是 16px、lg 是 24px,
所以 `resolveSpacing` 吃 density,不明時跳過而不是猜預設值(ADR-019)。

**八條規則全部可用**:TOKEN-002 / RENDER-001 / GESTALT-001 / ALIGN-001 / TRUNC-001 定讞,
TOKEN-001 出提示不定讞(ADR-018),EMPHASIS-001 / ELEVATION-001 交給 AI。
