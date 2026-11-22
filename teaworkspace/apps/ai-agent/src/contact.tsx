// 值班者聯絡報案者(2026-11-03 user:「若 Bob 想多了解額外資訊該怎麼跟報案者 Aaron 互動?…在對話中的選項多提供一個聯絡 Aaron 的按鈕連結,
// 點擊會外開 chats 平台與 Aaron 直接詢問更多歷程細節」;先做假連結)。
// 寫法同其他代理訊息內的動作鈕(Updates / Review report):Button tertiary sm,內文下方 mt-2;
// 2026-11-22 user:按了呼叫 Chat 的 API 開這張單的頻道,值班者在右側面板直接跟報案者對話(channel.tsx)→ 不再外開,拿掉 ExternalLink。
import { createContext, useContext, type ReactNode } from 'react'
import { Button } from '@qijenchen/design-system'
import { MessageCircle } from 'lucide-react'

const ChannelActionsContext = createContext<(() => void) | null>(null)
export function ChannelActionsProvider({ open, children }: { open: () => void; children: ReactNode }) {
  return <ChannelActionsContext.Provider value={open}>{children}</ChannelActionsContext.Provider>
}

// 文字(2026-11-04 user:「可以調整動詞嗎?例如 Chat with Reporter 或 Requester」)→「Chat with requester」:
// 對象用單子欄位的同一個詞(tickets.tsx「Requester」),動詞用 Chat(外開的是聊天平台)。
export function MessageRequesterButton() {
  const open = useContext(ChannelActionsContext)
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      <Button variant="tertiary" size="sm" startIcon={MessageCircle} onClick={open ?? undefined}>
        Chat with requester
      </Button>
    </div>
  )
}
