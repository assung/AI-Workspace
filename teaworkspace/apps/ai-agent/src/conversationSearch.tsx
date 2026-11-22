// 搜尋對話(2026-11-22 user:「Recent 這邊有沒有辦法結合 task number 的標籤,方便值班者或報案者查找時更方便」→ 選 A + C)。
// A = 對話跟某張單有關時,標題前面帶單號(TAgentPage 改名;既有寫法 = 事找人劇本的標題「SD-2318 payments-api ImagePullBackOff」)。
// C = 這支:側欄「Search」/ ⌘K 打開,用單號或關鍵字找對話,連已滑出 Recents 視線的舊對話也找得到。
//
// 對照:Claude 側欄有「Search」開搜尋對話框(⌘K);Zendesk 工單分頁同時顯示主旨與單號
// (support.zendesk.com/hc/en-us/articles/4408844108826);JSM 報案者入口可用單號篩選自己的請求
// (confluence.atlassian.com/servicedeskcloud/blog/2016/12/find-requests-faster-in-the-portal)。
//
// ── 消費的 SSOT ──────────────────────────────────────────────────────────────
// - DS CommandDialog(經 subpath `components/Command`;command.spec.md「非 Field 場景(Cmd+K)用 CommandDialog」)
//   搜尋列 = CommandInput、列 = CommandItem、組標 = CommandGroup heading、無結果 = CommandEmpty,全部 DS 既有,不另寫樣式
// - 分組同側欄(Pinned / Recents);AgentPanel 歷史浮層依日期分組,這裡的示範對話沒有時間資料 → 照側欄分
// - 比對 = 標題(含單號)的**連續字串**、不分大小寫;單號也接受不帶「SD-」只打數字。
//   不用 cmdk 內建的模糊比對:它讓「2311」同時配到 SD-2318、SD-2305(字元散落也算),查單號要的是精準
//   (CommandDialog 不轉傳 filter 給內層 Command → 這裡自己篩、只渲染配到的列;剩下的列 cmdk 照樣比得過,排序與無結果照 DS)
import { useEffect, useState } from 'react'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@qijenchen/design-system/components/Command'
import type { TAgentConversation } from './TAgent'

export function ConversationSearch({ open, onOpenChange, pinned, recents, onSelect }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  pinned: TAgentConversation[]
  recents: TAgentConversation[]
  onSelect: (id: string) => void
}) {
  // ⌘K / Ctrl+K 開關(command.stories「全域指令面板」同一組鍵;側欄收合是 ⌘B,不衝突)
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        onOpenChange(!open)
      }
    }
    document.addEventListener('keydown', down)
    return () => document.removeEventListener('keydown', down)
  }, [open, onOpenChange])

  const [query, setQuery] = useState('')
  useEffect(() => {
    if (!open) setQuery('')
  }, [open])
  const q = query.trim().toLowerCase()
  const match = (c: TAgentConversation) => !q || c.title.toLowerCase().includes(q)
  const shownPinned = pinned.filter(match)
  const shownRecents = recents.filter(match)

  const item = (c: TAgentConversation) => (
    <CommandItem
      key={c.id}
      value={`${c.title} ${c.id}`}
      onSelect={() => {
        onOpenChange(false)
        onSelect(c.id)
      }}
    >
      {c.title}
    </CommandItem>
  )
  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="Search conversations" label="Search conversations">
      <CommandInput placeholder="Search conversations or ticket numbers" value={query} onValueChange={setQuery} />
      <CommandEmpty>No conversations found</CommandEmpty>
      <CommandList>
        {shownPinned.length > 0 && <CommandGroup heading="Pinned">{shownPinned.map(item)}</CommandGroup>}
        {shownRecents.length > 0 && <CommandGroup heading="Recents">{shownRecents.map(item)}</CommandGroup>}
      </CommandList>
    </CommandDialog>
  )
}
