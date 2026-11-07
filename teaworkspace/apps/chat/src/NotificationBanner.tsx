// tWorkspace push banner(app 內通知卡,2026-11-07)。
//
// 為什麼不用 DS Toast:toast.spec.md「何時不用」明訂需要使用者處理的內容(核准、回覆)不放 Toast,
// action 只給「復原 / 重試」這類後手;而專案目標 2「在情境內完成」要的正是卡片上直接回覆 / 核准。
// → 新的產品端 pattern,外框幾何全部沿用 Toast / Notice 的值(不另造):
//   寬 360(toast.tsx `w-[360px]`)、rounded-lg + elevation-200(toast.tsx shadow wrapper)、px-4 py-3(Notice NOTICE_LAYOUT)、
//   層級 z-[60](Toaster,elevation.spec.md 疊放順序)、離視窗邊 24px(sonner VIEWPORT_OFFSET,toast.spec.md「落點」)。
// 內容 = Family 2 list item(item-anatomy.spec.md):[頭像 / 圖示] [label + description] [關閉]。
//
// 行為(對照 Teams 規格第 3 節流程圖、第 10 節建議):
// - 一般:10 秒後自動收起(DS Toast 含 action 的預設 10000ms,WCAG 2.2.1);滑鼠停在卡上 / 正在回覆時暫停計時。
// - 緊急:不自動收起,直到讀取或關閉;Teams 每 2 分鐘再提醒、最多 20 分鐘。
// - 同一個對話又有新訊息 → 取代原卡、顯示則數(不疊出一排同一個人)。
// - 最多同時 3 張(toast.spec.md 同規則),更舊的收起,只留未讀徽章。
// - 在任何地方讀過 → 卡片收起(規格第 10 節第 3 點)。
// - 卡上「為什麼收到」一行(規格第 10 節第 1 點)。
import { useEffect, useRef, useState } from 'react'
import { Button, Input, ItemAvatar, ItemContent, Tag } from '@qijenchen/design-system'
import { Check, FileText, HardDrive, ListChecks, MessageCircle, Send, Sparkles, X, type LucideIcon } from 'lucide-react'
import type { NativeAppKey } from './WorkspaceSettings'

export type BannerApp = NativeAppKey | 'agent'

const APP_META: Record<BannerApp, { label: string; icon: LucideIcon }> = {
  chats: { label: 'Chats', icon: MessageCircle },
  tasks: { label: 'Tasks', icon: ListChecks },
  docs: { label: 'Docs', icon: FileText },
  drive: { label: 'Drive', icon: HardDrive },
  agent: { label: 'AI agent', icon: Sparkles },
}

export type BannerAction = {
  label: string
  primary?: boolean
  /** 按下後卡片換成這句結果,停 3 秒後收起(在卡上就完成,不必跳頁) */
  result?: string
}

export type BannerData = {
  id: string
  /** 同一個對話 / 物件的 key:新通知取代舊卡 */
  threadKey?: string
  app: BannerApp
  /** 來源脈絡:聊天室 / 專案 / 文件名稱(1:1 聊天不填) */
  context?: string
  actor?: { name: string; avatarUrl?: string }
  /** 沒有人(系統提醒)時的標題 */
  title?: string
  body: string
  /** 為什麼收到(@mention / 優先聯絡人 / 會議聊天…);urgent 另外用紅色標籤 */
  reason?: string
  urgent?: boolean
  /** 同一對話累計則數(> 1 時標題後顯示) */
  count?: number
  /** 可直接回覆(Chats / Docs 留言) */
  reply?: boolean
  actions?: BannerAction[]
  time?: string
}

/** 單張卡(靜態渲染也能用:情境總覽頁直接排出來) */
export function NotificationBanner({
  data,
  onDismiss,
  onOpen,
  onInteractingChange,
  showPreview = true,
}: {
  data: BannerData
  onDismiss?: () => void
  onOpen?: () => void
  /** 回覆中 / 滑鼠停留 → 暫停自動收起 */
  onInteractingChange?: (v: boolean) => void
  /** 設定「Show message preview」關閉 → 只顯示誰傳來 */
  showPreview?: boolean
}) {
  const meta = APP_META[data.app]
  const AppIcon = meta.icon
  const [replying, setReplying] = useState(false)
  const [draft, setDraft] = useState('')
  const [result, setResult] = useState<string | null>(null)

  useEffect(() => { onInteractingChange?.(replying) }, [replying, onInteractingChange])
  useEffect(() => {
    if (!result) return
    const t = window.setTimeout(() => onDismiss?.(), 3000)
    return () => window.clearTimeout(t)
  }, [result, onDismiss])

  const name = data.actor?.name ?? data.title ?? meta.label
  const body = showPreview ? data.body : previewOffText(data)
  const sourceLine = [meta.label, data.context].filter(Boolean).join(' · ')

  return (
    <div
      role={data.urgent ? 'alert' : 'status'}
      aria-label={`${data.urgent ? 'Urgent: ' : ''}${name}${data.context ? ` in ${data.context}` : ''}`}
      className="w-[360px] max-w-full overflow-hidden rounded-lg bg-surface-raised text-foreground"
      style={{ boxShadow: 'var(--elevation-200)' }}
    >
      <div className="flex flex-col gap-2 px-4 py-3">
        {/* 來源列:app + 脈絡 + 時間 + 關閉 */}
        <div className="flex items-center gap-2 text-caption text-fg-secondary">
          <AppIcon size={16} className="shrink-0" aria-hidden />
          <span className="min-w-0 flex-1 truncate">{sourceLine}</span>
          {data.urgent && <Tag color="red" solid size="sm">Urgent</Tag>}
          {data.time && <span className="shrink-0">{data.time}</span>}
          {onDismiss && <Button variant="text" size="sm" iconOnly dismiss startIcon={X} aria-label="Dismiss notification" onClick={onDismiss} />}
        </div>

        {result ? (
          <div className="flex items-center gap-2 text-body" role="status">
            <Check size={16} className="shrink-0 text-success-text" aria-hidden />
            <span>{result}</span>
          </div>
        ) : (
          <>
            {/* 內容列(Family 2):頭像 + label / description;點內容 = 打開來源 */}
            <button
              type="button"
              onClick={onOpen}
              className="-mx-2 flex items-start gap-3 rounded-md px-2 py-1 text-left hover:bg-neutral-hover"
            >
              {data.actor ? (
                <ItemAvatar mode="block" src={data.actor.avatarUrl} alt={data.actor.name} />
              ) : (
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-subtle text-primary" aria-hidden>
                  <AppIcon size={16} />
                </span>
              )}
              <ItemContent
                className="min-w-0 flex-1"
                labelTruncate={false}
                label={
                  <span className="font-semibold">
                    {name}
                    {data.count && data.count > 1 ? <span className="font-normal text-fg-secondary"> · {data.count} new messages</span> : null}
                  </span>
                }
                description={<span className="line-clamp-2">{body}</span>}
              />
            </button>

            {data.reason && (
              <p className="pl-11 text-caption text-fg-secondary">{data.reason}</p>
            )}

            {replying ? (
              <form
                className="flex items-center gap-2 pl-11"
                onSubmit={(e) => {
                  e.preventDefault()
                  if (!draft.trim()) return
                  setReplying(false)
                  setResult('Reply sent')
                }}
              >
                <Input
                  size="sm"
                  autoFocus
                  aria-label={`Reply to ${name}`}
                  placeholder={`Reply to ${name.split(' ')[0]}`}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setReplying(false) } }}
                  className="min-w-0 flex-1"
                />
                <Button type="submit" variant="primary" size="sm" iconOnly startIcon={Send} aria-label="Send reply" disabled={!draft.trim()} />
              </form>
            ) : (data.reply || data.actions?.length) ? (
              <div className="flex flex-wrap items-center gap-2 pl-11">
                {data.reply && (
                  <Button variant="secondary" size="sm" onClick={() => setReplying(true)}>Reply</Button>
                )}
                {data.actions?.map((a) => (
                  <Button
                    key={a.label}
                    variant={a.primary ? 'primary' : 'secondary'}
                    size="sm"
                    onClick={() => (a.result ? setResult(a.result) : onOpen?.())}
                  >
                    {a.label}
                  </Button>
                ))}
              </div>
            ) : null}

            {data.urgent && (
              <p className="pl-11 text-caption text-fg-secondary">Reminds you every 2 minutes until you read it.</p>
            )}
          </>
        )}
      </div>
    </div>
  )
}

/** 預覽關閉時的內文:只說誰做了什麼(Teams「Show message preview」關閉同) */
function previewOffText(d: BannerData) {
  switch (d.app) {
    case 'chats': return d.context ? `New message in ${d.context}` : 'Sent you a message'
    case 'docs': return 'Commented on a doc'
    case 'tasks': return 'Task update'
    case 'drive': return 'Drive update'
    default: return 'New update'
  }
}

// ════════════════════════════════════════════════════════════════════════════
// 疊放區(右上角;Toast 在右下 = 操作回饋,banner 在右上 = 別人找你,兩者不搶同一角)
// ════════════════════════════════════════════════════════════════════════════
const AUTO_HIDE_MS = 10000
const MAX_VISIBLE = 3

export function useBannerStack() {
  const [items, setItems] = useState<BannerData[]>([])
  const push = (b: BannerData) =>
    setItems((list) => {
      const prev = b.threadKey ? list.find((x) => x.threadKey === b.threadKey) : undefined
      const merged = prev ? { ...b, count: (prev.count ?? 1) + 1 } : b
      const rest = list.filter((x) => !(b.threadKey && x.threadKey === b.threadKey))
      return [merged, ...rest].slice(0, MAX_VISIBLE)
    })
  const dismiss = (id: string) => setItems((list) => list.filter((x) => x.id !== id))
  /** 在別處讀過 → 收起同一對話的卡 */
  const dismissThread = (threadKey: string) => setItems((list) => list.filter((x) => x.threadKey !== threadKey))
  return { items, push, dismiss, dismissThread }
}

export function BannerStack({
  items,
  onDismiss,
  onOpen,
  showPreview,
}: {
  items: BannerData[]
  onDismiss: (id: string) => void
  onOpen?: (b: BannerData) => void
  showPreview: boolean
}) {
  return (
    <section
      aria-label="Notifications"
      className="pointer-events-none fixed right-6 top-6 z-[60] flex flex-col gap-2"
    >
      {items.map((b) => (
        <TimedBanner key={b.id + (b.count ?? 1)} data={b} onDismiss={() => onDismiss(b.id)} onOpen={onOpen ? () => { onOpen(b); onDismiss(b.id) } : undefined} showPreview={showPreview} />
      ))}
    </section>
  )
}

function TimedBanner({
  data,
  onDismiss,
  onOpen,
  showPreview,
}: {
  data: BannerData
  onDismiss: () => void
  onOpen?: () => void
  showPreview: boolean
}) {
  const [hovered, setHovered] = useState(false)
  const [interacting, setInteracting] = useState(false)
  const remaining = useRef(AUTO_HIDE_MS)
  const startedAt = useRef(0)
  const paused = hovered || interacting || !!data.urgent
  useEffect(() => {
    if (paused) return
    startedAt.current = Date.now()
    const t = window.setTimeout(onDismiss, remaining.current)
    return () => {
      window.clearTimeout(t)
      remaining.current -= Date.now() - startedAt.current
    }
  }, [paused, onDismiss])
  return (
    <div className="pointer-events-auto" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      <NotificationBanner data={data} onDismiss={onDismiss} onOpen={onOpen} onInteractingChange={setInteracting} showPreview={showPreview} />
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// 通知判斷:照「Teams 通知決策流程圖」第 1 張圖的關卡順序(+ 第 2 張圖的系統勿擾)
// 結果:banner = 跳橫幅 + 徽章;badge = 只留未讀徽章;none = 不通知
// ════════════════════════════════════════════════════════════════════════════
export type IncomingEvent = {
  app: NativeAppKey
  /** NATIVE_APPS[].events[].key */
  kind: string
  actorId?: string
  urgent?: boolean
  /** 直接 @ 我(不含 @channel / @everyone) */
  directMention?: boolean
  /** 這個聊天被我靜音 */
  muted?: boolean
  /** 是我正在開的會議的聊天 */
  meetingChat?: boolean
}

export type RouteContext = { inMeeting: boolean; systemDnd: boolean }

export type RouteResult = { outcome: 'banner' | 'badge' | 'none'; gate: string; reason?: string }

export function routeNotification(
  e: IncomingEvent,
  prefs: import('./WorkspaceSettings').NotificationPrefs,
  ctx: RouteContext,
  now = Date.now(),
): RouteResult {
  // 1. 寄件人標緊急 → 一律通知(可穿過暫停、勿擾、會議靜音;收件人不能拒收)
  if (e.urgent) return { outcome: 'banner', gate: 'Urgent', reason: undefined }
  // 2. 這類通知的設定
  const mode = prefs.delivery[e.app]?.[e.kind] ?? 'banner'
  if (mode === 'off') return { outcome: 'none', gate: 'Delivery: Off' }
  if (mode === 'badge') return { outcome: 'badge', gate: 'Delivery: Badge only' }
  // 3. 這個聊天被靜音 → 只有直接 @ 我才放行
  let reason: string | undefined = e.directMention ? 'You were @mentioned' : undefined
  if (e.muted) {
    if (!e.directMention) return { outcome: 'none', gate: 'Chat muted' }
    reason = 'You were @mentioned · this chat is muted'
  }
  // 4. 暫停所有通知 → 只放行優先聯絡人(開著 Let priority contacts through 時)
  const paused = prefs.pauseUntil === 'manual' || (typeof prefs.pauseUntil === 'number' && prefs.pauseUntil > now)
  const isPriority = !!e.actorId && prefs.priorityIds.includes(e.actorId)
  if (paused) {
    if (!(prefs.allowPriority && isPriority)) return { outcome: 'badge', gate: 'Notifications paused' }
    reason = 'Priority contact · notifications are paused'
  }
  // 5. 會議中靜音 → 只放行這場會議的聊天
  if (ctx.inMeeting && prefs.muteInMeetings) {
    if (!e.meetingChat) return { outcome: 'badge', gate: 'Muted during meeting' }
    reason = 'From your current meeting'
  }
  // 6.(第 2 張圖)系統勿擾連動
  if (ctx.systemDnd && prefs.followSystemFocus) return { outcome: 'badge', gate: 'System Do Not Disturb' }
  return { outcome: 'banner', gate: 'Delivered', reason }
}
