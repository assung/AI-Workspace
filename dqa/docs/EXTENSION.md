# Chrome Extension

給進不去 CI、Storybook 與 STG 都躲在 SSO 後面的環境用。
量測與判定全在本機完成,**不對外連線**(ADR-013)。

---

## 安裝

```bash
npm run sync:ext        # 把 src/ 與 rubric/tokens 同步進 extension/
```

Chrome → `chrome://extensions` → 開「開發人員模式」→「載入未封裝項目」→ 選 `extension/` 資料夾。

第一次安裝會自動打開設定頁。**先把 rubric 與 tokens 換成專案真值**(`docs/TASKS.md` 的 T0),
內建那份是 placeholder,沒換之前報告不具說服力。

權限只有 `activeTab` + `scripting` + `storage`:擴充套件平常看不到任何分頁,
只有在你按下面板按鈕或快速鍵的當下,才拿到當前分頁的一次性存取權。

---

## 一次比對怎麼跑

1. **對齊視窗寬度。** 打開面板,`viewport` 那一列顯示設定值與目前實際值。
   不一致就按「校正視窗」。兩側寬度不同時,報告會直接拒絕產出(ADR-009 / ADR-012)。
2. **開 Storybook 的 story。** 用 `iframe.html?id=...&viewMode=story` 直接開,不要開外層 UI ——
   外層的 padding 會變成鄰域的一部分。
3. **選目標節點。** 按「選取元素」,到頁面上移動滑鼠:
   `↑` 往父層、`↓` 往子層、點擊或 `Enter` 選定、`Esc` 取消。
   選「一列 / 一個群組」這種層級,不要選最內層的文字節點 —— 鄰域是 T + siblings + 上一層 siblings。
4. **按 A 側的「擷取」。**
5. **切到 Production 分頁,選對應節點,按 B 側的「擷取」。**
   兩側要選**結構位置對應**的節點:配對是靠 structural path(`g>div0>div0`),不是靠 class 名。
6. **「產生報告」。**

快速鍵:`Alt+Shift+D` 挑選器、`Alt+Shift+1` 擷取 A、`Alt+Shift+2` 擷取 B。
到 `chrome://extensions/shortcuts` 可以改。

---

## 報告怎麼看

| 區塊 | 意思 | 看到什麼要做什麼 |
|---|---|---|
| 確定性違規 | 程式判定的既定事實,可複現 | 直接修。點 `依據` 回到 spec |
| 提示 | 量得到但依 spec 不必然是問題(`outcome: notice`)| 人工確認。長期都不成立 → 該規則對你們的 DS 沒價值 |
| 跳過的檢查 | 量不到,誠實跳過(ADR-006) | 佔比過高 → 重估規則價值,**不是**放寬 guard |
| AI 的作業範圍 | 程式無法定讞的差異 | 複製 prompt 送進公司 gateway |
| 結構差異 | 兩側配不到的節點 | 通常代表選錯對應節點,或實作真的多包了一層 |

`prompt` 區塊的內容可以複製或下載。payload 已脫敏:沒有文字內容(只有字元數)、
沒有 URL、字型名只出 hash。送出前仍請照內部規範確認路徑。

---

## 會被擋下的情況

| 訊息 | 原因 | 怎麼辦 |
|---|---|---|
| viewport 寬度與設定不符 | 視窗寬度不對 | 按「校正視窗」;達不到就把設定改成實際值,重點是兩側一致 |
| 仍有字型未載入完成 | `document.fonts.ready` 之後還有 pending | 等頁面完全靜下來再擷取。這條不能跳過,fallback 字型下量到的 baseline 全錯(ADR-010) |
| 找不到目標節點 | 沒選、或頁面重新載入後選取失效 | 重選一次。頁面一 reload,選取就沒了 |
| 這個分頁不允許擴充套件執行 | `chrome://`、Chrome 線上應用程式商店 | 這些頁面 Chrome 一律禁止注入 |
| 環境不一致,拒絕產出 payload | 兩側 viewport / dpr / theme 不同 | 調成一致後重新擷取。真的要看,設定裡有「允許環境不一致」,但那幾乎一定會製造誤報 |

---

## 已知限制

- **只作用在最上層 frame。** Storybook 請直接開 `iframe.html`,不要透過外層 UI。
- **選取跟著分頁的生命週期。** 頁面重新載入後要重選。
- **preflight 會凍結動畫**(注入一段 `transition/animation: none`)。
  面板上的「解除頁面凍結」會把它移除;重新載入頁面也一樣。
- **擴充套件無法宣告 viewport**,只能斷言。所以 `payload.meta.captureMode` 會記成 `extension` ——
  判讀時要知道這條路徑的環境保證比 Playwright 弱(ADR-012)。
- **不做 pixel diff、不截圖。** 見 ADR-003。

---

## 改程式前要知道的

`extension/browser/`、`extension/core/`、`extension/data/` 全部是複製品。
改 `src/` 之後跑 `npm run sync:ext`;`npm run test:sync` 會在不同步時失敗。

只屬於擴充套件的程式碼放在 `extension/` 底下:

```
extension/
  background.js      快速鍵、badge。擷取流程本身在 lib/capture.js,與 popup 共用
  picker.js          元素挑選器(注入頁面)
  lib/storage.js     設定 / 擷取結果 / rubric 覆寫的持久層
  lib/capture.js     注入 → preflight → extract → 存檔
  popup/             操作面板
  report/            報告頁(載入 core 產出 payload 與 prompt)
  options/           設定與 rubric 覆寫(存檔前跑契約檢查)
```

端對端測試會把整個 `extension/` 複製到暫存目錄、只在 manifest 補上 `host_permissions`
(自動化沒有 `activeTab` 需要的使用者手勢),其餘檔案一律用原版:

```bash
DQA_CHROMIUM=/path/to/chrome xvfb-run -a npm run test:e2e
```
