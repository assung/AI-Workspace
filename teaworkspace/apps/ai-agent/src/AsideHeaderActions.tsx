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
