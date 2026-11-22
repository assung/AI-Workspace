// 單子的聊天頻道(2026-11-22 user):值班者按「Chat with requester」→ 呼叫 Chat 的 API 開一個這張單專屬的頻道(#sd-2318),
// 成員 = 值班者、報案者、bot;值班者在右側面板直接跟報案者對話。bot 把單子狀態更新發到頻道、把頻道訊息同步回單子,
// 之後也由它發總結。user 決定:1 每張單一個獨立頻道;2 bot 與 IT Service Desk 的 AI agent 同一個身分;
// 3 走 workspace chat 樣式;4 支線,不擋主劇本;5 報案者那邊先不動;6 prototype 模擬 API,不真的呼叫 Chat。
//
// 對照:Zendesk side conversation 在既有 Slack 頻道開討論串、Slack 回覆自動帶回工單
// (support.zendesk.com/hc/en-us/articles/4408844202778);JSM + Rovo agent 讓 Slack 討論串與工單留言雙向同步
// (support.atlassian.com/rovo/docs/how-can-rovo-agents-sync-conversations-between-slack-and-jsm/)。
// 我們不同:每張單一個頻道(成員、紀錄、總結集中在同一處),bot 用 AI agent 的身分。
//
// ── 樣式 = tWorkspace Chat 的 Thread 面板(apps/chat STRUCTURE.md ThreadPanel / MessageBubble / ThreadInputBox)──
// - 訊息列 = ThreadMessages `flex flex-col gap-4 px-4 py-4`
// - 對方 = 頭像 32 + 名稱 + 時間(text-caption fg-secondary,同 updates.tsx UpdateBubble 的 DS token 承接)+ 泡泡 rounded-xl p-3 bg-muted;
//   bot 頭像 = AgentLogo(同 Updates);人 = DS Avatar 32
// - 我的 = 靠右、時間在上、泡泡 MY_BUBBLE_BG(Chat 的「我的」泡泡色,深色主題另一色;apps/chat App.tsx MY_BUBBLE_BG 同值)
// - 輸入盒 = ThreadInputBox 外框(rounded-lg border bg-canvas px-3 py-2、有字時框變 border-hover)+ Send 24×24(無值 text、有值 primary);
//   固定在面板底部 = AsideFooter(同報案草稿的暫時做法)
import { useEffect, useRef, useState } from 'react'
import { AgentLogo, Avatar, Button, ButtonDivider, Tooltip, TooltipContent, TooltipTrigger } from '@qijenchen/design-system'
import { ExternalLink, Send } from 'lucide-react'
import { AsideFooter, AsideHeaderActions } from './AsideHeaderActions'
import { TAGENT_LABEL } from './TAgent'

export const CHANNEL = { name: '#sd-2318', ticket: 'SD-2318', me: 'Bob', requester: 'Aaron' }
const MY_BUBBLE_BG = 'bg-[#EBEEFF] [[data-theme=dark]_&]:bg-[#282B3E]'

export type ChannelMessage = { id: string; author: 'bot' | 'me' | 'requester'; time: string; text: string }

/** 值班者第一句(同其他劇本:預先填在輸入盒,按 Enter 送出) */
export const CHANNEL_PREFILL = 'Aaron 你好，我是 K8s 平台團隊的 Bob。想確認一下，payment-dev 今天也會部署嗎？'
/** 報案者的回覆(值班者送出後 3 秒) */
export const REQUESTER_REPLY = '今天下午會部署 payment-dev，大概 2 點左右。'

/** 開頻道時 bot 的第一則(說明成員、同步規則,附上單子目前的摘要給報案者看) */
export const channelOpened = (time: string): ChannelMessage => ({
  id: 'bot-open',
  author: 'bot',
  time,
  text: `已為 #${CHANNEL.ticket} 建立這個頻道，成員：Bob（值班者）、Aaron（報案者）。這裡的訊息會同步到單子的 Activity，單子狀態有變動時我也會發在這裡。`,
})

function Bubble({ m }: { m: ChannelMessage }) {
  const mine = m.author === 'me'
  const name = m.author === 'bot' ? TAGENT_LABEL : m.author === 'requester' ? CHANNEL.requester : CHANNEL.me
  return (
    <div className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
      <div className={`flex max-w-[85%] items-start gap-2 ${mine ? 'flex-row-reverse' : ''}`}>
        {!mine && (
          <div className="mt-0.5 shrink-0">
            {m.author === 'bot' ? <AgentLogo size={32} label={name} /> : <Avatar size={32} alt={name} color="green" />}
          </div>
        )}
        <div className="flex min-w-0 flex-col gap-1">
          <div className={`flex items-center gap-2 text-caption text-fg-secondary ${mine ? 'justify-end pr-1' : ''}`}>
            {!mine && <span>{name}</span>}
            <span>{m.time}</span>
          </div>
          <div className={`min-w-0 rounded-xl p-3 text-body text-foreground ${mine ? MY_BUBBLE_BG : 'bg-muted'}`}>{m.text}</div>
        </div>
      </div>
    </div>
  )
}

export function ChannelPanel({ messages, draft, onDraftChange, onSend }: {
  messages: ChannelMessage[]
  draft: string
  onDraftChange: (v: string) => void
  onSend: (text: string) => void
}) {
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' })
  }, [messages.length])
  const [focused, setFocused] = useState(false)
  const send = () => {
    const t = draft.trim()
    if (t) onSend(t)
  }
  return (
    <>
      <AsideHeaderActions deps="channel">
        <Tooltip>
          <TooltipTrigger asChild>
            {/* 到 Chat 看同一個頻道(假連結,接上 Chat 後開頻道網址);圖示同其他「Open in …」 */}
            <Button variant="text" size="sm" iconOnly startIcon={ExternalLink} aria-label="Open in Chat" title="" onClick={() => {}} />
          </TooltipTrigger>
          <TooltipContent>Open in Chat</TooltipContent>
        </Tooltip>
        <ButtonDivider />
      </AsideHeaderActions>
      <div className="flex flex-col gap-4 px-4 py-4" role="log" aria-label={`${CHANNEL.name} messages`}>
        {messages.map((m) => <Bubble key={m.id} m={m} />)}
        <div ref={end} />
      </div>
      <AsideFooter>
        <div className="bg-surface px-3 py-2">
          <div className={`rounded-lg border bg-canvas px-3 py-2 ${focused || draft ? 'border-border-hover' : 'border-border'}`}>
            <textarea
              aria-label={`Message ${CHANNEL.name}`}
              placeholder={`Message ${CHANNEL.name}`}
              rows={2}
              value={draft}
              onChange={(e) => onDraftChange(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault()
                  send()
                }
              }}
              className="block max-h-32 w-full resize-none bg-transparent text-body text-foreground outline-none placeholder:text-fg-muted"
            />
            <div className="mt-1.5 flex items-center justify-end gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={draft.trim() ? 'primary' : 'text'}
                    size="sm"
                    iconOnly
                    startIcon={Send}
                    aria-label="Send message"
                    title=""
                    onClick={send}
                    className="!h-6 !w-6 !min-w-0 !p-0"
                  />
                </TooltipTrigger>
                <TooltipContent>Send</TooltipContent>
              </Tooltip>
            </div>
          </div>
        </div>
      </AsideFooter>
    </>
  )
}
