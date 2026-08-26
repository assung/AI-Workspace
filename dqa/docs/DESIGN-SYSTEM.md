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

### 1b. token 定義檔怎麼來的

`tokens/color-primitives.json` 不是手寫的,是 `scripts/extract-tokens.mjs` 從這個 DS 的 CSS 抽出來的:

```bash
DS=<design-system>/packages/design-system/src
npm run tokens:extract -- \
  --css $DS/tokens/color/primitives.css \
  --css $DS/tokens/color/semantic.css \
  --theme light \
  --demote '^(color-|black-a|white-a)' \
  --source-label "github.com/ajenchen/design-system@<sha> (…/color/{primitives,semantic}.css)"
```

目前這份的內容(`_meta` 有完整記錄):

| | |
|---|---|
| 來源 | `github.com/ajenchen/design-system@5132e8f` |
| 掃到的自訂屬性 | 264 |
| 其中是顏色的 | 251 |
| 相異色值 | 149(17 個帶 alpha) |
| 同值多名 → `_aliases` | 49 |

**必須用抽取而不是手寫的三個理由**(ADR-016):

1. `getPropertyValue('--color-blue-9')` 拿到的是 `oklch(from oklch(…) calc(l*0.44) …)` ——
   代換過但**沒求值**。relative color syntax 只有瀏覽器算得出來。
2. 這個 DS 的色階是相對公式推導的(`L = l × D`,D: 7=0.82 8=0.62 9=0.44…)。
   手寫等於把公式結果凍結成魔術數字,上游改一個 base 色這份表就整條錯掉。
3. token 定義那一側必須跟量測那一側經過**同一個**正規化器,否則是拿兩種量化精度做精確比對。

**`--demote` 為什麼必要**:一個色值常有多個名字(`--foreground` 與 `--color-neutral-9` 同值)。
只比長度會挑錯 —— 實測 `black-a85`(9 字)贏過 `foreground`(10 字),
而這個 DS 明文把 `--color-*` / `--black-a*` 歸為 **Internal**,`--foreground` 才是 **Public**。
被蓋掉的名字全部進 `_aliases`,一個都不會丟。

### 1c. alpha 必須進索引鍵

這個 DS 的整條 neutral scale 是「黑色 + 不同 alpha」:

```css
--color-neutral-1: oklch(0 0 0 / 2%);  …  --color-neutral-9: oklch(0 0 0 / 85%);
```

九個 token 的 hex 全部是 `#000000`,而它們涵蓋了 `--foreground` / `--fg-secondary` /
`--fg-disabled` / `--border` / `--divider` —— 這個 DS 最常用的那批顏色。
只用 6 碼 hex 查表會把九個壓成一個,所以 token 定義檔改用 `#rrggbbaa`,
`resolveColor()` 的索引鍵含 alpha(ADR-017)。

驗證見 `npm run test:color` 的「alpha-aware 逆映射」一節,以及 `npm run test:tokens`。

### 2. ~~spacing 沒有數字階梯~~ → 已處理:逆映射吃 density(ADR-019 / ADR-020)

DQA 原本的 `resolveSpacing()` 假設有一張 `{ token名: px值 }` 的平表。這個 DS 沒有 ——
它的 layout space token 隨 density 整組換值:

| Token | md | lg |
|---|---|---|
| `--layout-space-loose` | 16px | 24px |
| `--layout-space-tight` | 12px | 16px |
| `--layout-space-bottom` | 48px | 48px |

所以「16px 是哪個 token」有兩個答案:md 的 `loose` 與 lg 的 `tight` 都是 16。

**現在**:`resolveSpacing(value, density)`,scale 檔改成 `densities: { md, lg }`。
density 是每個節點各自的屬性(`extract.js` 往父層找最近的 `data-layout-space` / `data-density`),
因為該 DS 明文支援 subtree 覆寫。**density 不明時不猜預設值** ——
回傳 `skip: 'DENSITY_UNKNOWN'`,TOKEN-001 進 `skipped_checks`、TOKEN-002 整組跳過。

token 定義檔一樣是抽出來的,不是手寫的:

```bash
DS=<design-system>/packages/design-system/src
npm run tokens:extract -- --kind spacing \
  --css $DS/tokens/layoutSpace/layoutSpace.css \
  --density md,lg --include '^--(layout-space|item-gap)'
```

**附帶處理的雜訊問題**(ADR-020):真實頁面上幾乎每個節點的 margin / padding 都是 `0px`。
實測 Chromium:margin / padding 沒設定時 computed 就是 `0px`,跟作者真的寫 `0` **分不出來**;
而 gap 沒設定時是 `normal`。所以 TOKEN-001 排除 margin / padding 的 `0px`、保留 gap 的 `0px`。
同一份 fixture 的提示因此從 66 筆降到 2 筆,剩下的兩筆都是真的有人寫過的 `padding-top: 13px`。

**還沒涵蓋的**:Tailwind utility 產生的 4px 倍數(`p-2` / `gap-3`)不是具名 token,
所以它們一律落在「不對應任何 token」→ 出提示。這是這個 DS 的實際模型使然,
要不要收斂看 `notices` 的人工確認成立比例(T5)。

### 3. ~~「魔術數字」在這個 DS 是合法的~~ → 已裁決:TOKEN-001 降級為提示(ADR-018)

`token-system.spec.md` 的判準:

> **同值在 ≥ 2 處需要保持同步 → 必開 token。** 1 處 = hardcode + 註解 why。
> Hardcode 合法情境:單一 consumer 的 padding / gap / size(eg. Tooltip arrow `4px`)

DQA 量的是「值有沒有名字」,DS 管的是「有沒有同步義務」—— 不是同一條規則,
硬定讞會系統性誤報。而同步義務需要跨 consumer 的資訊,單一鄰域的 computed style 看不到。

**裁決**:TOKEN-001 的 `outcome` 改成 `notice`。

| | 之前 | 現在 |
|---|---|---|
| 進哪一區 | `deterministic_violations` | `notices` |
| severity | medium | **medium(不變)** |
| `delta_independent` | true | **true(不變)** |
| AI 會不會評估它 | 不會 | 不會(prompt 明確說它是脈絡) |
| 報告頁 | 混在違規列表 | 獨立一區,虛線邊界 |

**降級的是定不定讞,不是 severity。** 用調低 severity 讓報告好看是 ADR-004 明令禁止的假修法 ——
severity 表達「若確認成立有多嚴重」,跟「有多可能成立」是兩個軸。

也沒有把規則刪掉:「這裡有個沒有名字的數字」是可複現、量得到的事實,對人有用,
只是不足以定讞。丟掉可量測的事實比誤報更糟。

**這條的維運指標跟違規不同**:違規看誤報率,提示看**人工確認後的成立比例**。
長期偏低代表這條規則對這個 design system 沒有價值,那時才依 ADR-007 移除。

## 那還剩下什麼能跑?

在上面三項處理之前,對這個 DS 實際可用的是:

| 規則 | 狀態 |
|---|---|
| TOKEN-001 | ✅ 可用 —— 但只出提示不定讞(ADR-018)|
| TOKEN-002 | ✅ 可用 —— density-aware 逆映射已就緒(ADR-019)|
| RENDER-001 | ✅ 同上 |
| GESTALT-001 | ✅ 可用 —— 只比幾何,不需要 token 表 |
| ALIGN-001 | ✅ 可用 —— baselineY 是純幾何 |
| TRUNC-001 | ✅ 可用,而且 DS 的 spec 跟它一字對得上 |
| EMPHASIS-001 | ✅ 可用 —— oklch 正規化與 alpha 合成已修(ADR-014 / ADR-015)|
| ELEVATION-001 | ✅ 可用,維持 AI 判(見下)|

也就是說:**八條規則現在全部可以對這個 DS 跑。**

色彩那一側已經完整:量測正規化(ADR-014)、alpha 合成(ADR-015)、
token 定義抽取(ADR-016)、alpha-aware 逆映射(ADR-017)四塊都到位,
端對端實測 `oklch(0 0 0 / 0.65)` 的文字色可以一路解析到 `fg-secondary`。
spacing 那一側則是 density-aware 逆映射(ADR-019)加上 `0px` 的可觀測性判準(ADR-020)。

### ELEVATION-001 為什麼維持 AI 判(2026-08 裁決)

`elevation.spec.md` 確實寫死了配對規則 ——「`--elevation-100` 必配 `bg-surface`、
`--elevation-200` 必配 `bg-surface-raised`」,看起來有一半是機械可查的。

但要套用它得先知道這個元素是**內容層**還是**浮層**,而那是角色判斷,不存在於 computed style 裡。
只比對 shadow 與 bg 的組合,會把合法的內容層元素誤判成配錯 surface。
程式把 shadow / zIndex / bg 當事實送出,判定交給 AI 依鄰域脈絡做。
