# TeaChat Chat Prototype — 結構文件

單一檔案 prototype：`apps/chat/src/App.tsx`（約 3000 行）+ `apps/chat/src/RichTextEditor.tsx`（Teams 風格 rich text 編輯工具列，2026-07-09 抽出共用）+ `apps/chat/src/TAgent.tsx`（tWorkspace 智慧代理 tAgent + DS AppShell 四區版面，2026-10-22 new，見 §4）。本文件記錄元件樹、命名與職責，方便 onboarding 與對照修改。

> 消費 `@qijenchen/design-system`（public surface only）。詳見 repo 根目錄 `CLAUDE.md`。

> **維護慣例（user 約定，務必遵守）**：
> 1. 任何對 `apps/chat/src/App.tsx` 的改動，**必須同步更新本文件**，使結構描述與程式碼一致。
> 2. 每次改動完成後，**主動提供完整 PR 步驟**（bundle 指令 + compare 連結 + 標題/說明），user 不需另外要求。

---

## 整體佈局

```
App  (export default)
├── TooltipProvider
└── div.flex.h-screen          ← 3-column 主框架（chrome='nav-rail'，預設）
    ├── NavRail                 最左窄欄（icon 導覽）
    ├── ChatList                中欄（聊天列表，可收合 / 可拉寬）
    └── Conversation            右側主區（對話 + Thread panel）
    └── SettingsModal           overlay，由 NavRail more → Settings 開啟
```

`config.agent === true`（tWorkspace / tAgent，2026-10-22）時改用 **DS AppShell 四區版面**（見 §4）：

```
App
├── TooltipProvider
└── div.flex.h-screen
    ├── NavRail variant="workspace"（Chat / Tasks / Docs / Drive / tAgent；無 Home，Chat = 首頁）  全域 app rail，在 AppShell 外
    └── div（transform 定位框 = AppShell portalContainer）
        ├── navTab ≠ 'agent' → SidebarProvider > AppShell (primary-sidebar, mainMinWidth 600)   ← Chat 分頁
        │   ├── sidebar = ChatListMenu        Menu：DS Sidebar offcanvas + ChatListBody
        │   ├── children = ShellConversation  Main：Conversation（頁首最左 SidebarTrigger）
        │   ├── aside = AppShellAside "Thread" Right panel：ThreadAsideBody
        │   └── agent = （空）                  AI agent：2026-10-23 起 Chat 不開放（`config.chatAgentPanel` 才放 TAgentDock，§4.3）
        ├── navTab ∈ tasks / docs / drive → WorkspacePlaceholderPage（ChromeHeader + DS Empty「… is coming soon」，內容未設計）
        └── navTab = 'agent' → TAgentPage（SidebarProvider > AppShell）                      ← tAgent 整頁（§5）
            ├── sidebar = tAgent 側欄          New / Projects / Artifacts / Pinned / Recents
            └── children = 新對話首頁 | 對話 | Projects | Artifacts
```

Storybook stories（Chat folder）：`Apps/chat/Chat`（`Chat.stories.tsx`，base）/ `Apps/chat/Teams Integration`（`TeamsChat.stories.tsx`）/ `Apps/chat/TeaChat Desktop version`（`TeaChatDesktop.stories.tsx`，2026-07-09 new — 獨立 prototype，重點展示 Teams 風格 Rich editor,見「Rich editor」callout；**2026-07-12 結構改版**：config `{ chrome: 'top-search', initialShowPreview: false }`，對齊「Teams 整合」的 top-search chrome — 無 NavRail、頂部 universal search、preview 預設 OFF；**不注入 Teams 匯入房**（保留 base rooms，Teams 匯入房是「Teams 整合」demo 的內容主題）。）/ `Apps/chat/tAgent`（`TAgent.stories.tsx`，2026-10-22 new — tWorkspace 智慧代理 prototype，config `{ agent: true }`；stories：tAgent 首頁 `{ initialTab: 'agent' }` / tAgent 整頁對話 `{ initialTab: 'agent', initialAgentRoute: 'conversation:c-dongding' }` / Chat 分頁（無入口鈕）；另 3 則 `test-only` 回歸用 `{ chatAgentPanel: true }`：側邊面板入口 / 側邊面板 `initialAgentOpen` / Thread 與 tAgent 並存，見 §4、§5）。

`config.chrome === 'top-search'`（Teams 整合 prototype，story `Apps/chat/Teams Integration`，檔案 `TeamsChat.stories.tsx`；story config 另帶 `initialShowPreview: false` — chat message preview 預設 OFF，2026-07-06 user 指定）時改為：

```
App
├── TooltipProvider
└── div.flex.h-screen.flex-col
    ├── TopSearchBar            頂部 chrome（取代 NavRail，見 §1a）
    └── div.flex.min-h-0.flex-1 ← 2-column（NavRail 移除）
        ├── CollapsedListRail（僅 ChatList 收合時，見 §1b）
        ├── ChatList
        └── Conversation ⇄ SearchPageView（universal search 有值時整區換成全頁搜尋結果，見 §1a）
```

---

## App 狀態 (state)

| 變數 | 型別 | 用途 |
|---|---|---|
| `rooms` | Room[] | 全部聊天室（含已送出訊息，初始值 `INITIAL_ROOMS`）|
| `activeId` | string | 目前選中的聊天室 |
| `listOpen` | bool | ChatList 是否展開 |
| `listWidth` | number | ChatList 寬度（260–480px）|
| `showPreview` | bool | 列表是否顯示訊息預覽（Settings 控制）|
| `settingsOpen` | bool | Settings modal 開關 |
| `mutedIds` | Set\<string\> | 被靜音的聊天室 |
| `fullWidth` | bool | 訊息區全寬 / 880px 置中（預設 true = 全寬）|
| `favOrder` | string[] | 我的最愛排序 |
| `agentOpen` | bool | tAgent **側邊面板**開關紀錄（入口鈕、AppShell §4 連帶關閉共用；初始 `chatAgentPanel && config.initialAgentOpen`；`config.chatAgentPanel` 預設 false → 恆 false）|
| `navTab` | 'home' \| 'chat' \| 'agent' | config.agent 時 NavRail 受控分頁；'agent' = tAgent 整頁（初始 `config.initialTab ?? 'chat'`）|
| `agentRoute` | TAgentRoute | tAgent 整頁位置：'new' / 'projects' / 'artifacts' / 'conversation:<id>'（離開分頁再回來保留；初始 `config.initialAgentRoute ?? 'new'`）|
| `agentEngine` | TAgentEngine | tAgent 對話資料（`useTAgentEngine`），側邊面板與整頁共用一份 |
| `panelConversationId` | string | 側邊面板目前看的對話（點 NavRail tAgent 時整頁接著開這一則）|
| `shellThreadId` | string \| null | AppShell 版 Thread 父訊息 id（= Right panel 開關；換聊天室即清；初始 `config.initialThreadId`）|
| `shellFrame` | HTMLDivElement \| null | AppShell 外框（Menu 浮層 portalContainer）|

---

## 1. Nav rail — `function NavRail`

```
NavRail
├── Logo
├── NavBtn  Home           (`showHome`，預設顯示；tWorkspace 傳 false —— 2026-10-23 user「nav bar 上移除 home 的入口，chat 當作首頁」，進入即 Chat 分頁)
├── NavBtn  Chats          (overlayBadge = 未讀數)
├── NavBtn  tAgent         (base 的 showAgent；tWorkspace 改走下方 workspace 變體；**導覽分頁** → tAgent 整頁（2026-10-23 起，不再是開合側邊面板的切換鈕），icon = DS AgentLogo still 16px，見 §5)
├── (spacer)
│
│   ── variant="workspace"（tWorkspace，2026-10-24 user）──
│   ├── Logo 列 = 一條頁首：高 `--chrome-header-height`（48，含底線）、內容區扣底線 1px → Logo 與「Chats」/「tAgent」標題垂直置中（user：「logo 往上移一些，垂直置中右側的 Chats title」）
│   │   分隔線 32 寬貼列底 = 與右側頁首底線同一條 y（2026-10-24 user：「logo 下方的 divider 需要跟右側 Chats 下的線水平對齊」）；
│   │   為此 tWorkspace 的 ChatList 頁首與對話頁首改用 DS `--chrome-header-height`（`chromeHeight` prop，48），原本內容撐出 49；base 不變
│   ├── WORKSPACE_NAV_ITEMS（user 指定順序與 lucide icon）：Chat message-circle（未讀 badge）· Tasks list-checks · Docs file-text · Drive hard-drive · tAgent sparkles
│   └── NavBtn indicator（分頁式樣，user：「類似 Teams」）：
│       · 選中 = 緊貼按鈕左緣的 2px 直線（2026-10-24 user：「那條線貼在按鈕的左側」）、與按鈕同高、`bg-primary`（= blue-6，user 說的 primary-6）；不鋪底；icon `text-foreground`；`aria-current="page"`
│       · 未選 = icon `text-fg-muted`（= neutral-7）；滑過 = 原本的淺灰底（Button text variant）+ icon `text-foreground`
│       · 線寬 2px、primary、150ms 色彩過渡、字色三態照抄 DS Tabs 選中底線（tabs.js），只是從底部轉到左側
│       · Tooltip（2026-10-25 user：「hover 套用 DS tooltip 樣式，長在圖標右側」）= DS 側欄細列同款（sidebar.js SidebarMenuButton 收合時）：錨點 = 按鈕本身、`side="right" align="center"`、DS 預設間距 8；More 同款
│   └── 欄寬：Logo 列 / 分頁 / 底部群組都以 48 欄（w-12，nav `items-start`）置中 → 圖標 x=8、中心 24 全為整數像素（rail 扣右邊線只剩 47，在 47 裡置中會落在 7.5 半像素）
├── DropdownMenu (More)    → DropdownMenuItem Settings → 開 SettingsModal
└── PersonAvatar (ME)      我的頭像
```

- `NavBtn`：共用按鈕。tooltip 強制在右側（`side="right" avoidCollisions={false}`）。
  - **重要**：DS Button 在 `iconOnly` + **string** `aria-label` 時會自動補一個 side="top" 的 tooltip（無法調位置）→ 會出現雙 tooltip。解法：**不傳 string `aria-label`**，改用 `aria-labelledby` 指向 sr-only span 保住無障礙名稱，讓 DS auto-tooltip 條件失效，只剩我們 right-side 的單一 tooltip。此規則僅 apply 在 nav rail 按鈕。
- `NavRail` 底色可換（2026-10-23）：`backgroundClassName` 預設 `bg-surface`；tWorkspace 傳淺灰（見下方「tWorkspace 左側 chrome 底色」）。
- `NavRail` 分頁可受控（2026-10-23）：`tab` / `onTabChange` 有傳時由 App 決定整頁內容；沒傳時沿用 base 行為（NavRail 內部記高亮）。`showAgent` 才渲染 tAgent 分頁。（2026-10-22 加的 `NavBtn pressed` 已隨 tAgent 改為分頁而移除。）
- **尺寸 spec（2026-06-18 confirmed）**：`<nav>` 左右 `px-2`=8px + 按鈕 `!h-8 !w-8`=32×32 → 整體寬 `w-12`=48px（8+32+8）。按鈕間距 `gap-1`=4px。Chat tab 未讀 badge `<Badge variant="critical">` 加 `className="!bg-[#EC540F]"` 對齊 `bg/notification` token。More 按鈕同套 `!h-8 !w-8` 32×32 對齊。

---

## 1a. Top search bar — `function TopSearchBar`（chrome='top-search'，2026-07-06 new，同日 v2 改版）

Teams 整合 prototype（story `Apps/chat/Teams Integration`）的頂部 chrome，`config.chrome === 'top-search'` 時取代 NavRail：

```
TopSearchBar  (header，h=48px，border-b，grid-cols-[1fr_auto_1fr])
├── （左欄留空 — logo 已移除，2026-07-06 v2；1fr 佔位維持置中）
├── Universal search input      正中間（DS Input + startIcon Search，placeholder "search"，
│                               controlled input；query 由 App `topQuery` state 持有；
│                               有值時 endAction X 清空；Escape 清空 + blur）
│   └── Hint panel              focus 且無關鍵字 → input 正下方浮出（search icon 28 +
│                               「Search for people, chat rooms, or messages」；原 SearchModal
│                               empty state 內容，panel 內 search bar 那排已移除）
└── 右側（由右至左：PersonAvatar → DropdownMenu）
    ├── DropdownMenu (More)     與 NavRail 同選單（Settings / Help / Sign out），tooltip side="bottom"
    └── Avatar (ME)             我的頭像（最右）
```

- `grid-cols-[1fr_auto_1fr]` 讓 search input 永遠在視窗正中間，不受左右內容寬度影響；input 寬 `min(480px, 40vw)`。
- **輸入框有值 → 全頁結果**：App `topSearching`（`chrome==='top-search' && topQuery 非空`）時，`SearchPageView` **覆蓋整個 Conversation view 的位置成為頁面的一部分（非浮窗 panel）**；清空關鍵字（X / Escape / 手動刪除）即回到 Conversation。
- `SearchPageView`（2026-07-06 v3 版面）：**預設看不到右側 preview** —— 結果列表置中於視窗中間、左右 padding（`maxWidth: 880` 置中，類似 fullWidth OFF 效果）。**只有 Message tab 點擊某則訊息後**，版面才切成兩欄：左欄 480px 結果列表 + 右側唯讀 preview（`MessagePreviewHeader` + `MessageArea readOnly` + flash/scroll）。「View message」→ 關閉搜尋、切 room、主畫面 flash 該訊息。People/Chatroom 結果點擊 → 直接切 room 並退出搜尋。結果列表 = `SearchResultsColumn`（與 SearchModal 共用，單一 SSOT）。
- **ChatList header 差異（top-search chrome）**：Search 按鈕移除（`onSearch` 不傳即不渲染；universal search 已在頂部 bar）。
- **收合行為（top-search chrome，2026-07-06 v3）**：ChatList 收合後，最左側出現 `CollapsedListRail`（§1b）—— 獨立垂直 bar、只有最頂部一顆 Expand sidebar 按鈕；原 ConversationHeader 內的 Expand 按鈕 + 右側分割線移除（`hideExpandControl` prop 貫穿 Conversation → ConversationHeader）。
- NavRail 的 Home / Chats tab 與未讀 badge 不搬移（此 prototype 只有 chat 一個 surface）。
- 頂部 chrome spacing 走 `--layout-space-*` token；48px 高度為 documented escape（對齊 Teams top bar）。

---

## 1b. Collapsed list rail — `function CollapsedListRail`（chrome='top-search'，2026-07-06 v3）

ChatList 收合（`listOpen=false`）時渲染在最左側的獨立垂直 bar（`w-12` 48px，`border-r`，`bg-surface`），內容只有最頂部一顆 `ListBtn icon={PanelLeftOpen}`「Expand sidebar」；點擊展開 ChatList。nav-rail chrome 不渲染（維持 base 行為：Expand 按鈕在 ConversationHeader 內）。

---

## 2. Chat list — `function ChatList`

寬度範圍：`CHAT_LIST_MIN = 120`（小安全 floor，讓 RoomRow 寬度隨 ResizeHandle 自由縮放）~ `CHAT_LIST_MAX = 480`。

```
ChatList
├── Header: "Chats" + AddPopover(＋) + 搜尋 + 收合鈕
├── Section "Favorites"   → RoomRow × n
├── Section "Chats"       → RoomRow × n
└── ResizeHandle          拖曳改寬度（DS 受控 API：value/min/max/onValueChange，內建鍵盤 ←/→ 每步 16）
```

- `RoomRow`：兩行預覽（名稱 + 最後訊息）。右側 time + 未讀 badge 用 `shrink-0` 防止 resize 時裁切。ChatList `<aside>` 無 `border-r`，視覺分隔線由 ResizeHandle 本身的 1px line 提供（避免雙線 = 2px 外觀）。**2026-10-22 升 DS beta.147**：ResizeHandle 改受控 API（舊 `isResizing` + 手刻 pointer 計算移除）；移除舊 `[&>span]:!bg-neutral-4` 覆寫 —— idle 線 `--divider` 本來就 = neutral-4，該覆寫只會蓋掉 DS 的 hover（border-hover）/ 拖曳中（primary）狀態色。
- `RoomMoreMenu`：more 選單 → Mute/Unmute · Favorite/Unfavorite · Open in new tab · Open in new window · Leave。Leave（與訊息選單的 Delete、tAgent 的 Delete）用 DS 破壞性項目色 `className="text-error"`（dropdown-menu.spec.md「破壞性動作」；2026-10-23 修：原寫 `text-fg-error` 不是 token，一直沒有變紅）。
  - 選單出現在 more 按鈕**下方 8px**（`side="bottom" sideOffset={8}`）；保留 Radix 預設碰撞避讓，靠近視窗邊緣時自動翻上方以維持可見。
  - more 按鈕為 **24×24px**（`!h-6 !w-6 !p-0`），外層 `absolute right-1 top-1/2 -translate-y-1/2`，框右緣距分隔線 **12px**（icon 視覺右緣落在 16px，與 date/time 右緣重疊）。用 **`invisible` 而非 `hidden`**（保留可量測 box，讓 Radix 正確錨定 dropdown）；`group-hover:visible` + `[&:has([data-state=open])]:visible` → hover 才出現、選單開啟時保持顯示。
- **間距**：列表外層 `px-2` + row `px-2` → date/time & badge 右緣距右側分隔線 **16px**；hover 時 date/time + badge 用 `group-hover:invisible` 隱藏，由 more 按鈕覆蓋。
- **ReactionBar**：用 `invisible/visible`（非 `hidden/flex`）控制顯隱，確保 Radix trigger 保留 box、選單開啟時 bar 不消失。
- **ScrollArea 寬度約束**：Radix viewport 內部會自動包一層 `display:table; min-width:100%` 的 div，會讓 `truncate` 的 row 以 max-content 撐大、溢出被分隔線遮擋。ChatList 的 ScrollArea 加 `[&_[data-radix-scroll-area-viewport]>div]:!block` 把它改回 block，row 才會被 aside 寬度約束、正常 truncate。
- **Header「Chats」spec（2026-06-18 confirmed）**：`header` 上下 padding 改 10px（`style={{ paddingTop:10, paddingBottom:10 }}`，取代原 `py-2`=8px）；標題 `fontSize:16 / fontWeight:500 / lineHeight:'130%' / color:var(--color-neutral-9)`。
- **Section spec（2026-06-18 confirmed）**：容器 `p-1`=4px all sides + `gap-1`=4px（左 icon ↔ label ↔ trailing icon 各 4px）；外層 ChatList `px-2`=8px 提供 section 與列表邊界的左右間隔。左側展開/收起鈕 `IconBtnSm` + `!h-5 !w-5`=20×20（icon 16px，由 `size="sm"` 預設對齊），color `var(--color-neutral-7)`。右側 trailing 鈕（"Add chat" Plus）改用 `IconBtnSm` + `!h-6 !w-6`=24×24，同色 neutral-7（原為 `ListBtn`，已換成可控尺寸的 `IconBtnSm`）。Section name 字級 `fontSize:12 / fontWeight:500 / lineHeight:'130%' / color:var(--color-neutral-7)`。`IconBtnSm` 新增 `style` prop 支援顏色 override。
- **RoomRow 已讀/未讀 spec（2026-06-18 confirmed）**：未讀（`room.unread && !isMuted`）標題 `14px/700/150%/neutral-9`；已讀標題 `14px/400/150%/neutral-8`。時間資訊（`showPreview` ON 才顯示）一律 `12px/400/130%/neutral-7`。副標題（preview text）未讀 `12px/400/130%/neutral-9`，已讀 `12px/400/130%/neutral-8`。未讀 dot badge `<Badge dot variant="critical">` 加 `className="!bg-[#EC540F]"` 對齊 `bg/notification`。
- **RoomRow hover 截斷 spec（2026-06-19 confirmed, v2）**：preview OFF 時未讀也在**標題後**顯示 `#EC540F` dot badge。hover 出現 RoomMoreMenu（24×24，絕對定位 `right-1`）時：文字容器加 `group-hover:pr-6`（保留 24px 按鈕 footprint）→ 標題/副標題截斷邊界移到 more 按鈕左緣、不被覆蓋；時間資訊與 dot badge 用 **`group-hover:invisible`（visibility:hidden，非 `hidden`/display:none）**隱藏 —— 保留原本佔位 box，確保 RoomRow 高度在 initial/hover/clicked 三態**完全一致**（`hidden` 會 collapse line-box 致 hover 高度微縮，2026-06-19 user 回報後修正）。截斷由 `pr-6` 負責、不依賴隱藏元素。
- **Chats section 測試資料（2026-06-18 updated v2）**：`GENERATED_CHAT_ROOMS`（App.tsx，`INITIAL_ROOMS` 之前宣告，IIFE）產生 **40 間不重複** room（id `gen-0`…`gen-39`）：**20 間 `type:'dm'`（1 on 1）+ 20 間 `type:'general'`（多人）= 精確 50/50**。
  - DM 用 `GENERATED_DM_PEOPLE`（20 位全新不重複人物，每位 unique name/avatar/color）；這 20 位以 `g-xxx` key **`PEOPLE.forEach` 注入 PEOPLE map**，讓 conversation 內 `PEOPLE[message.author]` 能解析頭像 + 名字。Group 用 `GENERATED_GROUP_TOPICS`（20 個 unique 主題，與既有 room 名不撞）+ 既有 7 位成員輪替 3 位。
  - **排序自然錯開**：`GENERATED_RUNS` run-length pattern `dm5, grp3, dm3, grp4, dm6, grp2, dm2, grp5, dm4, grp6`（dm/group 各總和 20），交錯成不規則但可重現的順序（非簡單 odd/even）。
  - 每間室 `makeGeneratedMessages()` 產生 **20 則來回對話**（偶數 slot = 對方 / 奇數 slot = `me`，真 1↔1 back-and-forth）；`unread = n % 3 === 0`。名稱與 id 全程不重複。
- **Avatar 狀態燈尺寸 spec（2026-06-18 confirmed v2）**：`StatusDot` 有 `size` prop（預設 8px）+ 永遠帶 `ring-1 ring-surface`（1px `bg/surface` 外框線）。`PersonAvatar` 有 `dotSize` prop（預設 8）往下傳。RoomRow（ChatList）依 `showPreview` 傳 `dotSize={showPreview ? 8 : 6}`（preview OFF → **6×6** / ON → **8×8**）；ConversationHeader / MessageArea 用預設 **8×8**。
- **RoomRow hover/active 圓角**：`rounded-lg` 改為 `rounded-[4px]`，確保視覺上精確 4px（不依賴 DS `rounded-lg` token 映射）。

---

## 2a. Avatar 狀態燈（`function StatusDot` / `function PersonAvatar`）

`StatusDot({ status, size = 8 })`：online/busy/offline 圓點直徑 = `size`；away 圖示（`Clock`）依 `size * 0.67` 等比縮放。`PersonAvatar({ person, size = 32, dotSize = 8 })` 把 `dotSize` 轉傳給 `StatusDot`，與頭像本體 `size`（決定頭像直徑）互相獨立 — 各呼叫點可分別控制頭像大小與狀態燈大小。

---

## 3. Conversation — `function Conversation`

```
Conversation
├── ConversationHeader   (上下 padding 8px `py-2`；avatar 32×32；標題 16px / medium / lh 130%)
│   ├── 頭像（靜音時換成 MutedAvatar 32×32）+ 室名 + Edit 按鈕(28×28)
│   ├── TeamsCallButton（h28 / px4 / 18px icons）/ RoomInfoButton（h28 / px4 / 18px icon + badge h20 px4 py2 12px/130% medium）/ Search(28×28)
│   ├── 按鈕群 spacing 8px（`gap-2`），icon-only 按鈕一律 size="sm"=28×28
│   └── HeaderMoreMenu (28×28 trigger)
│       ├── Full width        (inline Switch 切換)
│       ├── Mute / Unmute
│       └── Search / Room info…
├── MessageArea
│   └── MessageBubble × n
│       ├── 我的: bg #EBEEFF、時間在上、status icon (16×16) 在泡泡外；泡泡四角圓角 rounded-xl (12px)
│       │      邊距(MessageArea layout): bubble 左緣撐滿時距 region 左緣 96px(paddingLeft)；status icon 距 region 右緣 20px(paddingRight)；bubble↔icon 4px gap；無 icon 仍保留 16px 寬
│       ├── 對方: 頭像 + 名稱 + 時間 (sm/400 12px/130% neutral-7)；名稱與時間間距 8px；名稱+時間列與泡泡間距 4px；bubble 右緣撐滿跨行時距 region 右緣 96px(paddingRight)，短訊息自然內縮
│       ├── 泡泡 padding p-3 (12px)；reactions emoji 按鈕一律 h-6(24px)/px-2(8px)/py-1(4px)/border neutral-5/按鈕間 gap-1(4px)；emoji 16px、count `12px/400/130%/neutral-8`；Add reaction 按鈕同尺寸/padding，icon `SmilePlus 16px` color neutral-7（2026-06-18 confirmed）
│       ├── inline image: width 200px(max-w 100%) / aspect 3:2 / rounded-lg
│       ├── table(`Message.table?: string[][]`): cell font 12px/400/130%(首列 600) + padding 4px 8px；白底(td + wrapper backgroundColor white)；多欄每欄 max-w 120 / min-w 24；單欄 max-w 隨 bubble 自適應 / min-w 24；列 min-h 24 自動長高；max-h 320px；wrapper `width:fit-content; max-width:100%` → 少欄位自然 hug 內容(不被長文字撐開的 bubble 拉寬)，多欄寬表 cap 在 bubble 寬度上限內並水平捲動；超出寬/高出現 hover-only scrollbar(`.scroll-hover`，globals.css)
│       │      泡泡寬度: bubble 用 `max-w-full min-w-0`(非 w-fit — fit-content 會抓 table max-content 而溢出畫面)；hug 由 column 的 items-start(對方)/items-end(我的) shrink-to-fit 提供
│       │      MessageArea 用普通 scroll div(`overflow-y-auto overflow-x-hidden` + `.scroll-hover`)取代 DS ScrollArea：Radix Viewport 內包 `display:table; min-width:100%` 會被寬 table max-content 撐大、bubble 的 % cap 失效；普通 div 寬度確定(= flex parent)，min-w-0 flex chain 才能 cap bubble + 讓 table 在泡泡內水平捲動
│       ├── ReactionBar (z-[8]；hover 顯示；hideReplyInThread 時不顯示 Reply in thread 按鈕)
│       ├── ReactionMoreMenu  (mine vs other 不同選單；`side="bottom" sideOffset={8}`，保留 Radix 碰撞避讓)
│       └── Thread replies link: shrink-0 L-connector 24×12（border-l/b 1px neutral-4 + rounded-bl-[8px] 圓角，橫線落在 24×24 視覺垂直中點 y=12）+ MessagesSquare 16 + "N replies" sm/500 + 最新回覆時間 sm/400 neutral-7；icon 與 "N replies" 文字顏色皆為 `var(--color-primary)`（= primary-6，2026-06-18 confirmed）；最新回覆時間維持 neutral-7
├── InputBox                  (接受 `fullWidth` + `onSend(text, html?)` prop。左右外側距欄位邊緣 56px；OFF=max 880px 置中，視窗窄於 880px 時仍保持 56px。單行：textarea + buttons 同排；多行：textarea 全寬在上，buttons 獨立在下。外框 padding top/bottom 6px / left 12px / right 8px；整個輸入方塊 max-height 280px（textarea clamp 232）；圓角 rounded-lg(8px)；輸入後外框轉 primary-hover 藍框；按鈕一律 24×24(`!h-6 !w-6 !min-w-0 !p-0`)，按鈕間距 8px(`gap-2`，同套用於 ThreadInputBox)；Send 按鈕無值時 text variant(無底深線)、有值時 primary。外層 pt-2=8px / pb-4=16px。**Rich editor toggle**（Type 按鈕，ON=`!bg-neutral-selected`）→ 見下方「Rich editor」callout)
└── ThreadPanel               寬 320~720（預設 480），可拉寬（DS ResizeHandle 受控 API，idle 線 = --divider = neutral-4）；內容 = `ThreadMessages`（與 AppShell 版 Thread 共用，見 §4.4）
    ├── 父訊息（MessageBubble isInThread，下方無 "N replies" 分隔線）+ 回覆訊息（MessageBubble isInThread，ReactionBar 無 Reply in thread）
    ├── `Message.threadMessages?: Message[]` 存實際回覆內容；replies count/latestReplyTime 由此衍生
    └── ThreadInputBox        含 "Also send to chatroom" checkbox；圓角 rounded-lg(8px)；Send 按鈕 24×24 + 無值 text / 有值 primary（與主 InputBox 同規則）（ThreadPanel 容器無 `border-l`，視覺分隔線由 ResizeHandle 1px line 提供）；**可發送**（Enter 或 Send 鈕，`onSend(text, alsoSend, html?)` 上拋至 App `handleThreadSend`）；**Rich editor toggle**（checkbox 與 Send 之間，同主 InputBox 行為）
```

> **Rich editor（2026-07-09 new，Microsoft Teams format toolbar 對齊）**：SSOT = `apps/chat/src/RichTextEditor.tsx`（`FormatToolbar` + `RichTextArea` + `RichEditorHandle` + `textToHtml` + `hasRichMarkup`）+ `apps/chat/src/rich-text.css`（元件直接 import — Storybook preview 走 `.storybook/storybook.css` 不載 app globals.css，樣式必須跟著元件走）。**PRD**（清單 + 連結三功能開發規格）→ `apps/chat/docs/PRD-rich-editor-lists-and-links.md`。
> - **三處輸入框共用**（2026-07-09 user 指定）：主 InputBox / ThreadInputBox / chat bubble 編輯狀態（`EditMessageComposer`）。**編輯引擎常駐 rich contentEditable**（2026-07-09 v4：plain `Textarea` 全移除，對齊 Teams — compose box 永遠是 rich editor）：「Rich editor」（Type icon）toggle **只切換 format toolbar 顯示/隱藏**，不切換引擎 → 鍵盤清單捷徑 / list 內 Enter 行為**不論工具列開關都可用**，切換也不再需要內容轉換搬運。InputBox 三種佈局（單行 / 多行 / toolbar 展開）共用同一 DOM 結構（條件 slot + class 切換），RichTextArea 不 remount、內容不丟失；multiline 判定 = `scrollHeight > 30` 或含 block 元素（`div,br,ul,ol,blockquote,pre`）。**送出資料格式**：`hasRichMarkup(html)`（b/i/u/s/ul/ol/a/font/span/blockquote/pre/hr/img）為 false → 只送純文字（`Message.html` 不帶,bubble 走原 text 渲染）；edit 存檔同規則（格式全移除 → `html: undefined` 清掉舊 html）。**清空殘骸防護**：Backspace/Delete 後若無實際內容但 DOM 留有空 `<li>`/`<div><br>>` 殘骸（Chrome 全選刪除行為）→ 徹底 `innerHTML=''`（否則下次輸入意外接在清單裡、isEmpty 誤判）。
> - **Toolbar 按鈕順序**（2026-07-09 v3 user 指定，對齊 Teams）：Bold / Italic / Underline / Strikethrough │ Text highlight color / Font color / Font size │ Bulleted list / Numbered list │ Insert link / More。按鈕 28×28（`!h-7 !w-7`）、active=`!bg-neutral-selected` + `aria-pressed`；直接格式按鈕 `onMouseDown preventDefault` 保住編輯區 selection。
> - **色盤**：highlight = Office/Teams 標準 15 色 + None（清除底色）；font color = Teams 風 15 色。Popover 5 欄 swatch grid（20×20 格 + hover ring primary）。**Font size** = Teams 新版三檔 Small(12px)/Medium(14px)/Large(18px)（execCommand fontSize 2/3/5），DropdownMenu 內選項以各自字級渲染 + Check 標記。**More menu**：Quote（blockquote）/ Code snippet（pre）/ Insert horizontal rule / Clear all formatting。
> - **Insert / Edit link dialog**（2026-07-09 v2 改版，走 DS 表單規範）：DS Dialog（`autoHeight` + `maxWidth=448`）+ **DialogBody**（水平 padding 由 DS surface 提供，不手刻）+ **Field / FieldLabel（`required` 前綴 \*）/ FieldError**。欄位 = `*Text to display` + `*URL`（原 Address 改名），按鈕 = Cancel / **Confirm**（兩欄有值才 enable）。URL 非 link 格式 → Confirm 時 `FieldError`「Please input valid URL」（`isValidUrl`：http(s)/mailto/無 protocol 補 https 後 `new URL` + hostname 需含 `.` 或 localhost；改內容即清 error）。無 protocol 自動補 `https://`（`ensureProtocol`，insert/edit 共用）。`onCloseAutoFocus` 改為聚焦回編輯區（Radix 預設 focus 回 trigger、只 preventDefault 會掉到 body，Enter 送出捷徑會失效）。**Insert 時機（2026-07-09 v3 fix）**：Confirm 後 `setTimeout(0)` 延到 dialog 關閉、焦點還給編輯區才 `insertHTML`（dialog 開著時 Radix focus trap 搶焦點會讓 insert 落空）；`restoreSelection` 在 savedRange 失效（送出後 `clear()` 使 range 指向 detached node）或從未建立時 fallback 重建 caret 到內容最尾（沒有 fallback 時程式化 focus 不保證有 selection → `insertHTML` 靜默失敗 = user 回報「insert link 後沒出現 link」的 root cause）。
> - **Link 右鍵選單**（2026-07-09 v2）：編輯區內右鍵點 `<a>` → context menu（0-size fixed-position DropdownMenuTrigger 錨定滑鼠座標）：**Edit link**（Pencil icon，重開同一 dialog、prefill 現有 text+href，confirm 原地改寫 anchor）/ **Remove link**（Unlink icon，anchor 解開成純文字）。已送出 bubble 內的 link 不掛選單（走 Edit message 流程修改）。
> - **鍵盤清單捷徑**（2026-07-09 v2，對齊 Teams/Word markdown 自動格式）：行首「`-`」或「`*`」+ 空白 → bulleted list；「`1.`」+ 空白 → numbered list（`tryAutoList`：吃掉 marker 字元再 `insertUnorderedList/insertOrderedList`；已在 list / pre 內不觸發）。
> - **巢狀清單**（2026-07-12）：caret 在 list item 內 → **Tab** = `execCommand('indent')`（建巢狀子清單）、**Shift+Tab** = `outdent`；非清單情境不攔截 Tab（維持原生焦點移動）。巢狀 bullet 隨層級：disc → circle → square（`rich-text.css` `.rich-text ul ul` / `ul ul ul`）。
> - **貼上自動轉連結**（2026-07-12）：`RichTextArea` `onPaste` — 貼上純文字含 URL（`AUTOLINK_RE`：`http(s)://` 或 `www.` 開頭）→ `linkifyToHtml` 把 URL 轉 `<a>`（`www.` 補 https、剝尾端標點）後 `execCommand('insertHTML')`;無 URL 不攔截（原生貼上）。anchor 顯示文字 = 原樣 URL → 右鍵 Edit link 的「Text to display」自然即該 URL。三處輸入框皆適用（共用 `RichTextArea`）。
> - **編輯引擎**：contentEditable + `document.execCommand`（prototype 級）。selection 由 `selectionchange` listener 存 `savedRange`（popover/dialog 失焦後可還原）；active states 用 `queryCommandState`。placeholder 由 JS 同步 `data-empty` attribute 驅動（contentEditable 常駐 `<br>` 導致 `:empty` 不可靠）；`.rich-input` min-height 21px（空內容會塌成 0 高 → 送出清空後輸入區消失,2026-07-09 verify 抓到）。
> - **Enter 行為**（2026-07-09 v2 user 指定，三處輸入框一致）：**Enter = 直接送出/儲存**（非 list 情境）；**caret 在 list item 內 Enter = 原生換 item**（空 item 再 Enter = 跳出 list）；**Shift+Enter = 輸入框內換行**；Ctrl/Cmd+Enter 永遠送出。rich OFF 的 textarea 本來就是 Enter 送出 / Shift+Enter 換行，規則一致。送出後 rich 模式保持開啟（Teams 同,toolbar 常駐直到手動收合）。
> - **Message model**：`Message.html?: string`（rich 送出時存 HTML,bubble 以 `.rich-text` 樣式 `dangerouslySetInnerHTML` 渲染；`text` 仍存純文字供列表 preview / 搜尋）+ `Message.edited?: boolean`（bubble 時間戳旁顯示「Edited」,對齊 Teams）。
> - **Bubble 編輯狀態**：自己的訊息 hover → ReactionMoreMenu 首項 **Edit**（Pencil）→ bubble 原位換成 `EditMessageComposer`（w-full 撐滿可用寬,對齊 Teams edit box；外框 primary-hover 藍框）：prefill `message.html ?? textToHtml(text)`、Rich editor toggle（開=toolbar 浮出）、底部 ✕ 取消 / ✓ 儲存（有值 primary）；Enter 儲存（rich ON 時換行）、Escape 取消。存檔走 `App.handleEditMessage(messageId, {text, html})` — 同步搜尋 active room 的 `messages` 與各 `threadMessages`（main 區與 thread panel 內都可編輯）,標 `edited: true`。search preview（readOnly）無 ReactionBar → 無編輯入口。

> **Chat bubble 時間顯示（2026-07-06 confirmed，AM/PM 制）**：所有 chat bubble 內時間一律經 `formatBubbleTime(m, now)` 顯示（我方 / 對方 / thread panel / thread reply link「最新回覆時間」共 5 處）。規則：今天 `hh:mm AM/PM`（如 `9:18 AM`）· 昨天 `Yesterday hh:mm AM/PM` · 本週其他天（同一 ISO 週，排除今昨）`Monday hh:mm AM/PM` · 今年較早 `mm/dd hh:mm AM/PM`（`05/28 3:20 PM`）· 非今年 `yyyy/mm/dd hh:mm AM/PM`（`2025/05/26 6:10 PM`）。時間點由 `msgDateTime` = `message.date`（缺→今天）+ `message.time`（正規化為 HH:MM 24h）組成；`fmtHM12` 轉 12 小時 AM/PM。ChatList RoomRow 與搜尋結果的時間走 `formatListTime`（簡短版：今天顯示時間、其餘顯示相對日期/星期，對齊 Teams/Slack 列表慣例）。所有 demo `message.time` 已正規化為 HH:MM（原 `'5/28'` 之類日期字串改為實際時分 + 補完整 `date`）。

> **未讀標記 + Last read / 日期分隔線（2026-06-25 confirmed）**：
> - **點擊未讀 RoomRow 轉已讀**：`App.handleSelectRoom` 點擊非當前 room 時，若該 room `unread===true`，在 `setRooms` 標記 `unread:false` 之前，先把它最後一則訊息的 id 存進 `lastReadDivider = { roomId, messageId }`；點擊已讀 room 則清空 `lastReadDivider`。換 room 即清掉上個 room 的標記，所以**離開後再回來不會再看到這條線**（state 只認「這次切換」，不持久化）。
> - **Last read divider**：`MessageArea` 收 `lastReadMessageId` prop（= `lastReadDivider` 命中當前 room 時的 messageId），渲染時若該訊息 id 命中就在泡泡上方插入 `LastReadDivider`（純色線 `var(--color-primary)` + 置中文字 "Last read" 12px/500 同色）。
> - **日期分隔線**：`Message.date?: string`（ISO `YYYY-MM-DD`，省略 = 預設今天，因多數 demo 訊息只有 `time: 'HH:MM'`）。`MessageArea` 逐則算 `getMsgDate(m, now).toDateString()`，與前一則不同就插入 `DateDivider`（neutral-4 線 + 置中文字 neutral-7 12px/400）。文字格式 `formatDateDivider`：今天 `Today, W{週標籤}`；昨天 `Yesterday, W{週標籤}`；本週其他天 `{星期英文}, W{週標籤}`；今年本週以前 `M/D, W{週標籤}`；非今年 `M/D, YYYY, W{週標籤}`。
> - **週標籤格式（2026-06-25 訂正）**：`weekLabel(date)` = `W` + 年份尾數(1 位) + ISO 週數(補零 2 位)，例如 2026 年第 26 週 → `W626`（非單純 `W26`）。週數用標準 ISO-8601 算法（`getISOWeek`）。
> - **分隔線 padding（2026-06-25）**：`DateDivider`/`LastReadDivider` 根 div 加 `px-10`（40px），疊加在 `MessageArea` 既有 `px-4`（16px）外層 padding 之上 —— full-width ON 時等於離視窗真實邊緣 56px（16+40），與 InputBox 等元素對齊；full-width OFF 時則是在 `maxWidth:960` 置中欄內左右 40px，兩種模式皆滿足規格、不需另外條件判斷。
> - Demo 資料：`shinichi`（預設/未讀 room）m1 = 3 天前（本週一）、m2/m3 = 昨天、m4–m7 = 今天（省略 `date`），同時展示三種桶 + Last read 線（落在最後一則 m7 上方）。`ai`/`ran` room 的 `5/28`/`5/25` 訊息補 `date: '2026-05-28'/'2026-05-25'`（今年本週以前桶）；`engineering` room `e1` 改 `date: '2025-05-26'`（跨年桶）。Thread panel 內訊息不顯示日期分隔線（僅 main MessageArea）。

> **Universal Search modal（2026-06-25 new；2026-07-06 抽共用）**：點擊 ChatList header 的 `ListBtn icon={Search}`（非 ConversationHeader 內既有的單聊室內搜尋按鈕，那是獨立既有功能不動）開啟 `SearchModal`。三 tab 結果列表已抽成 `SearchResultsColumn`（`SEARCH_ROW_CLASS` / `SEARCH_TAB_BTN_CLASS` 共用 class 常數），由 SearchModal（浮窗）與 top-search chrome 的 `SearchPageView`（全頁）共用，單一 SSOT。
> - **視覺**：`fixed inset-0` 透明點擊捕捉層（**無 dimmed backdrop**，點擊空白處關閉）+ 浮動卡片（`rounded-2xl` 白底卡，定位於螢幕上方居中，參考 ClickUp 命令面板風格）。
> - **Search bar**：placeholder 固定為 `Search people, chatroom, or message…`；無關鍵字 = empty state（圖示 + 提示文字）；輸入後出現 People/Chatroom/Message 三個 tab（預設 People），結果列表的資訊結構參考 Microsoft Teams 搜尋結果（avatar + 主文字 + 次要文字/位置 + 右側時間）。
> - **People tab**：比對 DM room 的 `person.name`；點擊直接 `onNavigateRoom` 切換到該 DM room 並關閉 modal。
> - **Chatroom tab**：比對 **group chatroom**（`type !== 'dm'`，含 Teams 匯入房）的 `title`；點擊切換到該 room 並關閉 modal。**DM room 不出現在 Chatroom tab**（DM 屬「人」歸 People tab，2026-07-06 user 指定；SearchModal 與 SearchPageView 共用同一 filter）。
> - **Message tab**：比對所有 room 訊息的 `text`；點擊某結果**不關閉 modal**，改在 modal 右側開啟唯讀 preview pane（`MessagePreviewHeader` + 重用 `MessageArea(readOnly, scrollToMessageId, flashMessageId, flashToken)`）——header 右側 action 全部換成單一「View message」按鈕、底部無 InputBox、`MessageBubble` 在 `readOnly` 時整個跳過 `ReactionBar`（reaction / add-reaction / reply-in-thread 全部不可用）且 thread 連結 onClick 變 no-op。
> - **一次性 flash 效果**：`MessageBubble` 新增 `flashToken` prop，變動時 `useEffect` 設 1.2s 的 `flashing` state，泡泡內層 `rounded-xl` div 用 `transition-colors duration-700` + inline `backgroundColor: var(--color-indigo-6)` 一次性淡入淡出（非持續 highlight）；`MessageArea` 新增 `flashMessageId`/`flashToken`/`scrollToMessageId` 三個 prop 透傳。preview pane 點擊訊息時立即帶 `Date.now()` token 觸發；點 modal 內「View message」會呼叫 `App.handleSearchViewMessage(roomId, messageId)` —— 關閉 modal、必要時切換 room（`handleSelectRoom`）、並把同樣的 `{roomId, messageId, token: Date.now()}` 存進 `flash` state 透傳給真正的 `Conversation`，在主畫面再次觸發同一套 flash + 捲動（`MessageArea` 用兩個獨立 `useEffect`：一個只認 `flashToken` 變動捲到該訊息，另一個維持原本「訊息變多就捲到底部」邏輯，互不干擾，所以 flash 過後新訊息照常捲到底部）。

> **IME 中文輸入法 Enter 防誤送出（2026-06-24 fix）**：主 InputBox（單行/多行兩處）+ ThreadInputBox 的 Enter-to-send `onKeyDown` 一律加 `!e.nativeEvent.isComposing && e.keyCode !== 229` 防呆 — 中文/日文等輸入法用 Enter 確認候選字時不應觸發 send，只有「選字完成後再按一次 Enter」（此時非 composing）才送出。`keyCode !== 229` 額外擋 Safari 在 composing Enter 上 `isComposing` 回報不準的已知瑕疵。

> **Thread 發送 + "replied to a thread" link（2026-06-19 confirmed）**：
> - State 改造：`Conversation` 用 `threadParentId`（非 message 快照）+ `room.messages.find(id)` 即時查 live 訊息，確保送出後 thread panel 立即顯示新回覆。`onOpenThread` 一律存 `m.id`。
> - `handleThreadSend(parentId, text, alsoSend)`（App，SSOT of rooms state）：① 一定 append 一則 `threadReply` 到 `parent.threadMessages`（thread panel 內顯示，**普通 bubble、無 link**）。② 若 `alsoSend` 另 append 一則 `mainCopy` 到 `room.messages`（主區顯示），帶 `repliedToThreadParentId: parentId`。
> - `Message.repliedToThreadParentId?: string`：標記「主區的 thread 回覆副本」(`isRepliedCopy`)。`MessageBubble` 偵測到 → 渲染 **repliedLink** 並把 bubble + link 包進 `bubbleBlock`（`inline-flex flex-col`，shrink-to-content，align 依 mine）。
>   - **link 寬度卡在 bubble 寬度內、不超出 bubble 邊緣**：link 外層 `w-0 min-w-full`（對 width 貢獻 0、實際渲染成 bubble 寬度）；內含 L-connector（`border-l border-b rounded-bl-[8px]` 24×12 neutral-4，**shrink-0**，mine/other 皆顯示）+ `MessagesSquare 16`（**shrink-0**，色 `var(--color-primary)` = primary-6）+ 「replied to a thread: {母訊息}」單一 `min-w-0 truncate` span（色 neutral-7）。文字（含 prefix）一起截斷,只保證 L+icon 可見。
>   - **bubble 太短時加寬**：reply 副本的 bubble 外層加 `minWidth: REPLIED_LINK_MIN_W(120)` → bubble 至少 120px,確保 link 有空間放 L+icon+「…」;bubble 內容比 120 長時正常 hug。
>   - 點擊 `onOpenThread(parent)` 開該 thread。`bubbleBlock` 在非 reply 副本時 = `{bubble}{threadLink}`（行為不變）;reply 副本時 = bubble + repliedLink。threadLink / repliedLink 互斥。

> **ConversationHeader spec 驗證表（2026-06-09 confirmed）**：avatar 32×32(`size={32}`) · header `py-2`=上下 8px · 標題 `fontSize:16 / fontWeight:500 / lineHeight:'130%'` · icon-only 按鈕全 `size="sm"`=28×28 · 按鈕群 `gap-2`=8px · TeamsCallButton `px-1`=左右 4px + icon `size={18}` · RoomInfoButton `px-1`=4px + icon `size={18}` + badge `h-5`=20px / `pl:4 pr:4 pt:2 pb:2` / `fontSize:12 / lineHeight:'130%'` / `font-medium` · Edit 按鈕 `size="sm"`=28×28。

---

## 4. tAgent + AppShell 四區版面 — `apps/chat/src/TAgent.tsx`（2026-10-22，config.agent 才渲染）

tWorkspace 的智慧代理。**全部消費 DS 真元件**：版面 = DS **AppShell 四區**（`app-shell.spec.md`「版面規則」，DS **0.1.0-beta.148**，PR #169），面板 = DS AgentPanel 家族（`agent-panel.spec.md`）。本 app 不自算任何並排 / 浮層 / 寬度規則。

### 4.1 四區對應

| AppShell 區 | tWorkspace | 元件 | 寬度（最小 / 初始 / 最大） |
|---|---|---|---|
| （AppShell 外） | NavRail | `NavRail` + tAgent 鈕 | 48 固定 |
| Menu | ChatList | `ChatListMenu` = DS `Sidebar collapsible="offcanvas" contentType="chats"` + `ChatListBody` | 240 / 320 / 480 |
| Main | Conversation | `ShellConversation` → `Conversation`（`onOpenThreadExternal`、頁首 `SidebarTrigger`）| 最小 600 |
| Right panel | Thread | DS `AppShellAside title="Thread" contentType="thread"` + `ThreadAsideBody` | 320 / 480 / 720 |
| AI agent | （暫不開放）tAgent | `TAgentDock` = DS `AgentPanelDock` + `AgentPanel contentType="tagent"`，只在 `config.chatAgentPanel` 時放進來 | DS 預設 360 / 400 / 640 |

- Main 600 = DS AppShell 展示示範值（DS 不給預設、產品必填）；Menu 最小 240 = `--sidebar-width-min`；Menu 初始 / 最大、Thread 三值沿用本 app 既有寬。
- **NavRail 在 AppShell 外**（2026-10-22 user 選「ChatList 當 Menu、無細列」）：NavRail 是全域 app rail，內容與 ChatList 不同，不能當 Menu 的細列；AppShell 量的是自己根節點的寬（= 視窗 − 48）。
- **Menu 浮層定位框**：AppShell 不撐滿視窗 → 外層 div `transform: translateZ(0)` + `portalContainer`，ChatList 左側浮層與遮罩從 AppShell 左緣（x=48）起、不蓋 NavRail（§9「從版面左緣開始」；DS simulated-browser 畫布同款）。
- **ChatList section 展開狀態放在 Sidebar 外**：Menu 浮層時 Sidebar 會把 children 畫兩份（`sidebar.spec.md`「同一份內容、畫兩份」），狀態在 `ChatListMenu` 才兩份同步。
- **開關 = Main 頁首最左 `SidebarTrigger`**（`sidebar.spec.md` Pattern A，任何 Menu 狀態都看得到）；ChatList 自己的 Collapse 鈕在此版不渲染（`ChatListBody` 不傳 `onCollapse`）。⌘B 同效（DS 內建）。

### 4.2 版面行為（全由 DS 現算，以下是本 app 的實際數字，AppShell 寬 = 視窗 − 48）

> 2026-10-23 起 Chat 分頁不放 AI agent 區，實際只剩 ChatList / Conversation / Thread 三區；下列含 tAgent 的情境只在 `config.chatAgentPanel` 打開時成立（回歸 story 保留）。

- 依 **Thread → tAgent → ChatList** 順序，只看最小寬，放得下就並排；**沒有固定斷點**（2026-10-22 前的 960 斷點已撤）。
  - 1440 視窗、只開 tAgent：tAgent + ChatList 都並排。
  - 1440、Thread + tAgent：兩者並排；ChatList 暫藏（1392 − 600 − 320 − 360 = 112 < 240），按頁首開關叫出左側浮層，Esc / 點外面收回暫藏。
  - 1280、Thread + tAgent：tAgent 變右側浮層（1232 − 600 − 320 = 312 < 360），ChatList 回並排；**只是視窗變窄不關任何面板**。
- **Thread 永遠並排**（不變浮層）；仍放不下時整個殼水平捲動（只在視窗 < 600 + 320 + 48 才會發生）。
- **唯一的連帶關閉（§4）**：使用者主動開 Thread（點「N replies」）時，Main 600 + Thread 320 + 已開 tAgent 360 > AppShell 寬 → 關閉 tAgent。開著 Thread 再換看另一串 = `useAppShell().requestAside()`（`ShellConversation`）。**與 2026-10-22 第一版「Thread / tAgent 互斥」相反，互斥已撤**。
- **從代理導向 Main**：來源連結 / context chip = `host.onViewMessage`（切聊天室 + flash 訊息）+ `useAppShell().navigateFromAgent()` 同一事件；浮層時 tAgent 收起讓位，並排時不動。
- tAgent 浮層：可拖寬、寬度照紀錄、左側至少留 48、遮罩點擊或 Esc 關閉（DS）。

### 4.3 tAgent 面板（Chat 分頁，暫不開放）

**2026-10-23 user：「chat 部分請先幫我把 FAB 移除，目前先不開放 Chat 可以同時運用 ai agent」** → `config.chatAgentPanel`（預設 false）關掉 AppShell `agent` 區：Chat 分頁沒有入口鈕、沒有側邊面板，tAgent 只從 NavRail 的 tAgent 分頁（整頁，§5）使用。程式與回歸 story（`test-only`）保留，重新開放 = 把預設改 true、story 移出 test-only。以下為開放時的規格。

```
TAgentDock
└── AgentPanelDock (open = App.agentOpen, logoState, defaultPlacement = 貼邊)
    ├── AgentPanel (aria-label="tAgent", contentType="tagent")
    │   ├── AgentPanelHeader            標題 = 對話名 / "New conversation"；歷史浮層（Today / Previous 7 days）；+ 新對話（空對話時 disabled）；× 關閉
    │   ├── AgentConversation | Empty   空對話 = Empty + AgentLogo attract 48
    │   │   ├── AgentMessage user       附件 = Chip assist（room context chip 可點 → 切到該聊天室）
    │   │   ├── AgentMessage agent      AgentThinking（步驟串流）+ 內文（來源連結）+ AgentToolbar
    │   │   └── AgentMessage + AgentDecisionSummary   決策回執
    │   └── div.relative
    │       ├── AgentPromptInput        附件 = 目前聊天室 context chip（可移除）+ 使用者加的檔案；busy → 停止鈕
    │       └── AgentDecisionCard       有待決題時覆蓋輸入盒
    └── AgentFabDock（面板關時）
```

- **側邊面板只由入口鈕叫出**（2026-10-23 user：「側邊欄的互動情境比較像是當我在別的分頁時，透過點擊 FAB 來觸發叫出的面板」）；NavRail 的 tAgent 改成導覽分頁 → tAgent 整頁（§5）。tAgent 整頁不放入口鈕。
- **入口鈕預設貼邊**（2026-10-22 user 選）：DS 為「被遮擋」設計的 28px 貼右緣形態，y = 視窗高 − 188（在底部輸入區上方）；家（右下角）會蓋到 Thread 的 Send reply、與主輸入框 0 間距。使用者可拖回右下角，位置由 Dock 保管。
- **範圍**（2026-10-23 user：「叫出時會預設對左側內容頁來進行互動，除非使用者指定互動範圍」）：輸入盒預帶左側內容頁（目前聊天室）為可移除附件，切聊天室跟著換（在某聊天室移除後該聊天室不再自動帶入）；使用者用 + 另加範圍。
- **對話資料與整頁共用**（`useTAgentEngine`，App 持有）：歷史浮層列的就是整頁 Pinned + Recents 那一份；面板只自管「目前看哪一則」與草稿。
- **logoState**：回覆中 `think`；面板關閉時有新回覆 `attract`（開面板即清）；其餘 `still`。NavRail 圖示恆 `still`。
- **Demo 資料**：「Dong Ding batch #3 catch-up」引用 Kudo Shinichi DM m6/m7、Tea Tasting g4；決策卡 2 題（建立保留任務？/ 怎麼回覆 Shinichi？）—「Send now」真的送進 Shinichi DM（`handleAgentSendToRoom`）。另 3 則歷史對話；自由提問 = 模擬步驟串流後回覆「沒找到直接答案 + 可做的事」。

### 4.4 Thread（Right panel）

- 標題列 = DS `AppShellAside` 的「Thread + ×」；**Expand（全寬）鈕移除**（2026-10-22 user 選；AppShellAside 標題列只允許標題 + ×）。舊版 `ThreadPanel` 不變（其他 story 仍用）。
- 內容 = `ThreadMessages`（與舊版共用）+ `ThreadInputBox`。

### 4.5 DS 待補（交付時列出）

1. **AppShellAside 沒有 footer slot**：內容整塊包在 ScrollArea，Thread 輸入盒會跟著捲走。app 端最小補法（`ThreadAsideBody`）：內容最小高 = ScrollArea viewport 高（ResizeObserver），輸入盒 `sticky bottom-0`。DS 補 footer slot 後改用。
2. **AgentPanel / AppShell 內建字串無 i18n**：思考中 / 思考過程、決策卡 其他 / (建議) / 跳過 / 下一題 / 送出、header 與工具列 tooltip、改名 / 刪除、AppShellAside × 的「關閉」、把手名稱「調整 … 寬度」。可覆寫的（panel / FAB aria-label、FAB tooltip、placeholder、歷史搜尋文字、SidebarTrigger aria-label）已給英文。
3. **AppShell 首次排版有寬度轉場**：AppShell 掛載時 ResizeObserver 量到寬度前 Menu 外層寬 = 0，量到後變 `widthRange.initial`，而 Sidebar 外層恆掛 `transition-[width] duration-200` → 每次掛載都從 0 滑到 320。tWorkspace 的 Chat / tAgent 各是一套 AppShell，切分頁 = 重新掛載，所以每次切都滑一次（2026-10-23 user：「切換 chat 跟 tAgent 的過程中一直有側面面板重複滑出的轉場」）。app 端補法：外框掛載後 300ms 內加 `NO_MOUNT_PANEL_TRANSITION`（`chrome.ts`；只對 `[data-app-shell-panel]` 關 transition-property），之後使用者開合 / 視窗變窄的 200ms 轉場照 DS。DS 該做：首次量測前不套用寬度轉場。
4. **DS 版本**：本版需要 0.1.0-beta.148（PR #169 尚未發版）；預覽是用 PR #169 本機打包的套件建置。

---

### 4.6 tWorkspace 左側 chrome 底色（`apps/chat/src/chrome.ts`，2026-10-23）

- user：「左側邊面板及 nav bar 的部分我希望改成淺灰色，顏色請參照 color.spec.md 來使用，預設希望帶 opaque1 的顏色」→ DS primitive `--color-neutral-1-opaque`（淺色 = 2% 黑疊白 ≈ #FAFAFA；深色 = 2% 白疊黑，與深色 `--canvas` 同一顆）。
- 套用：NavRail（`CHROME_RAIL_BG`）、Chat 分頁 ChatList 與 tAgent 頁側欄（`CHROME_SIDEBAR_BG` 給 DS `<Sidebar className>`，以後代選擇器覆寫內層 `[data-sidebar=sidebar]` 的 `bg-surface`；DS Sidebar 沒有公開底色 API）。只在 config.agent；base Chat / Teams / Desktop / UT 不變。
- 不套用：Menu 左側浮層維持 DS 規定的 `--surface-raised`（app-shell.spec.md「版面規則」§9：遮蓋型浮層必不透明，不覆寫）。列的 hover / 選中底是半透明 alpha，疊在灰底上照樣有層次。
- DS 沒有對應 semantic token（color.spec.md「Surface 分層」只有 canvas / surface / surface-raised）→ 依 ui-development.md Tailwind 核心 5 寫成 `bg-[var(--color-neutral-1-opaque)]`。若 DS 之後補「chrome / sidebar 底色」semantic token，改用之。

---

## 5. tAgent 整頁 — `apps/chat/src/TAgentPage.tsx`（2026-10-23，設計確認中、未部署）

點 NavRail 的 tAgent 分頁進入（2026-10-23 user：「我期待會有一個純屬於 tAgent 的頁面，而非是開出側邊欄」）。版面 = 與 Chat 分頁同一套 DS AppShell（Menu + Main；不用 Right panel 與 AI agent 區）。

```
TAgentPage
└── SidebarProvider (activeId = agentRoute → 側欄單選高亮)
    └── AppShell (primary-sidebar, mainMinWidth 600, portalContainer = 外框)
        ├── sidebar = DS Sidebar offcanvas（寬度同 ChatList 240 / 320 / 480）
        │   ├── SidebarHeader "tAgent"
        │   ├── SidebarMenu  New conversation (SquarePen) / Projects (FolderKanban) / Artifacts (Shapes)
        │   ├── SidebarGroup collapsible "Pinned"   對話列（沒有釘選就不顯示）
        │   └── SidebarGroup collapsible "Recents"  對話列（依最近活動排序）
        │       └── 列：SidebarMenuButton（無圖示）+ SidebarMenuAction ⋯ showOnHover → DropdownMenu：Pin/Unpin · Rename · Delete
        ├── header = ChromeHeader：SidebarTrigger + h1（New conversation / 對話標題 / Projects / Artifacts）
        │   └── 對話時：Pin 切換鈕（Button pressed，圖示固定 Pin）+ ⋯（Rename · Delete）
        └── Main
            ├── 'new'            Empty（AgentLogo attract 48 + 問候「Good afternoon, Aaron」）+ TAgentPrompt + 建議 Chip assist ×3（點了填入輸入盒，不直接送出）；整組垂直置中
            ├── 'conversation:id' AgentConversation（同一欄置中）+ TAgentPrompt（同欄，底部）；決策卡覆蓋輸入盒
            ├── 'projects'        DataTable（Name = LinkInput view → 最近一則對話 / Description / Conversations / Last updated）
            └── 'artifacts'       DataTable（Name = LinkInput view → 來源對話 / Type / Created in / Last updated）
```

- **側欄項目**（user 指定 New / Projects / Artifacts / Pinned / Recents）。對照：Claude 側欄有獨立 Artifacts 區（[support.claude.com 9487310](https://support.claude.com/en/articles/9487310-what-are-artifacts-and-how-do-i-use-them)）與獨立 Starred 區、列上 ⋯ 選單加星；Gemini 把釘選放在 Recent 最上面（[support.google.com/gemini 13666746](https://support.google.com/gemini/answer/13666746)）。Pinned / Recents 分開 = Claude 做法。
- **範圍**：整頁沒有左側內容頁 → 預設不帶 context chip，範圍 = 整個 workspace（Chat / Tasks / Docs）；使用者用 + 指定。
- **導航**：代理內文的來源連結 / 聊天室附件 → 切到 Chat 分頁、開該聊天室並 flash 訊息（`handleAgentOpenInChat`）；回到 tAgent 分頁時停在原本的位置（`agentRoute` 在 App）。
- **從側邊面板接到整頁**（2026-10-23 user 同意；Chat 側邊面板暫不開放時不會觸發，程式保留）：側邊面板開著時點 NavRail tAgent → 整頁開面板正在看的那一則、面板收起（`handleNavTabChange`；面板看的那一則 = App `panelConversationId`）；面板那一則是空對話，或面板關著 → 整頁停在上次的位置。
- **首頁問候**（2026-10-23 user 同意）：Empty title = 依當地時間「Good morning / afternoon / evening, Aaron」（`ME_GREETING_NAME`），description 接「What can I help with? …」。
- **送出**：首頁送出 = 新對話（標題取第一句前 48 字），跳到該對話並排在 Recents 最上方。
- **改名 / 刪除** = DS Dialog（height="hug"、maxWidth 440）逐項照 AgentPanelHeader 歷史浮層（`useFormValidation` 更新類、Enter 儲存、IME 選字 Enter 不算）；刪除開著的對話 → 回首頁。
- **對話欄寬 880**：沿用本 app 主 InputBox fullWidth OFF 的上限（常數速查；2026-10-23 user 確認沿用 880）。
- **Projects / Artifacts 維持表格**（2026-10-23 user：DS 尚無 Card 元件，先維持表格、等 DS 出 Card）。主欄 Name = 站內連結：Project → 該專案最近一則對話（`conversationIds` 裡依 Recents 排序最前）、Artifact → 來源對話（user 選）。對話數只算還在的對話；來源對話被刪的成果物不列；專案的對話都被刪 → Name 變純文字。專案詳情頁、成果物預覽尚未設計。
- DataTable 欄位走 DS 欄位型別（`string` / `number` / `select`）→ 單行 + ellipsis（data-table.spec.md「Cell 單行截斷原則」）。

---

## Settings modal — `function SettingsModal`

- 左側 nav（Settings → Chats）+ 右側內容（Show message previews 開關）。
- Dialog 固定高 480px，內層 flex 填滿，footer（Cancel / Save changes）pin 在底部。

---

## 共用元件 / helper

| 名稱 | 職責 |
|---|---|
| `NavBtn` / `ListBtn` / `IconBtnSm` | 共用按鈕 primitive |
| `StatusDot` | 在線狀態圓點：online=綠實心 / busy=紅實心 / away=黃+Clock / offline=灰空心 |
| `PersonAvatar` | DS Avatar + 自訂 StatusDot overlay |
| `GroupAvatar` | 群組頭像 |
| `TeamsAvatar` | Teams 匯入聊天室頭像（`TEAMS_BRAND` #5B5FC7 圓底 + 白色 Teams logo 線條）|
| `MutedAvatar` | 靜音狀態頭像（白底 + 灰 BellOff）|
| `makeProfileCard` | 產生 hover 用的 ProfileCard |
| `MsgStatusIcon` | 訊息狀態 icon（sending / sent / read），在泡泡外 |

---

## 資料模型 (`第 151–267 行`)

```ts
type Presence  = 'online' | 'away' | 'busy' | 'offline'
type MsgStatus = 'sending' | 'sent' | 'read'

type Person  = { name; color; status: Presence; role; email; avatar }
type Reaction = { emoji; count }
type Message = { id; author; text; time; status: MsgStatus; reactions[]; replies; threadMessages[]; images?: string[]; date?: string }
type Room    = { id; name; type; origin?: 'teams'; section: 'favorites' | 'chats'; unread; messages[] }
```

`Room.origin === 'teams'`（2026-07-06 new）：Microsoft Teams migrated 進來的聊天室。**一律歸類為 general chatroom —— 連 Teams 1:1 DM 也轉換成 general group chatroom**（title = 對方名字、`memberKeys` 1 人），因此 `origin:'teams'` 永遠搭配 `type:'general'`。Avatar 判斷優先序 **muted > teams > dm > group**（4 個判斷點：RoomRow / ConversationHeader / MessagePreviewHeader / SearchModal chatroom tab）。

Inline image（`message.images`）= **打包進 app 的本機檔**（`src/assets/photos/*.jpg`，Vite asset import；`src/vite-env.d.ts` 提供 `*.jpg` 型別）：sunset-lake / rocky-coast（Shinichi m5）、autumn-avenue（Tea Tasting g3）。3:2、600×400（訊息內 200px 寬的 3 倍）。來源 Swiper demo 圖（github.com/nolimits4web/swiper `demos/images`，MIT）。歷程：`picsum.photos` 破圖 → `images.unsplash.com` 直連也破圖（2026-10-23 user：「傳送圖片的對話框裡面破圖」；外部網域會被網路 / 防火牆 / 預覽環境擋）→ 改為不依賴任何外部網域。

`ChatVariantConfig.teamsRoomMarker`（2026-07-06，UT 變體用）：`'avatar'`（預設，TeamsAvatar 品牌標示）/ `'suffix'`（`withTeamsRooms` 注入時拿掉 `origin` + 房名加後綴「[Teams]」→ 一般 GroupAvatar + 純文字標示；room id 不變）。`ChatVariantConfig.adjacentTeamsNamesake`（2026-07-06，UT 用）：把 Teams 房（id `teams-<x>`）排到同名原生 room（`<x>`）下方，讓同名兩間在 chats section 相鄰（`groupNamesakeTeams`，seed shuffle 後套用；找不到同名原生房者維持原位）。本體 prototype 預設皆不受影響。`ChatAction` 增 `search-navigate` / `search-view-message`（top-search 全頁搜尋結果的操作事件，UT check 用）。UT story：`ut/TeamsMarker.stories.tsx`（`UT/Teams Migrated Room Marker`，**無密碼閘**，A=品牌色頭像 vs B=[Teams] 後綴，2 任務：T1 搜尋並開啟與灰原哀「從 Teams 搬遷過來」的 DM 紀錄（判定 `teams-ai`，開到原生 `ai` 算失敗）/ T2 開啟任一 Teams 房；SEQ + 測後問卷，counterbalanced A→B / B→A）。

Teams 匯入 demo 資料（2026-07-06 new，同日 v3 改版）：`TEAMS_MIGRATED_ROOMS`（5 間：favorites 1 + chats 4，含 3 間「Teams DM 轉 general group」範例）。**DM 轉換房的人名刻意與既有 DM room 重複**（工藤新一 / 灰原哀 / 毛利蘭 — 同一人在本 app 有 chatroom、在 Teams 也有；搜尋人名時 People tab 與 Chatroom tab 會同時出現同名結果，Teams 房掛 TeamsAvatar 區分）。Room name 僅含中文 / 英文（原 `TEAMS_MIGRATED_PEOPLE`（中村壮太 / Emma Wright）已移除）。**只在 `config.includeTeamsRooms` 時由 `withTeamsRooms()` 注入**（favorites 排在既有最愛後、chats 穿插在既有列表前段），base story 完全不受影響。`TeamsAvatar`：圓形底色 = Teams 品牌色 `TEAMS_BRAND = '#5B5FC7'`（source: microsoft/fluentui `packages/tokens/src/global/brandColors.ts` `brandTeams[80]`），白色 Teams logo 線條 SVG（rounded-square「T」+ 人形剪影簡化單色版），icon 佔 avatar 62%。

假資料常數：`PEOPLE`（柯南角色）· `ME` · `INITIAL_ROOMS`（含長訊息 + inline image 範例 + `semi-sales`「IT Sales - Table格式範例」chatroom 的 table 範例：少欄少列 forecast/utilization(hug 範例) + 30 欄 22 列 wafer starts 大表(達 max-h 320px 觸發 hover scrollbar + 水平捲動範例)）· `COMMON_EMOJI`。
App 以 `useState(INITIAL_ROOMS)` 管理 rooms，`handleSend` 在 active room 尾端 append 新訊息。

---

## 常數速查

| 常數 | 值 | 用途 |
|---|---|---|
| `CHAT_LIST_MIN` / `CHAT_LIST_MAX` | 120 / 480 | ChatList 寬度範圍 |
| `THREAD_MIN` / `THREAD_MAX` | 320 / 720 | Thread panel 寬度範圍 |
| MessageArea max-width (fullWidth=false) | 960px | 訊息區置中上限 |
| MessageArea padding | `px-4 py-4` (16px) | fullWidth ON/OFF 均同 |
| MessageBubble gap | `gap-3` (12px) | 訊息間距 |
| InputBox max-width (fullWidth=false) | 880px | InputBox 置中上限 |
| 我的泡泡背景 | `#EBEEFF` | — |
