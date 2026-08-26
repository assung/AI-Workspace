# 架構決策紀錄(ADR)

每條都記錄**被否決的替代方案**。沒有這一欄,後人會把已經否決過的方案再做一次。

---

## ADR-001 — 以 Storybook computed style 為比對基準,但只作為元件契約

**決定**:Storybook canvas 提供「元件被正確消費時該長什麼樣」的可執行規格,不會 stale。

**哪一份 Storybook**(2026-08 確定):`@qijenchen/design-system`
(<https://github.com/ajenchen/design-system>,Storybook 部署於 <https://ajenchen-design-system.netlify.app/>)。
story id 的 canonical 清單在該 repo 的 `packages/design-system/ds-story-manifest.json`。
規則依據與三個已知不相容見 `docs/DESIGN-SYSTEM.md`。

**否決的替代**:以 Figma 為 ground truth。

**理由**:Figma 檔案有 staleness 風險,且需要 MCP 往返。但要清楚知道 Storybook 只驗**元件契約**,不驗**頁面設計意圖**——「元件沒壞但用錯 / 組合錯」這類問題不在它的覆蓋範圍。

**未裁決**:近 20 次設計 review 打回紀錄中,「元件內部走樣」的佔比。低於三成的話這道 gate 的價值要重估。

---

## ADR-002 — 擷取範圍為鄰域,非 subtree

**決定**:
- T = 目標節點
- P = T 的 parent → 取 P 的全部直接 children = T 的 siblings → **intra**
- G = P 的 parent → 取 G 的全部直接 children = P 的 siblings → **inter**
- 另附 T 的直接 children

**否決的替代**:擷取目標節點的 subtree。

**理由**:Gestalt proximity 的證據在 sibling 身上,不在目標節點內部。

具體案例(Notion property list):群組內 gap 用 `space-300`,群組間 gap 也用 `space-300`,兩者都是合法 token。Storybook 只渲染一個群組,所以跨環境 diff 得到 12px vs 12px、**零差異**。但 proximity 已經失效,使用者看到的是無法解析結構的一坨。Polaris spacing scale 存在的唯一理由就是「群組內 < 群組間」這個不等式,而不等式是同側節點之間的關係,subtree 擷取拿不到。

**對標**:NN/g proximity、Material 3 spacing、Polaris spacing scale。

---

## ADR-003 — 幾何座標比 computed style 更脫敏

**決定**:送 `getBoundingClientRect()` 的 `[x, y, w, h]`、`baselineY`、`measuredWidth` / `availWidth`。

**否決的替代**:「只送屬性差異數值,不送幾何,以求最大脫敏」。

**理由**:這個前提是錯的。`getComputedStyle` 本身就是外洩來源:

| 屬性 | 洩漏內容 |
|---|---|
| `background-image` | `url(https://cdn.internal.corp/logos/customer-acme.png)` — 客戶名、內部 CDN 拓撲 |
| `content`(pseudo) | 字面文字,例如 `"已核准"` |
| `font-family` | 內部授權字型名、專案代號 |
| `var(--*)` | feature flag 名、環境變數 |
| `grid-template-areas` | 具名區域,例如 `"pii-panel"` 直接洩漏資料分類 |

既然無論如何都要寫 allowlist,加幾何就不是資安門檻問題。四個浮點數無法反推內容,**敏感度嚴格低於已經打算送的 `background-image`**。

**進退兩難的記錄**:不查 pseudo element 就抓不到狀態指示器樣式;查了就開始送真實文字。目前選擇不查,列為已知盲區。

**實作**:`src/browser/extract.js` 的 `STYLE_DENYLIST` + `sanitize()` 雙層防禦。

---

## ADR-004 — severity 與偏差量無關

**決定**:
- `token === null` → `TOKEN-001`,severity 固定 `medium`,**沒有 delta 條件**
- 兩側 token 不同 → `TOKEN-002`,`high`
- 兩側同 token 且 `|delta| < 2` → `RENDER-001`,`info`

**否決的替代**:「`delta < 2px` 且 `token` 為 null → 歸類為次要渲染差異」。

**理由**:`token: null` 的意思是**有人寫了魔術數字**。13px 不在 scale 上,跟 40px 不在 scale 上,是同一個違規——設計系統的約束被繞過了。而 1px 偏離恰好是最容易繁殖的那種:看起來無害、review 時沒人擋、然後被複製到下一個元件。

**對標**:Polaris / Material 的 spacing scale 定義的是「不允許 scale 外的值」,不是「不允許偏離超過 2px」。

`delta` 只在兩側都 exact 命中同一 token 時才有意義。

---

## ADR-005 — 分流的是規則,不是 payload

**決定**:

```json
{
  "nodes": [...],                    // 完整鄰域,整包送
  "nodes_storybook": [...],
  "deterministic_violations": [...], // 既定事實
  "unresolved": ["n12.boxShadow"]    // AI 的作業範圍
}
```

**否決的替代**:AI 只看 `unresolved_diffs` 陣列,`nodes` 不送。

**理由**:`unresolved_diffs` 是屬性差異陣列,退回了 ADR-002 之前的狀態。

具體案例:`box-shadow: none → 0px 2px 4px`。elevation 是**相對量**,Material 的 elevation 系統管的是同一平面上誰浮在誰之上。只給一條屬性差異,AI 沒有鄰域節點的 elevation 可比,唯一能做的就是掰一個聽起來合理的答案——這正是要消滅的幻覺。

一句話:**限縮 AI 該回答什麼,不要限縮它能看到什麼。**

---

## ADR-006 — 量不到就說量不到

**決定**:以下情況一律輸出 `null` 並記入 `skipped_checks`,不推測:

| 情況 | skip reason |
|---|---|
| parent 非 flex/grid | `BLOCK_FLOW_NOT_MEASURABLE` |
| 子節點 absolute/fixed | `CHILD_OUT_OF_FLOW` |
| flex 換行 | `FLEX_WRAPPED` |
| sibling 重疊 | `OVERLAPPING_SIBLINGS` |
| children < 2 | `INSUFFICIENT_CHILDREN` |

**否決的替代**:所有容器都用 bounding box 相減算出 gap。

**理由**:傳統 block flow 的縫隙來自 margin collapse、父容器 padding、line-height 撐開的隱形空間,三者混在一起壓成一個 gap 數字必然產生大量誤報。而誤報是這道 gate 的死因(Alert Fatigue → 第三週沒人看)。

寧可少報一條,也不要送出一個看起來精確的推測值。

---

## ADR-007 — rubric 外部化 + evaluator 路由

**決定**:`rubric.json` 每條規則至少四欄:`code` / `condition` / `severity` / `source`。
`evaluator` 決定路由:
- `deterministic` → 程式判,100% 可複現,AI 不得推翻
- `ai` → 門檻不存在於任何 spec,程式只把數字算成**事實**,由 AI 依脈絡判斷

**否決的替代**:rubric 規則寫在 prompt 字串裡。

**理由**:寫在 prompt 裡的規則三個月後沒人知道改過幾次,也無法回答「這條規則的依據是什麼」。爭議發生時大家看 `source`,不是猜 AI 為什麼這樣想。

**EMPHASIS-001 的具體處理**:emphasis 分數(`fontSize × fontWeight × contrast`)程式算得出來,但**門檻值不存在於任何既有 spec**。硬定一個門檻就違反了「沒有 source 不准進 rubric」。因此:分數算成事實寫進 payload,判定留給 AI。這是 `deterministic` / `ai` 分界的標準案例。

---

## ADR-008 — TRUNC-001 為單側檢查

**決定**:truncation 只在 production 側評估:`overflowX > 0 && clipping && !hasAffordance`。

**否決的替代**:把 truncated 狀態放進跨環境 diff。

**理由**:Storybook 的 `availWidth` 由 story 容器決定,通常寬鬆或無約束。所以「SB `truncated: false` / prod `truncated: true`」是**預期**而非 bug,報出來就是誤報。

具體案例(Stripe customers table):email 欄位兩側 `text-overflow` 都是 `ellipsis`,computed style 完全相同、零差異。但 production 實際渲染成 `jo…@example.com`,兩個不同 customer 顯示成同一個字串且無 tooltip——這不是樣式 bug,是資訊丟失。

**推論**:checks 必須分 `comparative` 與 `single_side` 兩類,不能全部塞進 diff 陣列。密度一致性也屬於後者。

---

## ADR-009 — 環境鎖鎖的是 viewport 寬度,不是 DPR 換算

**決定**:preflight 斷言 `document.documentElement.clientWidth === expected`;`dpr` 只記錄,交由 node 端比對兩側是否一致。

**否決的替代**:「將座標運算根據 `devicePixelRatio` 進行反向正規化」。

**理由**:這是技術錯誤。`getBoundingClientRect()` 回傳的本來就是 **CSS px**,與 DPR 無關,反向換算會把正確的值弄壞。真正會毀掉幾何的是瀏覽器縮放改變了有效 viewport 寬度、進而改變 layout,所以要鎖的是寬度。

pinch zoom 可用 `visualViewport.scale` 直接偵測;瀏覽器層級縮放無法可靠偵測,由寬度斷言間接把關。

**附帶決定**:所有座標轉為**相對鄰域根節點**。兩個環境的頁面偏移量不同,送 viewport 絕對座標會讓每個 box 都不一樣,diff 全紅。

---

## ADR-010 — 字型鎖是 metrics 的絕對前提

**決定**:`await document.fonts.ready`,且 pending 字型數 > 0 即 fail。

**理由**:在 fallback 字型狀態下量到的 `baselineY` 與 `measuredWidth` 全錯,而且**錯得很安靜**——數字看起來完全正常。這一條漏掉,對齊(ALIGN-001)與截斷(TRUNC-001)兩大類同時失效。

**脫敏注意**:只回報 pending 的**數量**,不回報 family 名稱(內部授權字型名 / 專案代號)。

---

## ADR-011 — 判定邏輯環境無關化,兩條擷取路徑共用同一份 core

**決定**:`src/core/*.js`(tokens / rubric-engine / payload / prompt)不碰檔案系統,rubric 與 token scale 一律由呼叫端注入。Node CLI 用 `src/node/data.js` 讀檔後注入;Chrome Extension 用 `fetch(chrome.runtime.getURL(...))` 或使用者在設定頁貼上的覆寫版本注入。

**否決的替代**:讓擴充套件自己實作一份輕量版判定,只把「擷取」共用。

**理由**:確定性違規的定義是「既定事實,AI 不得推翻」(ADR-007)。事實只要有兩份實作,就會出現「CLI 說 TOKEN-002、擴充套件說沒事」這種爭議,而這種爭議無法收斂 —— 沒有第三方可以裁決哪一份才算數。共用一份 core 讓兩條路徑的輸出可以逐字比對,`test/core-browser.test.js` 就是在驗這件事。

**代價**:core 不能用 `require`、`fs`、`import`,只能寫成同時支援 CommonJS 與一般 `<script>` 的 UMD 形式,而且相依順序要靠 `report.html` 的 `<script>` 排列維持。這個代價是明確接受的。

**同時決定的**:`extension/` 底下的 `browser/`、`core/`、`data/` 全部是 `src/` 與 `rubric.json` / `tokens/` 的複製品(Chrome 只能載入擴充套件資料夾內的檔案),由 `npm run sync:ext` 產生、`npm run test:sync` 驗證。**不要手改複製品。**

---

## ADR-012 — 擴充套件只能斷言 viewport,不能宣告 viewport

**決定**:擴充套件不自動改視窗大小來「達成」設定的寬度,而是量到不符就拒絕擷取,並提供一個明確的「校正視窗」動作交給使用者按。

**否決的替代**:每次擷取前自動 resize 視窗到設定寬度。

**理由**:Playwright 的 `newContext({ viewport })` 是宣告式的 —— 寬度就是那個值。擴充套件跑在使用者自己的視窗裡,`chrome.windows.update` 給的是**外框**寬度,實際 viewport 還要扣掉捲軸、DevTools、系統邊框,而且可能撞到螢幕寬度上限而靜靜地達不到目標。自動 resize 會讓「我設定了 1280」與「我量到的是 1280」看起來一樣,實際上不是 —— 這正是 ADR-009 要防的那種安靜的錯誤。

**因此**:`meta.captureMode` 記錄擷取路徑。同一份 rubric 在兩條路徑下的環境保證強度不同,判讀報告時必須知道是哪一條。

---

## ADR-013 — 擴充套件不對外連線

**決定**:擴充套件不內建任何 LLM 呼叫。報告頁產出 prompt,由使用者自己複製或下載,送進公司 gateway。

**否決的替代**:在設定頁填 API endpoint + token,一鍵跑完分類。

**理由**:egress 路徑的決定權不在這個工具手上(見 `docs/TASKS.md` 的 T3)。一個安裝在每個人瀏覽器裡、可以把頁面量測結果送去任意 endpoint 的擴充套件,資安審查會直接擋下 —— 而且擋得有道理。manifest 裡沒有任何 `host_permissions` 寫死的外部網域,這件事本身就是可稽核的證據。

**代價**:多一次複製貼上。接受。

---

## 待裁決(尚未進入實作)

| 議題 | 需要什麼才能裁決 |
|---|---|
| gate 是否 blocking | pilot 的 false positive rate,且閾值必須在看到數字**之前**訂 |
| Storybook 環境對齊的所有權 | 有沒有人有義務修 story |
| 是否值得爭取 codebase 存取 | 無存取權是政策性還是流程性限制 |
| 是否加入灰塊骨架截圖 | 資安對「不可讀的灰塊圖」是否視為敏感資料 egress |
| `gap` / `rowGap` / `columnGap` 是否合併成一條違規 | 同一個 CSS 宣告目前會產生三筆 TOKEN-002(見 `docs/TASKS.md` 的 T6 實測數字)。要先確認合併之後 `row-gap` 與 `column-gap` 分開宣告的情況不會被吃掉 |
