# DQA — Node Graph + Diff 標註層

工程完成 → 設計師 review 之間的第一道 gate。不碰原始碼、不依賴 CI、payload 脫敏。

對照基準:**[@qijenchen/design-system](https://github.com/ajenchen/design-system)** 的 Storybook
(<https://ajenchen-design-system.netlify.app/>)。規則依據與已知不相容見 [`docs/DESIGN-SYSTEM.md`](docs/DESIGN-SYSTEM.md)。

## 兩種跑法

**A. Playwright CLI** —— 內網可直連、要批次跑的時候。

```bash
npm install                      # 只裝 playwright
npm run test:all                 # 全部驗證,不需網路也不需瀏覽器
cp config.example.json config.json
npm run dqa config.json out      # 產出 out/payload.json 與 out/prompt.txt
```

`tokens/*.json` 兩份都是從 design system 的 CSS 抽出來的產生檔,不要手改:

```bash
npm run tokens:extract -- --css <ds>/src/tokens/color/primitives.css --demote '^color-'
npm run tokens:extract -- --kind spacing --css <ds>/src/tokens/layoutSpace/layoutSpace.css --density md,lg
```

spacing 是 density-aware 的 —— `--layout-space-loose` 在 md 是 16px、lg 是 24px,
所以逆映射吃 density,不明時跳過而不是猜(見 ADR-019)。

**B. Chrome Extension** —— Storybook / STG 躲在 SSO 後面、只有瀏覽器進得去的時候。

```bash
npm run sync:ext                 # 把 src/ 與 rubric/tokens 同步進 extension/
```

`chrome://extensions` → 開發人員模式 → 載入未封裝項目 → 選 `extension/`。
在頁面上點選目標節點 → 擷取 A 側(Storybook)→ 擷取 B 側(Production)→ 產生報告。
完整說明見 [`docs/EXTENSION.md`](docs/EXTENSION.md)。

兩條路徑共用同一份量測(`src/browser/`)與同一份判定(`src/core/`),輸出可逐字比對(ADR-011)。
兩者都不對外連線 —— prompt 產出後由你自己送進公司 gateway。

## 資料流

```
preflight.js  環境鎖 ── 任一項失敗即 throw,絕不產出無效 payload
     ↓
extract.js    鄰域擷取(T + P 的 children + G 的 children)
              allowlist → sanitize → 幾何 / baseline / 文字度量(只出數字)
     ↓
tokens.js     本地 token 逆映射 → { px, token, exact, nearest, delta }
     ↓
rubric-engine 確定性規則跑完 → deterministic_violations(既定事實)
              量得到但不足以定讞的 → notices(人看的,不定讞也不給 AI)
              量不到的一律 skip,不推測
     ↓
payload.js    nodes 整包 + 事實層 + unresolved 清單
     ↓
prompt.js     AI 只答 unresolved,只能引用 rubric code
```

`extract` / `preflight` 在瀏覽器裡跑,其餘在 Node 或擴充套件頁面裡跑,但都是同一份檔案。

## 三個容易被改回去的設計決定

**1. 分流的是規則,不是 payload。**
`nodes` 永遠整包送。AI 的**作業範圍**限縮在 `unresolved`,但**視野範圍**是完整鄰域。
只送 diff 陣列會讓 elevation、視覺重量這類相對量失去判斷依據,AI 只能瞎掰。

**2. 擷取範圍是鄰域,不是 subtree。**
Gestalt proximity 的證據在 sibling 身上。圈選節點的 subtree 裡沒有它。

**3. 量不到就說量不到。**
block flow 的縫隙來自 margin collapse、父層 padding、line-height 撐開的隱形空間,
壓成一個 gap 數字必然誤報 → 一律 `intra_gap: null` 跳過。
同理 `token: null` 代表魔術數字,不是「接近某個 token」。

## 已知盲區

- Icon glyph 的 optical centering(需要 raster,本階段不做)
- 非 flex/grid 容器的間距關係(見 `skipped_checks`)
- 兩側都一樣地錯、且錯在單側規則涵蓋範圍外的情況
- 同一個 `gap` 宣告會產生三筆 TOKEN-002(`gap` / `rowGap` / `columnGap`),見 `docs/TASKS.md` 的 T6
- Tailwind utility 產生的 4px 倍數不是具名 token,一律落在「不對應任何 token」→ 出提示

## 第一週要看的三個數字

| 指標 | 從哪裡取 | 判讀 |
|---|---|---|
| 確定性規則誤報率 | 人工複核 `deterministic_violations` | 高 → rubric `condition` 太鬆 |
| `notices` 成立比例 | 人工確認 `notices` | 長期偏低 → 該規則對這個 DS 沒價值,依 ADR-007 移除 |
| `unclassified` 比例 | AI 輸出 | 接近 0 抽驗 20 筆對 `condition`;>50% 表示 rubric 覆蓋不足 |
| `skipped_checks` 佔比 | payload | 過高表示 GESTALT-001 實際覆蓋遠小於預期 → 重估規則價值,**不是**放寬 guard |

`unclassified` 不靠調 LLM confidence 閾值控制 —— 那是沒有校準的旋鈕。
要控制就改 rubric 的 `condition` 或 prompt 的拒絕條件。

## rubric.json 契約

沒有 `source` 的規則不准進這份檔案。`source` 必須指回既有 spec 或 token 定義。
爭議發生時,大家看的是 `source`,不是猜 AI 為什麼這樣想。

`evaluator` 欄位決定**誰判**:
- `deterministic` → 程式判,100% 可複現
- `ai` → 門檻不存在於任何 spec(如 emphasis),程式只把分數算成事實,由 AI 依脈絡判斷

`outcome` 欄位決定**判出來算不算數**:
- `violation`(預設)→ 進 `deterministic_violations`,既定事實,AI 不得推翻
- `notice` → 進 `notices`,程式量得到但判斷依據不在單一鄰域裡,交給人。
  降級的是定不定讞,**不是 severity**(見 ADR-018 與 ADR-004)
