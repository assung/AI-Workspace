// 值班者聯絡報案者(2026-11-03 user:「若 Bob 想多了解額外資訊該怎麼跟報案者 Aaron 互動?…在對話中的選項多提供一個聯絡 Aaron 的按鈕連結,
// 點擊會外開 chats 平台與 Aaron 直接詢問更多歷程細節」;先做假連結)。
// 寫法同其他代理訊息內的動作鈕(Updates / Review report):Button tertiary sm,內文下方 mt-2;
// 外開 = endIcon ExternalLink(與右側面板「Open in new tab」同一顆圖示)。接上聊天平台後把 onClick 換成開對話網址。
import { Button } from '@qijenchen/design-system'
import { ExternalLink, MessageCircle } from 'lucide-react'

export function MessageRequesterButton({ name }: { name: string }) {
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      <Button variant="tertiary" size="sm" startIcon={MessageCircle} endIcon={ExternalLink} onClick={() => {}}>
        Message {name}
      </Button>
    </div>
  )
}
