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

## ADR-014 — 色彩正規化用瀏覽器當引擎,不自己實作色彩空間轉換

**決定**:`src/browser/extract.js` 在色值進入 `style` 之前,用 canvas 把它正規化成 `rgb()` / `rgba()`
(`fillStyle = 值` → `fillRect` → `getImageData`)。core 完全不碰色彩空間數學。

**否決的替代**:在 `src/core/tokens.js` 實作 oklch → oklab → linear sRGB → gamma 的轉換。

**理由**:那段矩陣運算本身不難,實測對 DS 的色票也算得出跟 Chromium 一模一樣的值。
分歧點在**色域外的 gamut mapping** —— `@qijenchen/design-system` 的色票有相當比例超出 sRGB
(`--color-blue-6` = `oklch(0.54 0.22 258)` 就是),而 CSS Color 4 的 gamut mapping 不是單純裁切。
維護一份「必須永遠跟畫出這個頁面的引擎一致」的第二套色彩實作,就是 ADR-011 要避免的
「同一個事實兩份答案」。canvas 用的是同一顆引擎,而且 relative color syntax
(`oklch(from var(--x) calc(l*0.44) c h)`)在 computed 階段就已經解析完,不需要另外處理。

**為什麼放在 browser 層而不是 core**:只有瀏覽器裡有那顆引擎。放進 `src/browser/` 的附帶好處是
Playwright 與 Extension 兩條路徑同時修好,而且 payload 形狀不變 ——
`rgbToHex()` 本來就吃 `rgb()`/`rgba()`,core、fixture、既有測試一行都不用改。

**正規化目標空間是 sRGB,這是刻意的**:超出色域的色票在 P3 螢幕上的實際顯色與此不同。
但 DQA 要的是兩側可比、跨機器可複現,sRGB 是唯一站得住的正規空間。

**失敗時保留原字串**,不丟棄 —— 少一個欄位比送一個看不懂的值糟。

---

## ADR-015 — 對比度必須先合成 alpha

**決定**:`contrastRatio` 的兩個輸入都是**合成後**的色。前景帶 alpha 時先疊到有效背景上;
有效背景本身若有半透明層,一路往上疊到第一個不透明層為止。

**理由**:`@qijenchen/design-system` 的 `--foreground` 是 `oklch(0 0 0 / 85%)` —— 預設文字色本身就是半透明的。
不合成會把「85% 黑 on 白」算成純黑的 **21:1**,而使用者實際看到的是 **15:1**。
這個錯誤在 placeholder 資料下完全看不出來(那些色都不透明),換成真實 DS 才會浮出來,
而且錯得很安靜 —— 數字看起來完全正常。

**同時修的**:舊的 `effectiveBg()` 只往上找第一個 `alpha === 1` 的背景就回傳,
中間的半透明層直接被忽略。用 alpha 疊色是 design system 的常態
(該 DS 的 `--surface` 在 dark mode 就是 `--white-a08`),忽略中間層等於算錯底色。

**留下的假設**:一路往上都沒有不透明背景時,假設頁面底色是白的。
這是假設不是量測值,`emphasis.bgEffective` 會把用到的底色寫出來,判讀時看得到。

---

## ADR-016 — 色彩 token 定義檔由瀏覽器求值產生,不手寫

**決定**:`tokens/color-primitives.json` 由 `scripts/extract-tokens.mjs` 產生 ——
開一個載入了 design system CSS 的頁面,把每個自訂屬性套到元素上讀 computed value,
再經過 `window.__DQA__.normalizeColor`(ADR-014 的同一個正規化器)轉成 sRGB。

**否決的替代 1**:直接讀 CSS 檔用字串解析。
`getComputedStyle(root).getPropertyValue('--color-blue-9')` 拿到的是
`oklch(from oklch(0.54 0.22 258) calc(l*0.44) calc(c*0.65) h)` ——
**代換過但沒求值**。自訂屬性是 token stream,relative color syntax 與 `calc()` 都不會被算。
要拿到真正的顏色,只能把它套到元素上。

**否決的替代 2**:手寫維護一份 hex 對照表。
`@qijenchen/design-system` 的色階是用相對公式從 base-6 推導的
(`L = l × D`,D: 7=0.82 8=0.62 9=0.44 …),手寫等於把公式的結果凍結成魔術數字,
上游改一個 base 色,這份表就整條錯掉且沒人會發現。

**關鍵約束**:token 定義那一側與量測那一側必須經過**同一個**正規化器。
兩邊各自量化的話,逆映射是拿兩種精度在做精確比對,永遠對不上。
腳本因此直接 `addScriptTag` 載入 `src/browser/extract.js`,而不是自己複製一份轉換邏輯。

**同色多名怎麼選**:一個顏色值常常有多個 token 名(`--foreground` 與 `--color-neutral-9`)。
computed style 只看得到顏色,程式無法分辨實作寫的是哪一個,所以選一個進 `scale`、其餘進 `_aliases`。
挑選順序是「未被 `--demote` 命中 → 名稱短 → 字典序」。
`--demote` 是參數而不是內建規則,因為哪些名稱屬於 Internal 層是各 design system 自己的慣例。
**實測記錄**:只比長度會挑錯 —— `black-a85`(9 字)贏過 `foreground`(10 字),
而該 DS 明文把 `--black-a*` 歸為 Internal。這就是 `--demote` 存在的理由。

---

## ADR-017 — 逆映射的索引鍵包含 alpha

**決定**:token 定義檔允許 `#rrggbb` 與 `#rrggbbaa` 兩種寫法;
`resolveColor()` 用「hex + alpha 量化成 0~255 整數」當索引鍵。

**否決的替代**:只用 6 碼 hex 查表,alpha 另外記錄但不參與比對(原本的做法)。

**理由**:`@qijenchen/design-system` 的整條 neutral scale 是「黑色 + 不同 alpha」:

```css
--color-neutral-1: oklch(0 0 0 / 2%);
…
--color-neutral-9: oklch(0 0 0 / 85%);
```

九個 token 的 hex 全部都是 `#000000`。只比 hex 等於把九個 token 壓成一個 ——
而這九個涵蓋了 `--foreground` / `--fg-secondary` / `--fg-disabled` / `--border` / `--divider`,
也就是這個 DS 最常用的那批顏色。

**alpha 的量化精度**是 0~255 整數,因為那就是 canvas 正規化器實際輸出的精度(ADR-014),
兩側走同一條路徑,round-trip 穩定。

**保留的退路**:帶 alpha 的色查 8 碼鍵沒中時,**不**退回同 hex 的不透明版本。
「85% 黑」跟「純黑」是兩個不同的顏色,硬湊成命中就是製造假的 exact。

---

## ADR-018 — 確定性規則有兩條輸出線:定讞與提示

**決定**:rubric 規則新增 `outcome` 欄位。`violation`(預設)進 `deterministic_violations`,
`ai` 以外的判定若標成 `notice` 則進 `payload.notices` —— 程式量得到,但不定讞、也不交給 AI。
TOKEN-001 是第一條走這條線的規則(2026-08 user 裁決)。

**否決的替代 1**:把 TOKEN-001 的 severity 調成 `info` 讓報告看起來乾淨。
這是 ADR-004 明令禁止的假修法。severity 表達的是「若確認成立有多嚴重」,
跟「有多可能成立」是兩個不同的軸,拿其中一個去粉飾另一個會讓兩個都失去意義。

**否決的替代 2**:依 ADR-007 把 TOKEN-001 從 rubric 移除。
移掉會連「這裡有個沒有名字的數字」這個**事實**都不見。那個事實是可複現的、量得到的,
而且對人有用 —— 只是它不足以定讞。丟掉可量測的事實比誤報更糟。

**否決的替代 3**:改成 `evaluator: "ai"` 丟給模型判。
AI 一樣看不到別的 consumer。把程式看不到的東西丟給同樣看不到的模型,只是把誤報換成幻覺。

**理由**:確定性規則的價值在**可複現**,不在**一定是錯的**。
對照基準 `@qijenchen/design-system` 的判準是「同值在 ≥ 2 處需要保持同步 → 必開 token;
1 處 = hardcode + 註解 why」,單一 consumer 的 padding / gap 是合法的 hardcode。
DQA 從單一鄰域的 computed style 只看得到「這個值有沒有名字」,看不到「有沒有同步義務」——
兩者不是同一條規則。硬定讞會系統性誤報,而誤報會讓整份報告失去可信度,連帶拖垮真正定讞的那幾條。

**因此**:降級的是**定不定讞**,不是 severity。TOKEN-001 的 severity 仍然是 `medium`,
仍然 `delta_independent`。報告頁把提示放在獨立一區、用虛線邊界區隔,
prompt 明確告訴模型 `notices` 是脈絡不是作業範圍。

**判讀方式不同**:違規的指標是誤報率(高 → `condition` 太鬆);
提示的指標是**人工確認後的成立比例**(長期偏低 → 這條規則對這個 design system 沒有價值,該依 ADR-007 移除)。

---

## ADR-019 — spacing 逆映射吃 density 參數

**決定**:`resolveSpacing(rawValue, density)`。spacing scale 檔改成
`{ densities: { md: {...}, lg: {...} } }`,每個 density 一份。
density 是**每個節點各自的屬性**(`node.density`),節點沒宣告時退回文件層級的。

**否決的替代 1**:把各 density 的值壓成一張平表。
`@qijenchen/design-system` 的 `--layout-space-loose` 在 md 是 16px、lg 是 24px;
`tight` 是 12px / 16px。壓平之後「16px 是哪個 token」有兩個答案,逆映射不成立 ——
而且會**安靜地**答錯:md 的合法 `loose` 會被說成 lg 的 `tight`。

**否決的替代 2**:density 不明時就用預設值(md)。
「沒宣告就是預設值」是 design system 的知識,不是 DQA 的(ADR-006)。猜錯的代價是雙向的:
把合法的 16px 報成沒有 token,或把違規的 16px 判成合法。因此 density 不明時回傳
`skip: 'DENSITY_UNKNOWN'`,TOKEN-001 進 `skipped_checks`、TOKEN-002 整組跳過。

**為什麼是 per-node 而不是 per-document**:該 DS 明文支援 subtree 覆寫 ——
`[data-density="md"]` 這個 reset 選擇器存在的唯一理由就是讓子樹能改回 md。
`extract.js` 因此在每個節點上往父層找最近的 `data-layout-space` / `data-density`。
`data-layout-space` 較具體(只管 layout space),同一元素上兩者都有時取它。

**環境鎖同步**:`envConsistency` 已經在比對這兩個屬性(見 ADR-012 那一輪),
兩側 density 不同時直接拒絕產出 payload —— 那種差異來自環境,不是實作。

---

## ADR-020 — `0px` 是否可報,取決於它跟「沒設定」分不分得出來

**決定**:TOKEN-001 排除 margin / padding 的 `0px`,但保留 gap 的 `0px`。

**理由**(實測 Chromium):

| 屬性 | 沒設定時的 computed value | 寫 `0` 時 |
|---|---|---|
| `margin*` / `padding*` | `0px` | `0px` ← **分不出來** |
| `gap` / `rowGap` / `columnGap` | `normal` | `0px` ← 分得出來 |

margin / padding 的 `0px` 無法區分「作者決定不留間距」與「沒人碰過這個屬性」,
所以它不承載任何可報的事實。gap 沒設定時是 `normal`(`parseFloat` 直接 NaN,根本進不了逆映射),
因此 `gap: 0` 是一個看得見的決定,照報。

**否決的替代**:把這些 `0px` 丟進 `skipped_checks`。
那不是「量不到的檢查」而是**規則不適用**,兩者不同。塞進去會把
`skipped_checks` 佔比這個覆蓋率指標稀釋掉(見 `docs/TASKS.md` 的 T5),
讓它從「規則覆蓋不足的警訊」變成「每頁都有幾十筆的背景噪音」。

**實測效果**:同一份 fixture,提示從 66 筆降到 2 筆 —— 剩下的兩筆都是真的有人寫過的 `padding-top: 13px`。

---

## ADR-021 — `gap` 的三個 computed 屬性只是一個決定

**決定**:`gap` 簡寫**永遠不做逆映射**;`rowGap` 與 `columnGap` 解析結果相同時合成一筆 `gap`,
不同時各自保留。比較兩側時,**兩側都是等向才合成** —— 只有一側等向就都拆回兩軸,否則比的不是同一件事。

**否決的替代 1**:維持現狀,三個屬性各報一筆。
一個 `gap: 12px` 是一個決定,報成三筆等於把 computed style 的內部形狀洩漏給讀報告的人。
實測(e2e 同一份 fixture):TOKEN-002 從 15 筆降到 4 筆,而抓到的問題完全一樣。
噪音會稀釋掉真正該看的那幾條 —— 這跟誤報一樣傷。

**否決的替代 2**:只解析簡寫 `gap`,忽略兩個軸。
簡寫在兩軸不同時的 computed value **不是單一長度**:

```
row-gap: 8px; column-gap: 16px   →  gap = "8px 16px"
row-gap: 12px                     →  gap = "12px normal"
```

`parseFloat("8px 16px")` 安靜地得到 8。這不只是重複,是**錯的值看起來完全正常** ——
原本的實作就有這個 bug,只是兩軸相同時剛好看不出來。

**收斂的是呈現,不是判定。** 兩軸不同時仍然是兩個決定、兩筆判定;
只有在它們確實相等(= 作者寫的就是一個 `gap`)時才合成。

**fixture 必須照 computed style 的形狀給**:真實擷取永遠同時有 `gap` / `rowGap` / `columnGap`
三個屬性。fixture 只寫 `gap` 就測不到合成邏輯,而且跟 `extract.js` 實際送出的資料長得不一樣 ——
不忠實的 fixture 等於沒測。這一輪就是因此漏掉一次:改完合成邏輯後 TOKEN-002 整條消失,
原因是 fixture 只給了簡寫。

---

## ADR-022 — AI 層的 egress、模型與輸出約束

**決定**(2026-08,user 裁決):

| | |
|---|---|
| egress | 公司內部 gateway(hostname 只走環境變數 / `config.json`,不進版控)|
| 模型 | `claude-opus-4-6` |
| 輸出約束 | structured outputs(`output_config.format`),schema 的 `code` enum 從 rubric 產生 |
| 位置 | `src/node/llm.js` —— **只有 Playwright 這條路徑有**,擴充套件維持零 egress(ADR-013)|

**endpoint 與金鑰為什麼不進 repo**:內部 hostname 就是「內部網路拓撲」,
而 ADR-003 已經認定那是 payload 不可外洩的類別之一
(`url(https://cdn.internal.corp/...)` 被 sanitize 擋掉的理由)。
同一個判準對版控成立:`config.example.json` 只放佔位字串,真值走
`DQA_LLM_BASE_URL` 或已 gitignore 的 `config.json`;金鑰只走環境變數,任何檔案都不放。

**否決的替代 1**:用 prompt 叫模型「輸出純 JSON、不要 markdown 圍欄」然後事後驗。
那是原本的做法。structured outputs 把「模型發明新代碼」從**事後重試**變成
**結構上不可能發生** —— rubric 的 `code` 清單直接編進 schema 的 enum。
可用性查過:第一方 API / Claude Platform on AWS / Bedrock / Vertex 都是 GA,Foundry beta,
所以這個做法不會綁死 egress 的選擇。

**否決的替代 2**:schema 過了就信。
schema 保證得了形狀,保證不了語意。三件它表達不了的事由 `validateFindings()` 把關:
`severity` 是否沿用規則定義(跨欄位相依)、`unclassified` 時 `code` 是否為 null、
`id` 是否真的在 `unresolved` 裡。實測:模型把 EMPHASIS-001 的 severity 從 medium 改成 low
會通過 schema(`low` 是合法 enum 值),只有 `validateFindings` 抓得到。

**`claude-opus-4-6` 的兩個特性寫死在 `llm.js`,換模型時要重看**:

1. **thinking 必須明確設 `{type: 'adaptive'}`。** 在 4.6 上省略 `thinking` 等於**不思考**
   (Opus 4.8 / 5 才是預設開)。這條漏掉不會報錯,只會安靜地變笨 —— 而這個任務是拿幾何數字
   做判斷,關掉思考等於自找幻覺。`test/llm.test.js` 有一條斷言盯著送出去的請求。
2. **4.6 沒有 `xhigh` effort。** 那一階是 4.7 才加的,送過去會被拒。目前用 `high`。

**重試是重新發一次單輪請求**,不是接續對話 —— 接續需要把上一輪的 thinking block
原封不動送回去,少送會出事;而這本來就是單輪分類,沒有需要保留的上下文。
重試一次就停:反覆重試只是把不確定性藏起來,而「模型答不出合約內的答案」
本身就是要讓人看到的訊號。

**測試不連任何真實 endpoint。** `test/llm.test.js` 在本機起一個假的 Messages API,
驗的是**送出去的請求形狀**與**收回來之後的合約檢查** —— 這兩種失敗都不會自己現形。
閘道器本身支不支援那些參數,由 `npm run llm:check` 對著真閘道器跑,那是另一件事:
企業閘道器可能是薄的反向代理(什麼都透傳),也可能是自己重寫的一層(只實作部分參數),
在確認之前任何「它應該支援」的假設都不該寫進判定流程。

---

## ADR-023 — 報告合併確定性判定與 AI 判定,但每一列都標出處

**決定**:`src/core/report.js` 產出報告模型(合併、補資料、排序、分區),
渲染各自做(擴充套件用 DOM、CLI 產 HTML 字串)。違規區把確定性判定與 AI 判定
**合併依 severity 排序**,但每一列帶 `origin`,呈現上標成「程式判 / AI 判」。

**否決的替代 1**:兩區分開列(確定性一區、AI 一區)。
使用者要修的是「這個畫面有什麼問題」,不是「程式抓到什麼」和「模型抓到什麼」。
分兩區等於把排序的責任丟回給人 —— 一條 high 的 AI 判定排在一堆 info 的確定性判定後面,
沒有人會捲下去看。

**否決的替代 2**:合併之後就不分了。
兩者的可信度不同:確定性判定是可複現的既定事實,AI 判定是模型依脈絡做的判斷。
把它們呈現成同一種東西,等於讓 AI 的判斷借用確定性的權威 ——
第一次誤判就會連帶讓人不相信真正定讞的那幾條。

**分區規則放進 core 而不是各寫一份**:哪些算違規、哪些只是提示、
AI 的 `acceptable` 要不要露出 —— 這些本身就是判斷。兩份實作遲早分岔,
而**使用者看到的東西分岔比數字分岔更難發現**(ADR-011 的同一條理由)。
渲染不共用,因為 DOM 與字串真的是不同的事。

**`acceptable` 單獨露出**:AI 看過而且認為沒問題的項目要列出來,
否則「AI 到底有沒有看」不可稽核 —— 沉默與通過在報告上長得一樣。

**`unclassified` 單獨計數**:那是 T5 的指標(接近 0 要抽驗 `condition` 是不是太寬,
超過一半代表 rubric 覆蓋不足)。混進其他區就數不到。

**沒有 source 的 AI 判定不進違規清單,但也不靜默丟掉。**
rubric 裡找不到的 code 代表這條判定沒有依據(ADR-007),不能當違規;
但丟掉就沒人知道模型講了什麼,所以進 `problems` 讓人看到。
這在降級路徑(閘道器不支援 structured outputs)之後重新變成可能發生的事。

**模型產生的字串一律 escape。** findings 的 evidence 會進 HTML,
而那份 HTML 會被人在瀏覽器裡打開。`test/report.test.js` 有一條斷言盯著。

---

## 待裁決(尚未進入實作)

| 議題 | 需要什麼才能裁決 |
|---|---|
| gate 是否 blocking | pilot 的 false positive rate,且閾值必須在看到數字**之前**訂 |
| Storybook 環境對齊的所有權 | 有沒有人有義務修 story |
| 是否值得爭取 codebase 存取 | 無存取權是政策性還是流程性限制 |
| 是否加入灰塊骨架截圖 | 資安對「不可讀的灰塊圖」是否視為敏感資料 egress |
| Tailwind utility 的 4px 倍數要不要收斂 | 它們不是具名 token,一律落在「不對應任何 token」→ 出提示。**2026-08 決定先觀察**:用 T5 的「`notices` 人工確認成立比例」判斷,而不是先猜一個門檻(ADR-018 的判讀方式) |
