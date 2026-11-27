// Updates 訊息的構件(2026-10-30 user:入口叫 Updates;「處理這張單」走 A —— 訊息裡放按鈕)。
//
// DS 現況:AgentMessage 沒有動作 / 時間的專屬位置(props 只有 role / attachments / toolbar),內文是 children。
// 這裡在內文裡組 DS 元件,不改 DS:
// - 動作 = DS Button variant="tertiary" size="sm"(button.spec.md:「卡片上的 CTA 幾乎都用 tertiary」)+ lucide 圖示;
//   放在內文下方、與內文段落同一個 mt-2 節奏(代理內文段落間距)。
// - 泡泡 = tWorkspace Chat「對方」訊息(apps/chat STRUCTURE.md MessageBubble「對方:頭像 + 名稱 + 時間;名稱與時間間距 8px;
//   名稱+時間列與泡泡間距 4px」,泡泡 rounded-xl p-3 bg-muted text-body;thread 版面頭像 32、頭像與內容 gap-2、寬上限 85%)。
//   頭像 = AgentLogo 32(產品用尺寸 16–48,agent-panel-logo.spec.md);名稱 = 產品名。
//   名稱 / 時間字級 = DS text-caption + text-fg-secondary(Chat 寫死 12px / neutral-7,這裡用 DS 既有 token 承接,不另造值)。
//   2026-10-30 user:「update 的訊息串樣式能套用 chat bubble 的樣式,比較方便判讀」。
// 動作由頁面提供(UpdatesActionsProvider):開帶前情的新對話 / 打開某一則對話。
import { createContext, useContext, type ReactNode } from 'react'
import { AgentLogo, Button } from '@qijenchen/design-system'
import { MessageSquarePlus, MessageSquare } from 'lucide-react'

export type UpdatesActions = {
  /** 「Work on this ticket」:開(或回到)那張單的對話 */
  workOnTicket: () => void
  /** 劇本那一則對話已經開過了沒(開過 → 按鈕改成回到那一則) */
  ticketChatStarted: boolean
  /** 打開某一則對話;`'script'` = 劇本那一則 */
  openConversation: (id: string) => void
}
const UpdatesActionsContext = createContext<UpdatesActions | null>(null)
export function UpdatesActionsProvider({ value, children }: { value: UpdatesActions; children: ReactNode }) {
  return <UpdatesActionsContext.Provider value={value}>{children}</UpdatesActionsContext.Provider>
}

/** Updates 一則通知:頭像 + 名稱 + 時間,下方泡泡(時間格式 hh:mm AM/PM,跨日加 YYYY/MM/DD —— 本專案慣例) */
export function UpdateBubble({ name, time, children }: { name: string; time?: string; children: ReactNode }) {
  return (
    <div className="flex max-w-[85%] items-start gap-2">
      <div className="mt-0.5 shrink-0">
        <AgentLogo size={32} label={name} />
      </div>
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex items-center gap-2 text-caption text-fg-secondary">
          <span>{name}</span>
          {time && <span>{time}</span>}
        </div>
        <div className="min-w-0 rounded-xl bg-muted p-3 text-body text-foreground">{children}</div>
      </div>
    </div>
  )
}

function ActionRow({ children }: { children: ReactNode }) {
  return <div className="mt-2 flex flex-wrap gap-2">{children}</div>
}

/** 新單通知的動作:開一則帶前情的新對話(對照 Your Dot「分出帶前情的新對話」);開過之後改成回到那一則 */
export function WorkOnTicketButton() {
  const actions = useContext(UpdatesActionsContext)
  if (!actions) return null
  return (
    <ActionRow>
      <Button variant="tertiary" size="sm" startIcon={actions.ticketChatStarted ? MessageSquare : MessageSquarePlus} onClick={actions.workOnTicket}>
        {actions.ticketChatStarted ? 'Open conversation' : 'Work on this ticket'}
      </Button>
    </ActionRow>
  )
}

/** 進度通知的動作:回到那件事的對話 */
export function OpenConversationButton({ conversationId }: { conversationId: string }) {
  const actions = useContext(UpdatesActionsContext)
  if (!actions) return null
  return (
    <ActionRow>
      <Button variant="tertiary" size="sm" startIcon={MessageSquare} onClick={() => actions.openConversation(conversationId)}>
        Open conversation
      </Button>
    </ActionRow>
  )
}
