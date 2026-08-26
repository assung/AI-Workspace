# 對照基準:@qijenchen/design-system

| | |
|---|---|
| Repo | <https://github.com/ajenchen/design-system> |
| Storybook(production) | <https://ajenchen-design-system.netlify.app/> |
| Story id 清單 | `packages/design-system/ds-story-manifest.json` —— 65 元件 / 947 story 的 canonical SSOT |
| Token 定義 | `packages/design-system/src/tokens/**` |
| Spec | `packages/design-system/src/tokens/*/**.spec.md`、`src/patterns/**/*.spec.md` |

ADR-001 說「Storybook canvas 是元件契約的可執行規格」。**這裡就是那份 Storybook。**
`rubric.json` 每條規則的 `source` 已經指到這個 repo 的實際 spec 檔,不再是 placeholder。

---

## 規則 → spec 對照

| 規則 | 依據 | 該讀哪一段 |
|---|---|---|
| TOKEN-001 | `tokens/token-system.spec.md` | Token vs Hardcode 判斷 |
| TOKEN-002 / RENDER-001 | `tokens/layoutSpace/layoutSpace.spec.md` | Token 表(md / lg 兩組值)|
| GESTALT-001 | `tokens/layoutSpace/layoutSpace.spec.md` | 親疏 3 級 |
| ALIGN-001 | `patterns/element-anatomy/item-anatomy.spec.md` | control + prefix 必須在同一條 baseline |
| TRUNC-001 | `patterns/element-anatomy/truncated-text.spec.md` | 單行截斷必配「僅實際截斷時顯示」的 tooltip |
| EMPHASIS-001 | `tokens/typography/typography.spec.md` | 同尺寸但不同角色的選法 |
| ELEVATION-001 | `tokens/elevation/elevation.spec.md` | 層級表 + 與 Surface 的配對規則 |

有兩條 spec 寫得比 DQA 現在的規則**更強**,值得回頭收斂:

- **GESTALT-001**:DQA 目前只判「群組內 gap ≥ 群組間 gap」。DS 的「親疏 3 級」直接規定該用哪個 token
  (跨範疇 + functional 交互 → `tight`;parallel / independent → `loose`),是可以定讞的規則,不只是不等式。
- **ELEVATION-001**:DQA 把它歸成 `evaluator: "ai"`(理由是 elevation 是相對量)。但 DS 明文寫死了配對規則
  —— `--elevation-100` 必須配 `bg-surface`、`--elevation-200` 必須配 `bg-surface-raised`。這一半是確定性的。

---

## 環境鎖:density 是第三個變因

Storybook 的 decorator 把兩個屬性寫在 `documentElement` 上
(`packages/storybook-config/preview.tsx`):

```js
document.documentElement.setAttribute('data-theme', theme)     // light / dark
document.documentElement.setAttribute('data-density', density) // md / lg
```

density 會**整組換掉** layout space 的值:

| Token | md | lg |
|---|---|---|
| `--layout-space-loose` | 16px | 24px |
| `--layout-space-tight` | 12px | 16px |
| `--layout-space-bottom` | 48px | 48px |

兩側 density 不同時,鄰域裡每一個間距都會差 —— 而那個差來自環境,不是實作。
所以 `envConsistency` 現在會比對 `data-density` / `data-layout-space`,不一致就拒絕產出 payload。
**只在兩側都明確宣告時才比對**:有一側沒宣告代表它的有效 density 量不到,不去猜「沒宣告就是 md」——
那是 design system 的知識,不是 DQA 的(ADR-006)。

抓取 Storybook 時請在 URL 明確指定,不要依賴預設值:

```
iframe.html?id=<story-id>&viewMode=story&globals=theme:light;density:md
```

---

## 三個已知不相容(還沒修,不要當成「設定沒填好」)

### 1. ~~色彩全部是 oklch~~ → 已修(ADR-014 / ADR-015)

DS 的色票是 oklch,而且大量使用 relative color syntax 與 alpha:

```css
--color-blue-6:  oklch(0.54 0.22 258);
--color-blue-9:  oklch(from var(--color-blue-6) calc(l * 0.44) calc(c * 0.65) h);
--color-neutral-9: oklch(0 0 0 / var(--_na9));   /* 85% 黑,不是不透明 */
--foreground: var(--color-neutral-9);
```

Chromium 的 computed value **保留 oklch,不會轉回 rgb()**(實測)。原本的
`rgbToHex()` 只認 `rgb()` / `#rrggbb`,遇到 oklch 回 `null`,連鎖導致色彩 token 全部解析不到、
`emphasis` 全是 `null`、EMPHASIS-001 永遠不觸發 —— 而且沒有任何錯誤訊息。

**現在**:`extract.js` 在色值進入 `style` 之前用 canvas 正規化成 `rgb()` / `rgba()`
(瀏覽器自己的引擎,不自己實作色彩空間數學,見 ADR-014);
`contrastRatio` 先把前景 alpha 合成到有效背景上再算(ADR-015)。

驗證:`npm run test:color`(單元)與 `npm run test:e2e` 的「色彩正規化」「色彩逆映射與對比度」兩節。
e2e 的 fixture 刻意用 `oklch(0 0 0 / 0.65)`,把正規化拔掉會有 7 項斷言失敗。

### 2. spacing 沒有數字階梯,DQA 的逆映射前提不成立

DQA 的 `resolveSpacing()` 假設有一張 `{ token名: px值 }` 的平表,拿量到的 px 去反查。
這個 DS **沒有** `--space-100 / 200 / 300` 這種階梯,它的間距來自三個不同來源:

| 來源 | 例子 | 特性 |
|---|---|---|
| L4 Layout(語意) | `--layout-space-loose` 16/24、`--layout-space-tight` 12/16 | 隨 density 改變 |
| L3 Family(尺寸) | `--field-height-md` 32px、`--field-px` 12px | 部分隨 density 改變 |
| Tailwind v4 utility | `p-2` `gap-3` … | 4px 的倍數,不是具名 token |

所以「16px 是哪個 token」這個問題本身就沒有唯一答案:md 的 `loose` 是 16,lg 的 `tight` 也是 16。
**沒有 density 就無法逆映射**,而 DQA 現在的 `TokenResolver` 完全不知道 density 這回事。

`tokens/spacing-scale.json` 目前仍是 placeholder。**不要**把上表硬壓成一張平表填進去 ——
那會產生看起來精確的錯誤答案,正是 ADR-006 要防的。

### 3. 「魔術數字」在這個 DS 是合法的

`token-system.spec.md` 的判準:

> **同值在 ≥ 2 處需要保持同步 → 必開 token。** 1 處 = hardcode + 註解 why。
> Hardcode 合法情境:單一 consumer 的 padding / gap / size(eg. Tooltip arrow `4px`)

TOKEN-001 現在的描述是「使用了未定義於 spacing scale 的魔術數字」,severity 固定 medium。
照這個 DS 的規則,**單一 consumer 的 13px padding 只要有註解就是合法的**,
DQA 會把它報成違規 —— 而且因為 ADR-004 規定 severity 不隨偏差量浮動,它會穩定地報成 medium。

這不是把 severity 調低就能解決的(那是 ADR-004 明確禁止的假修法)。
真正的問題是 TOKEN-001 的 `condition` 表達的規則,跟這個 DS 實際執行的規則不是同一條:
DS 管的是「**同步義務**」,DQA 量的是「**值有沒有名字**」。前者需要跨 consumer 的資訊,
單一鄰域的 computed style 看不到。

**選項**(需要裁決,見 `docs/TASKS.md` 的 T0):
1. TOKEN-001 降級成單側 **提示**,不進 `deterministic_violations`
2. 改判「同一鄰域內同一語意位置出現兩個不同的 raw 值」—— 這是鄰域看得到的同步義務代理指標
3. 依 ADR-007 從 rubric 移除

---

## 那還剩下什麼能跑?

在上面三項處理之前,對這個 DS 實際可用的是:

| 規則 | 狀態 |
|---|---|
| TOKEN-002 | ⚠ 需要 density-aware 的 scale 才有意義 |
| RENDER-001 | ⚠ 同上 |
| GESTALT-001 | ✅ 可用 —— 只比幾何,不需要 token 表 |
| ALIGN-001 | ✅ 可用 —— baselineY 是純幾何 |
| TRUNC-001 | ✅ 可用,而且 DS 的 spec 跟它一字對得上 |
| EMPHASIS-001 | ✅ 可用 —— oklch 正規化與 alpha 合成已修(ADR-014 / ADR-015)|
| ELEVATION-001 | ✅ 可用(boxShadow 的 computed value 帶 oklch 但整串是字串比對,不受影響)|

也就是說:**幾何類與色彩類的規則現在就能對這個 DS 跑,spacing token 類的還不行。**
