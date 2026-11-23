// ⚠️ 暫時做法(2026-10-30 user:「希望先在產品端先做一版來示意,再來跟 DS 那邊提調整」)—— DS 出 AppShellAside 的 actions 位置後整支刪掉。
//
// 需求:Right panel 頂列 × 的左邊放動作鈕(文章預覽的「Open in new tab」)。
// DS 現況(beta.148):AppShellAside 頂列寫死「標題 + ×」,沒有 actions 位置,app-shell.spec.md 也明文禁止加。
// user 提的依據:同級的 AgentPanel 頂列就有動作鈕 —— agent-panel.spec.md「AgentPanelHeader」Anatomy
// `[標題]…[新對話 +][ButtonDivider][關閉 ×]`,而且 spec 自己寫 AgentPanel「是與 AppShell aside 同級的常駐面板」;
// header-canonical.spec.md 的標題列也預留「title + close X / actions」。
//
// 做法:把 children 插進 AppShellAside 頂列那一排、× 的前面(容器 display: contents,子元素直接成為那一排的 flex 項目,
// 吃到 ChromeHeader 自己的 gap-2 與垂直置中;不另寫位置、間距)。排法逐字照 AgentPanelHeader:
// `Button variant="text" size="sm" iconOnly` + `ButtonDivider` + 既有的 ×。
// 依賴 DS 內部 DOM(aside > header 內最後一顆按鈕 = ×)—— 只為示意;DS 改版若換了結構,這裡找不到就什麼都不插。
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export function AsideHeaderActions({ children, deps }: { children: ReactNode; deps: unknown }) {
  const probe = useRef<HTMLSpanElement>(null)
  const [slot, setSlot] = useState<HTMLElement | null>(null)
  useLayoutEffect(() => {
    const aside = probe.current?.closest('aside[data-app-shell-panel="right"]')
    const header = aside?.querySelector(':scope > header')
    const buttons = header?.querySelectorAll('button')
    const close = buttons?.[buttons.length - 1]
    if (!close?.parentElement) return
    const el = document.createElement('div')
    el.style.display = 'contents'
    close.parentElement.insertBefore(el, close)
    setSlot(el)
    return () => {
      el.remove()
      setSlot(null)
    }
  }, [deps])
  return (
    <>
      <span ref={probe} hidden />
      {slot && createPortal(children, slot)}
    </>
  )
}

// ⚠️ 暫時做法(2026-11-03 user:「按鈕放在底部,先使用 DS 裡面的 Footer 元件,我後續會再跟 DS 那邊提請他們新增」)——
// DS 出 AppShellAside 的 footer 位置後整支刪掉。
//
// 需求:Right panel 底部固定一條動作列(單子草稿的 Cancel / Create),內文捲動時它不動。
// DS 現況(beta.148):AppShellAside 只有「頂列 + ScrollArea」,children 全部進 ScrollArea、沒有 footer 位置。
// 做法:把 children 插到 aside 最後(ScrollArea 之後);aside 是 flex-col、ScrollArea 是 flex-1 min-h-0 → 動作列自然貼底。
// 動作列本身由呼叫端用 DS 對外的 Footer 元件(SheetFooter)組,這裡只負責放位置。依賴 DS 內部 DOM,只為示意。
export function AsideFooter({ children }: { children: ReactNode }) {
  const probe = useRef<HTMLSpanElement>(null)
  const [slot, setSlot] = useState<HTMLElement | null>(null)
  useLayoutEffect(() => {
    const aside = probe.current?.closest('aside[data-app-shell-panel="right"]')
    if (!aside) return
    const el = document.createElement('div')
    el.className = 'shrink-0'
    aside.appendChild(el)
    setSlot(el)
    return () => {
      el.remove()
      setSlot(null)
    }
  }, [])
  return (
    <>
      <span ref={probe} hidden />
      {slot && createPortal(children, slot)}
    </>
  )
}

// ⚠️ 暫時做法(2026-11-23 user:「right panel 瀏覽開單的內容做成更有結構性…在 header 下方加 tab」;
// 樣式參考 DS「Patterns › Header Anatomy › 含分頁列」)—— DS 的 AppShellAside 開放 tabsSlot 後整段刪掉。
//
// DS 現況(beta.148):AppShellAside 頂列是 ChromeHeader 單列模式(標題 + ×、自帶 border-b),沒有傳 tabsSlot 的入口。
// DS 的寫法(header-canonical WithTabs):ChromeHeader 收到 tabsSlot → 第 2 列放 TabsList、頂列讓出底線
// (W1:一條線,由 TabsList 的 border-b border-divider 畫)、TabsList 內縮 px-loose 對齊標題(W2,HEADER_TABS_SLOT_WRAPPER_CLASS)。
// 做法:在頂列正下方插一列放 TabsList(wrapper 用 DS 的 HEADER_TABS_SLOT_WRAPPER_CLASS),同時拿掉頂列自己的底線
// → 視覺同 DS 的含分頁列;這一列在 ScrollArea 外,內文捲動時分頁列不動。依賴 DS 內部 DOM,只為示意。
export function AsideHeaderTabs({ children, className }: { children: ReactNode; className: string }) {
  const probe = useRef<HTMLSpanElement>(null)
  const [slot, setSlot] = useState<HTMLElement | null>(null)
  useLayoutEffect(() => {
    const aside = probe.current?.closest('aside[data-app-shell-panel="right"]')
    const header = aside?.querySelector<HTMLElement>(':scope > header')
    if (!header) return
    const el = document.createElement('div')
    el.className = `shrink-0 ${className}`
    header.insertAdjacentElement('afterend', el)
    const prev = header.style.borderBottomWidth
    header.style.borderBottomWidth = '0'
    setSlot(el)
    return () => {
      header.style.borderBottomWidth = prev
      el.remove()
      setSlot(null)
    }
  }, [className])
  return (
    <>
      <span ref={probe} hidden />
      {slot && createPortal(children, slot)}
    </>
  )
}
