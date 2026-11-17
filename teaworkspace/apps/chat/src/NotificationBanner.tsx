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
// - 同一個對話又有新訊息 → 取代原卡、顯示則數(不疊出一排同一個人)。設定 Display › Group banners from the same chat 關閉時每則各一張。
// - 同時最多 3 張(預設,toast.spec.md 同規則;設定可改 3–5),更舊的收起,只留未讀數。
//   張數多時(5 張 Comfy 約 1000px)放不下的整張先不顯示(最舊的先藏),不露出半張;視窗變大再出現。
// - 在任何地方讀過 → 卡片收起(規格第 10 節第 3 點)。
// - 卡上「為什麼收到」一行(規格第 10 節第 1 點)。
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Avatar, Button, Tag } from '@qijenchen/design-system'
import { FileText, HardDrive, Hexagon, ListChecks, MessageCircle, SendHorizontal, Sparkles, X, type LucideIcon } from 'lucide-react'
import { NATIVE_APPS, type NativeAppKey } from './WorkspaceSettings'

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
  /** 轉傳的訊息(2026-11-11):body = 轉傳者附的話(可空),原訊息放引用框 */
  forwarded?: { from: string; body: string }
  /**
   * Thread 回覆(2026-11-16):跟聊天主畫面的訊息分開成另一張卡(threadKey 也要不同),因為 Reply 的目的地不同。
   * root = thread 第一則訊息的摘要,讓人認得是哪個 thread。
   */
  thread?: { root: string }
  /**
   * App 通知(2026-11-17):來源是 app 而不是人。卡片第二區 = app logo(圓形)+ app 名 +「APP」標籤;沒有回覆功能,卡片高度 hug。
   * logo = 圖示 + 底色(示範用的虛構 app,不用真實品牌 logo)。
   */
  appInfo?: { name: string; icon: LucideIcon; color: string }
}

/** 卡片尺寸(2026-11-11):對標 Teams Display「Change the size of your message and content previews. Choose Comfy or Compact.」 */
export type BannerSize = 'comfy' | 'compact'

/** 單張卡(靜態渲染也能用:情境總覽頁直接排出來) */
export function NotificationBanner({
  data,
  onDismiss,
  onOpen,
  onInteractingChange,
  showPreview = true,
  size = 'comfy',
  defaultReplying = false,
}: {
  data: BannerData
  size?: BannerSize
  /** 一開始就展開回覆輸入框(總覽頁示意用) */
  defaultReplying?: boolean
  onDismiss?: () => void
  onOpen?: () => void
  /** 回覆中 / 滑鼠停留 → 暫停自動收起 */
  onInteractingChange?: (v: boolean) => void
  /** 設定「Show message preview」關閉 → 只顯示誰傳來 */
  showPreview?: boolean
}) {
  const meta = APP_META[data.app]
  const AppIcon = meta.icon
  const [replying, setReplying] = useState(defaultReplying)
  const openReply = () => setReplying(true)
  const [draft, setDraft] = useState('')
  const [result, setResult] = useState<string | null>(null)

  useEffect(() => { onInteractingChange?.(replying) }, [replying, onInteractingChange])
  useEffect(() => {
    if (!result) return
    const t = window.setTimeout(() => onDismiss?.(), 3000)
    return () => window.clearTimeout(t)
  }, [result, onDismiss])

  const name = data.actor?.name ?? data.title ?? meta.label
  // 情境(2026-11-17 user):DM = 人像 + 人名;Group chat = 發言者頭像 + 群組名;App = app logo + app 名 + APP 標籤(不能回覆)
  const kind: 'dm' | 'group' | 'app' = data.appInfo ? 'app' : data.context ? 'group' : 'dm'
  const canReply = kind !== 'app'
  const titleText = kind === 'app' ? data.appInfo!.name : kind === 'group' ? data.context! : name
  // 第二區第一排:App 多一個「APP」標籤(DS Tag turquoise sm,dark mode;左右 4px、上下 0 —— Tag 外框 px-1 改 px-0,只留文字本身的 4px)
  const titleRow = (
    <span className="flex min-w-0 items-center gap-1">
      <span className="truncate text-[14px] font-bold leading-[1.5] text-white">{titleText}</span>
      {kind === 'app' && (
        <Tag color="turquoise" size="sm" data-theme="dark" className="shrink-0 px-0 py-0">APP</Tag>
      )}
    </span>
  )
  const body = showPreview ? data.body : previewOffText(data)
  // 來源列:thread → 「Chats · Thread in 群組」(DM 的 thread → 「Chats · Thread」)
  const place = data.thread ? (data.context ? `Thread in ${data.context}` : 'Thread') : data.context
  const sourceLine = [meta.label, place].filter(Boolean).join(' · ')
  const countText = data.count && data.count > 1 ? ` · ${data.count} new ${data.thread ? 'replies' : 'messages'}` : ''
  // Reply 送到哪裡,送出前就寫在輸入框上:thread → 回到 thread;群組 → 回到群組;一對一 → 回給對方
  const replyTarget = data.thread ? 'Reply in thread' : data.context ? `Reply to ${data.context}` : `Reply to ${name.split(' ')[0]}`

  // ── Comfy / Compact 共用的區塊 ──
  const brandRow = (
    <div className="flex items-center gap-1 text-white/65">
      <Hexagon size={16} className="shrink-0" aria-hidden />
      <span className="min-w-0 flex-1 truncate text-[12px] font-bold leading-[1.3]">Workspace</span>
      {onDismiss && (
        <button
          type="button"
          aria-label="Dismiss notification"
          onClick={onDismiss}
          className="-m-1 flex shrink-0 items-center justify-center rounded p-1 text-white/65 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
        >
          <X size={16} aria-hidden />
        </button>
      )}
    </div>
  )
  const avatarEl = data.appInfo ? (
    // App logo:同樣 40 圓形 + 內框 1px #E8E8E8
    <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white" style={{ background: data.appInfo.color }} aria-hidden>
      <data.appInfo.icon size={20} />
      <span className="pointer-events-none absolute inset-0 rounded-full shadow-[inset_0_0_0_1px_#E8E8E8]" />
    </span>
  ) : data.actor ? (
    // 頭像內框 1px #E8E8E8(2026-11-17 user):疊一層 inset ring,不佔版面、不改變 40px 尺寸
    <span className="relative h-10 w-10 shrink-0">
      <Avatar src={data.actor.avatarUrl} alt={data.actor.name} size={40} />
      <span className="pointer-events-none absolute inset-0 rounded-full shadow-[inset_0_0_0_1px_#E8E8E8]" aria-hidden />
    </span>
  ) : (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/[0.08]" aria-hidden>
      <AppIcon size={16} />
    </span>
  )
  const sendReply = () => {
    if (!draft.trim()) return
    setDraft('')
    setReplying(false)
    setResult('Reply sent')
  }
  /** 回覆輸入框 + 送出鈕;compact = 使用者按了 Reply 才出現 → 自動 focus,Esc 回到訊息 */
  const replyField = (compact: boolean) => (
    <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); sendReply() }}>
      <input
        type="text"
        autoFocus={compact}
        aria-label={replyTarget}
        placeholder="Send a reply"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={() => { if (!compact) setReplying(true) }}
        onBlur={() => { if (!compact) setReplying(false) }}
        onKeyDown={(e) => {
          if (e.key !== 'Escape') return
          e.stopPropagation()
          if (compact) setReplying(false)
          else (e.target as HTMLInputElement).blur()
        }}
        className="h-7 min-w-0 flex-1 rounded-md border border-white/25 bg-white/[0.08] px-2 text-[14px] leading-[1.5] text-white outline-none placeholder:text-white/65 focus:border-primary"
      />
      <button
        type="submit"
        aria-label="Send reply"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-white hover:bg-white/[0.08] focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
      >
        <SendHorizontal size={16} aria-hidden />
      </button>
    </form>
  )

  // ── Compact(2026-11-17 user 視覺規格):外框、第一區、頭像、名字同 Comfy,差異只有三點 ──
  //   1. 第二列訊息最多一行,但這一列固定高 28px(= 回覆輸入框高),切到回覆時卡片高度不跳
  //   2. 滑鼠移到卡上(或鍵盤 focus 進卡片)時,第二區最右側出現 Reply(DS Button tertiary sm,寬 54px)
  //   3. 按 Reply → 第二列換成回覆輸入框 + 送出鈕(樣式同 Comfy 第三區)
  if (size === 'compact') {
    const compactBody = result ?? (data.forwarded && showPreview ? `Forwarded a message from ${data.forwarded.from}` : body)
    return (
      <div
        role={data.urgent ? 'alert' : 'status'}
        aria-label={`${data.urgent ? 'Urgent: ' : ''}${name}${data.context ? ` in ${data.context}` : ''}`}
        className="group flex w-[360px] max-w-full flex-col gap-2 overflow-hidden rounded-[8px] p-3 text-white"
        style={{ background: '#33337B', boxShadow: '0 8px 16px rgba(0, 0, 0, 0.16)' }}
      >
        {brandRow}
        <div className="flex items-center gap-3">
          {avatarEl}
          <div className="flex min-w-0 flex-1 flex-col">
            {replying ? (
              <>
                {titleRow}
                {replyField(true)}
              </>
            ) : (
              <button
                type="button"
                onClick={onOpen}
                className="flex min-w-0 flex-col rounded text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
              >
                {titleRow}
                {/* 一行訊息;可回覆時這一列固定 28(= 輸入框高),App 不能回覆 → hug */}
                <span className={`flex items-center ${canReply ? 'h-7' : ''}`}>
                  <span className="truncate text-[12px] font-normal leading-[1.3] text-white">{compactBody}</span>
                </span>
              </button>
            )}
          </div>
          {canReply && !replying && !result && (
            <Button
              variant="tertiary"
              size="sm"
              // 深色底上用 DS dark mode 樣式(2026-11-17 user):data-theme="dark" 是 DS 支援的局部主題範圍(semantic.css [data-theme]),不另寫顏色
              data-theme="dark"
              // 寬 56px = DS Button sm 最小寬 min-w-14(規格原寫 54,2026-11-17 user 決定維持 DS 的 56)
              className="hidden shrink-0 justify-center group-hover:inline-flex group-focus-within:inline-flex"
              aria-label={replyTarget}
              onClick={openReply}
            >
              Reply
            </Button>
          )}
        </div>
      </div>
    )
  }

  // ── Comfy(2026-11-17 user 視覺規格):品牌深色卡。數值照 user 指定,尚未 token 化(見 STRUCTURE.md §Push banner)。
  //   第一區:六角形 logo 16 + 品牌名 12/130 bold,白 65%;右側關閉 16,同色。
  //   第二區:頭像 40 圓形;名字 14/150 bold 白、一行;訊息 12/130 regular 白、最多兩行且固定兩行高;兩排間距 0;頭像與文字間距 12。
  //   第三區:回覆輸入框高 28、底白 8%、框線 1px 白 25%、placeholder「Send a reply」14/150 白 65%;右側送出鈕 lucide send-horizontal(白)。
  //   第二、三區間距 8;卡片 padding 12、圓角 8、底色 #33337B、陰影 0 8 16 #000 16%;頭像內框 1px #E8E8E8;輸入框 focus 框線 = primary(DS Textarea 同用 border-primary)。
  return (
    <div
      role={data.urgent ? 'alert' : 'status'}
      aria-label={`${data.urgent ? 'Urgent: ' : ''}${name}${data.context ? ` in ${data.context}` : ''}`}
      className="flex w-[360px] max-w-full flex-col gap-2 overflow-hidden rounded-[8px] p-3 text-white"
      // drop shadow X0 Y8 Blur16 #000 16%(2026-11-17 user)
      style={{ background: '#33337B', boxShadow: '0 8px 16px rgba(0, 0, 0, 0.16)' }}
    >
      {/* 第一區:品牌列 */}
      {brandRow}

      {/* 第二區:頭像 + 名字 / 訊息(固定兩行高,卡片高度不跟內容變) */}
      <button
        type="button"
        onClick={onOpen}
        className="flex items-center gap-3 rounded text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
      >
        {avatarEl}
        <span className="flex min-w-0 flex-1 flex-col">
          {titleRow}
          {/* 最多兩行;可回覆時固定兩行高,App 不能回覆 → hug */}
          <span className={`line-clamp-2 text-[12px] font-normal leading-[1.3] text-white ${canReply ? 'h-[2.6em]' : ''}`}>
            {result ?? (data.forwarded && showPreview ? `Forwarded a message from ${data.forwarded.from}` : body)}
          </span>
        </span>
      </button>

      {/* 第三區:回覆輸入框 + 送出(一直顯示) */}
      {canReply && replyField(false)}
    </div>
  )
}

/** 預覽關閉時的內文:只說誰做了什麼(Teams「Show message preview」關閉同) */
function previewOffText(d: BannerData) {
  switch (d.app) {
    case 'chats':
      if (d.forwarded) return d.context ? `Forwarded a message in ${d.context}` : 'Forwarded you a message'
      return d.context ? `New message in ${d.context}` : 'Sent you a message'
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
/** 同時顯示張數:預設 3(toast.spec.md 同規則);設定 Display › Show this many notifications on screen at once 可選 3–5(2026-11-12 user) */
export const DEFAULT_MAX_VISIBLE = 3

export function useBannerStack() {
  const [items, setItems] = useState<BannerData[]>([])
  /** group = 設定「Group banners from the same chat」:開 → 同 threadKey 收合成一張並累計則數;關 → 每則各一張 */
  const push = (b: BannerData, group = true, max = DEFAULT_MAX_VISIBLE) =>
    setItems((list) => {
      if (!group) return [b, ...list].slice(0, max)
      const prev = b.threadKey ? list.find((x) => x.threadKey === b.threadKey) : undefined
      const merged = prev ? { ...b, count: (prev.count ?? 1) + 1 } : b
      const rest = list.filter((x) => !(b.threadKey && x.threadKey === b.threadKey))
      return [merged, ...rest].slice(0, max)
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
  size = 'comfy',
}: {
  items: BannerData[]
  onDismiss: (id: string) => void
  onOpen?: (b: BannerData) => void
  showPreview: boolean
  size?: BannerSize
}) {
  // 張數多時(例如 5 張 Comfy)視窗放不下:放不下的整張不顯示(最舊的先藏),不露出半張;視窗變大就再出現
  const ref = useRef<HTMLElement>(null)
  const [fitCount, setFitCount] = useState(items.length)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => {
      const limit = window.innerHeight - 48 // 上下各 24px(與 top-6 對稱)
      const kids = Array.from(el.children) as HTMLElement[]
      let used = 0
      let n = 0
      for (const k of kids) {
        const h = k.scrollHeight + (n > 0 ? 8 : 0) // gap-2
        if (used + h > limit) break
        used += h
        n++
      }
      setFitCount(Math.max(1, n))
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [items, size, showPreview])
  return (
    <section
      ref={ref}
      aria-label="Notifications"
      className="pointer-events-none fixed right-6 top-6 z-[60] flex flex-col gap-2"
    >
      {items.map((b, i) => (
        <div key={b.id + (b.count ?? 1)} className={i >= fitCount ? 'invisible absolute' : undefined} aria-hidden={i >= fitCount || undefined}>
          <TimedBanner data={b} size={size} onDismiss={() => onDismiss(b.id)} onOpen={onOpen ? () => { onOpen(b); onDismiss(b.id) } : undefined} showPreview={showPreview} />
        </div>
      ))}
    </section>
  )
}

function TimedBanner({
  data,
  size,
  onDismiss,
  onOpen,
  showPreview,
}: {
  data: BannerData
  size: BannerSize
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
      <NotificationBanner data={data} size={size} onDismiss={onDismiss} onOpen={onOpen} onInteractingChange={setInteracting} showPreview={showPreview} />
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// 通知判斷:照「Teams 通知決策流程圖」第 1 張圖的關卡順序(+ 第 2 張圖的系統勿擾)
// 結果:banner = 跳橫幅 + 徽章;badge = 只留未讀徽章;none = 不通知
// ════════════════════════════════════════════════════════════════════════════
export type IncomingEvent = {
  app: NativeAppKey
  /** NATIVE_APPS[].sections[].events[].key(Chats:mentionsEveryone / mentionsPersonal / messages / replies / reactions) */
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
  // 2. 這類通知的設定:功能區塊總開關 → 該種通知 Show in banner / Off
  //    (聊天訊息的未讀數本來就在,所以 Off / 被擋下 = 不跳卡、只剩原本的未讀)
  const section = NATIVE_APPS.find((a) => a.key === e.app)?.sections.find((sec) => sec.events.some((x) => x.key === e.kind))
  if (section?.key && prefs.sectionEnabled[section.key] === false) return { outcome: 'badge', gate: `${section.title}: off` }
  const mode = prefs.delivery[e.app]?.[e.kind] ?? 'banner'
  if (mode === 'off') return { outcome: 'badge', gate: 'Delivery: Off' }
  // 3. 這個聊天被靜音 → 只有 Personal @mention 才放行(Everyone @mentions 不放行)
  const personal = e.kind === 'mentionsPersonal' || e.directMention
  let reason: string | undefined = personal ? 'You were @mentioned' : e.kind === 'mentionsEveryone' ? 'Everyone in the chat was @mentioned' : undefined
  if (e.muted) {
    if (!personal) return { outcome: 'none', gate: 'Chat muted' }
    reason = 'You were @mentioned · this chat is muted'
  }
  // 4. 暫停所有通知 → 只放行優先聯絡人(開著 Let priority contacts through 時)
  const paused = prefs.pauseUntil === 'manual' || (typeof prefs.pauseUntil === 'number' && prefs.pauseUntil > now)
  const isPriority = !!e.actorId && prefs.priorityIds.includes(e.actorId)
  if (paused) {
    if (!(prefs.allowPriority && isPriority)) return { outcome: 'badge', gate: 'Notifications paused' }
    reason = 'Priority contact · notifications are paused'
  }
  // 5. 會議 / 通話中(Display › Show notifications while "In a Call" status 取消勾選)→ 只放行這場會議的聊天
  if (ctx.inMeeting && !prefs.showDuringCalls) {
    if (!e.meetingChat) return { outcome: 'badge', gate: 'Muted during meeting' }
    reason = 'From your current meeting'
  }
  // 6.(第 2 張圖)系統勿擾連動
  if (ctx.systemDnd && prefs.followSystemFocus) return { outcome: 'badge', gate: 'System Do Not Disturb' }
  return { outcome: 'banner', gate: 'Delivered', reason }
}
