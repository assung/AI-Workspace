// 從 apps/chat/src/chrome.ts 複製(2026-10-30 IT Service Desk 獨立產品沿用)。
// tWorkspace(config.agent)的左側 chrome 底色:NavRail + 左側面板(Chat 分頁的 ChatList、tAgent 頁的側欄)。
//
// 2026-10-23 user:「左側邊面板及 nav bar 的部分我希望改成淺灰色,顏色請參照 color.spec.md 來使用,預設希望帶 opaque1 的顏色」
// → DS primitive `--color-neutral-1-opaque`(primitives.css:淺色 = 2% 黑疊白,深色 = 2% 白疊黑;深色時與 `--canvas` 同一顆)。
// DS 沒有對應的 semantic token(color.spec.md「Surface 分層」只有 canvas / surface / surface-raised),
// 依 ui-development.md Tailwind 核心 5「禁 primitive 色名作 utility → 用 `bg-[var(--color-…)]`」寫成任意值。
// 列的 hover / 選中底(`--neutral-hover` / `--neutral-selected`)是半透明 alpha,疊在灰底上照樣一階一階,不必改。
//
// 範圍:只作用於並排的那一份。Menu 左側浮層(Sheet)維持 DS 規定的遮蓋型 `--surface-raised`
// (app-shell.spec.md「版面規則」§9「底色」:浮層必不透明,不覆寫)。

/** NavRail 底色(取代 `bg-surface`) */
export const CHROME_RAIL_BG = 'bg-[var(--color-neutral-1-opaque)]'

/**
 * 給 DS `<Sidebar className>`:DS Sidebar 把面色畫在內層 `[data-sidebar=sidebar]`(`bg-surface`),沒有公開的底色 API,
 * 所以從外層 className 以後代選擇器覆寫那一層(特異性 0,2,0 > `.bg-surface` 0,1,0)。浮層那一份經 portal 不在這個子樹裡,不受影響。
 */
export const CHROME_SIDEBAR_BG = '[&_[data-sidebar=sidebar]]:bg-[var(--color-neutral-1-opaque)]'

/**
 * 給 DS `<Sidebar className>`:讓側欄內容寬度固定在側欄寬,長標題照 DS 規則截斷(… + tooltip),不把內容撐寬。
 *
 * 原因(DS 0.1.0-beta.148):SidebarContent 內包 DS ScrollArea 但沒開 `fillX`,Radix 捲動區內層是 `display: table`,
 * 會被最長的一行(例如 tAgent Recents「payments-api ImagePullBackOff on staging」、Docs 頁面樹的文章標題)撐開,
 * 側欄內容變得比側欄寬:群組收合箭頭、Docs 空間選擇器的右緣被裁掉(2026-10-29 劇本演示實測)。
 * 補法 = DS ScrollArea `fillX` 自己的三個 class(scroll-area.js:`[&>div]:!block [&>div]:!w-full [&>div]:!min-w-0`),
 * 從外層以後代選擇器套到捲動區的 viewport。待 DS 修(STRUCTURE.md §4.5)。
 */
export const CHROME_SIDEBAR_FILL_X =
  '[&_[data-radix-scroll-area-viewport]>div]:!block [&_[data-radix-scroll-area-viewport]>div]:!w-full [&_[data-radix-scroll-area-viewport]>div]:!min-w-0'

/**
 * 給 AppShell 外框的 className:掛載當下關掉 AppShell 面板(`[data-app-shell-panel]`)的寬度轉場。
 *
 * 原因(DS 0.1.0-beta.148):AppShell 掛載時要等 ResizeObserver 量到自己的寬,才決定 Menu 並排;在那之前 Menu 外層寬 = 0,
 * 量到後變成 widthRange.initial,而 Sidebar 外層一直掛著 `transition-[width] duration-200`
 * → 每次掛載都從 0 滑到 320。tWorkspace 的 Chat / tAgent 分頁各是一套 AppShell,切分頁 = 重新掛載 = 每次都滑一次。
 * DS 的開合轉場是給「使用者開合 / 版面改變」用的(sidebar.spec.md 寬度過渡),首次排版不該有;待 DS 修(見 STRUCTURE.md §4.5)。
 * `[data-app-shell-panel]` 是 DS 給 AppShell 面板的公開標記(app-shell 測試與 spec 都靠它辨認面板),這裡只覆寫 transition-property。
 */
export const NO_MOUNT_PANEL_TRANSITION = '[&_[data-app-shell-panel]]:transition-none'

/** 掛載後多久恢復轉場:DS 面板寬度轉場 200ms + 量測的一兩格,取 300 */
export const SHELL_SETTLE_MS = 300
