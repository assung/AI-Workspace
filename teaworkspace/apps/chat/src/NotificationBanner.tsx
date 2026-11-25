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
// - 同一個對話又有新訊息 → 取代原卡、顯示則數(不疊出一排同一個人)。設定 Display › Group banners from the same chat 關閉時每則各一張。
// - 同時最多 3 張(預設,toast.spec.md 同規則;設定可改 3–5),更舊的收起,只留未讀數。
//   張數多時(5 張 Comfy 約 1000px)放不下的整張先不顯示(最舊的先藏),不露出半張;視窗變大再出現。
// - 在任何地方讀過 → 卡片收起(規格第 10 節第 3 點)。
// - 卡上「為什麼收到」一行(規格第 10 節第 1 點)。
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Avatar, Button, Popover, PopoverContent, PopoverTrigger, Tag, Tooltip, TooltipContent, TooltipTrigger } from '@qijenchen/design-system'
import { FileText, HardDrive, Hexagon, ListChecks, MessageCircle, SendHorizontal, Settings, SmilePlus, Sparkles, X, type LucideIcon } from 'lucide-react'
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
  /** 為什麼收到(@mention / 優先聯絡人 / 會議聊天…) */
  reason?: string
  /** 同一對話累計則數(> 1 時標題後顯示) */
  count?: number
  /** 可直接回覆(Chats / Docs 留言) */
  reply?: boolean
  actions?: BannerAction[]
  time?: string
  /**
   * 轉傳的訊息(2026-11-17 user):body = 轉傳者另外附的話(可空)。第二排:
   * 只轉傳 → DM「Forwarded a message」/ Group「人名 forwarded a message」;
   * 轉傳 + 附話 → DM「Forwarded a message: 附話」/ Group「人名 forwarded a message: 附話」。
   * from / body = 原訊息的作者與內容(卡片不顯示,點開聊天才看得到)。
   */
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
  /**
   * Emoji 回應(2026-11-17 user):DM / Group chat 裡有人對你的訊息按了 emoji。
   * 頭像右下角疊一個 16px 白底圓(emoji 12px 置中,外框 1.5px = 卡片底色,畫在圓外);不能回覆 → 卡片 hug。
   * DM:第一排人名、第二排「Reacted to your message: …」;Group chat:第一排群組名、第二排「人名 reacted to your message: …」。
   */
  reaction?: { emoji: string; message: string }
  /** 被 @ 提及(2026-11-17 user):'you' = 點名你 →「@You」標籤;'all' = @All →「@All」標籤。訊息內文本身含 @名字 / @All。 */
  mention?: 'you' | 'all'
  /** 疊放區內部用:同一張卡的 React key(原地更新時不變,保留回覆草稿) */
  instanceKey?: string
}

/** 卡片尺寸(2026-11-11):對標 Teams Display「Change the size of your message and content previews. Choose Comfy or Compact.」 */
export type BannerSize = 'comfy' | 'compact'

/** 單張卡(靜態渲染也能用:情境總覽頁直接排出來) */
export function NotificationBanner({
  data,
  onDismiss,
  onOpen,
  onInteractingChange,
  onOpenSettings,
  onReact,
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
  /** 第一列「Go to Notification settings」(2026-11-25 user) */
  onOpenSettings?: () => void
  /** 第一列快速回應 emoji;送出後卡片收起(同回覆) */
  onReact?: (emoji: string) => void
  /** 設定「Show message and content previews」關閉 → 第二排一律「Message preview hidden」(2026-11-17 user) */
  showPreview?: boolean
}) {
  const meta = APP_META[data.app]
  const AppIcon = meta.icon
  const [replying, setReplying] = useState(defaultReplying)
  const openReply = () => setReplying(true)
  const [draft, setDraft] = useState('')
  const [result, setResult] = useState<string | null>(null)

  // 快速回應 popover:滑鼠移上 emoji 鈕就打開(2026-11-25 user),移開 150ms 後收;打開期間卡片不計時(popover 在卡片外,不算 hover 卡片)
  const [reactOpen, setReactOpen] = useState(false)
  const reactCloseTimer = useRef<number | undefined>(undefined)
  const openReact = () => { window.clearTimeout(reactCloseTimer.current); setReactOpen(true) }
  const closeReactSoon = () => { window.clearTimeout(reactCloseTimer.current); reactCloseTimer.current = window.setTimeout(() => setReactOpen(false), 150) }
  useEffect(() => () => window.clearTimeout(reactCloseTimer.current), [])
  useEffect(() => { onInteractingChange?.(replying || reactOpen) }, [replying, reactOpen, onInteractingChange])
  useEffect(() => {
    if (!result) return
    const t = window.setTimeout(() => onDismiss?.(), 3000)
    return () => window.clearTimeout(t)
  }, [result, onDismiss])

  const name = data.actor?.name ?? data.title ?? meta.label
  const body = data.body
  // 情境(2026-11-17 user):DM = 人像 + 人名;Group chat = 發言者頭像 + 群組名;App = app logo + app 名 + APP 標籤(不能回覆)
  const kind: 'dm' | 'group' | 'app' = data.appInfo ? 'app' : data.context ? 'group' : 'dm'
  // 有動作按鈕時不能回覆:按鈕直接取代輸入框(2026-11-17 user)
  // 預覽關閉 → 按鈕一起藏(2026-11-17 user 選 A):看不到內容就不能直接做決定(同 Apple HIG 隱藏預覽時要先看到內容才能操作)。卡片 hug,點卡片打開 app
  const showActions = !!data.actions?.length && showPreview
  const hasActions = showActions && !result
  // Emoji 回應也不能回覆(2026-11-17 user)→ 沒有輸入框 / Reply,卡片 hug
  const canReply = kind !== 'app' && !data.actions?.length && !data.reaction
  // 第三區存在(輸入框或按鈕)→ 訊息列固定高,卡片高度不跳;都沒有 → hug
  const hasFooter = canReply || showActions
  // Group chat 第二排 =「人名: 訊息」,才看得出是誰說的(2026-11-17 user)
  // Emoji 回應第二排:DM =「Reacted to your message: 原訊息」;Group chat =「人名 reacted to your message: 原訊息」(2026-11-17 user)
  const reactedTo = data.reaction ? `reacted to your message: ${data.reaction.message}` : ''
  // 轉傳第二排(2026-11-17 user):有附話才接「: 附話」
  const forwardedText = data.forwarded
    ? `forwarded a message${data.body ? `: ${data.body}` : ''}`
    : ''
  // 句首(DM 沒有人名開頭)大寫:reacted → Reacted、forwarded → Forwarded
  const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)
  const actorVerb = (t: string) => (kind === 'group' && data.actor ? `${data.actor.name} ${t}` : cap(t))
  // 預覽關閉:不論情境(DM / Group / App / 轉傳 / 回應 / 提及),第二排一律同一句(2026-11-17 user)
  const messageText = result ?? (
    !showPreview
      ? PREVIEW_HIDDEN
      : data.reaction
      ? actorVerb(reactedTo)
      : data.forwarded
        ? actorVerb(forwardedText)
        : kind === 'group' && data.actor ? `${data.actor.name}: ${body}` : body
  )
  /** 動作按鈕:DS Button tertiary sm,dark mode;一顆撐滿、兩顆平分,間距 8(2026-11-17 user 由 12 改 8) */
  const actionButtons = (fill: boolean) =>
    data.actions?.map((a) => (
      <Button
        key={a.label}
        variant="tertiary"
        size="sm"
        data-theme="dark"
        className={fill ? 'min-w-0 flex-1 justify-center' : 'shrink-0 justify-center'}
        onClick={() => (a.result ? setResult(a.result) : onOpen?.())}
      >
        {a.label}
      </Button>
    ))
  // 第一排:App = app 名;Group chat = 群組名(Emoji 回應也是,人名改放第二排);DM = 人名
  const titleText = kind === 'app' ? data.appInfo!.name : kind === 'group' ? data.context! : name
  // 第二區第一排:App 多一個「APP」標籤(DS Tag turquoise sm,dark mode;左右 4px、上下 0 —— Tag 外框 px-1 改 px-0,只留文字本身的 4px)
  const titleRow = (
    // 標籤與名字間距 8(2026-11-17 user):@You / @All 在名字左邊,APP 在名字右邊
    <span className="flex min-w-0 items-center gap-2">
      {data.mention && (
        // 大小同 APP 標籤(sm、左右 4、上下 0;無外框,2026-11-17 user);顏色依 user 指定寫死:底 #FFECB2、字 #C36100
        <Tag
          color="yellow"
          size="sm"
          className={`shrink-0 px-0 py-0 ${MENTION_TAG_NUDGE}`}
          style={{ background: '#FFECB2', color: '#C36100' }}
        >
          {data.mention === 'all' ? '@All' : '@You'}
        </Tag>
      )}
      <span className="truncate text-[14px] font-bold leading-[1.5] text-white">{titleText}</span>
      {kind === 'app' && (
        // 內框 1px,顏色同文字(currentColor)(2026-11-17 user)
        <Tag color="turquoise" size="sm" data-theme="dark" className={`shrink-0 px-0 py-0 shadow-[inset_0_0_0_1px_currentColor] ${APP_TAG_NUDGE}`}>APP</Tag>
      )}
    </span>
  )
  // 來源列:thread → 「Chats · Thread in 群組」(DM 的 thread → 「Chats · Thread」)
  const place = data.thread ? (data.context ? `Thread in ${data.context}` : 'Thread') : data.context
  const sourceLine = [meta.label, place].filter(Boolean).join(' · ')
  const countText = data.count && data.count > 1 ? ` · ${data.count} new ${data.thread ? 'replies' : 'messages'}` : ''
  // Reply 送到哪裡,送出前就寫在輸入框上:thread → 回到 thread;群組 → 回到群組;一對一 → 回給對方
  const replyTarget = data.thread ? 'Reply in thread' : data.context ? `Reply to ${data.context}` : `Reply to ${name.split(' ')[0]}`

  // ── Comfy / Compact 共用的區塊 ──
  // 第一列右側功能鈕(2026-11-25 user):由左至右 emoji 快速回應 → 設定 → 關閉。
  // 三顆同一種樣式(16px 圖示、白 65%、hover 白、可點範圍 24px);鈕與鈕之間 8px。
  // emoji 回應只出現在「一則訊息」的卡(DM / 群組 / 提及 / 轉傳);App 卡與「別人回應你」的卡沒有可回應的訊息。
  const canReact = kind !== 'app' && !data.reaction
  const iconBtnClass = '-m-1 flex shrink-0 items-center justify-center rounded p-1 text-white/65 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white data-[state=open]:text-white'
  const brandRow = (
    <div className="flex items-center gap-1 text-white/65">
      <Hexagon size={16} className="shrink-0" aria-hidden />
      <span className="min-w-0 flex-1 truncate text-[12px] font-bold leading-[1.3]">Workspace</span>
      <div className="flex shrink-0 items-center gap-2">
        {canReact && (
          <Popover open={reactOpen} onOpenChange={setReactOpen}>
            <PopoverTrigger asChild>
              <button type="button" aria-label="Add reaction" className={iconBtnClass} onMouseEnter={openReact} onMouseLeave={closeReactSoon}>
                <SmilePlus size={16} aria-hidden />
              </button>
            </PopoverTrigger>
            {/* 樣式沿用聊天訊息 hover 的 ReactionBar(App.tsx):emoji 鈕 rounded-md px-1.5 py-1;z-[70] 疊在通知卡(z-[60])上 */}
            <PopoverContent
              align="end"
              sideOffset={6}
              className="z-[70] w-auto p-0.5"
              onMouseEnter={openReact}
              onMouseLeave={closeReactSoon}
              onOpenAutoFocus={(e) => e.preventDefault()}
            >
              <div role="group" aria-label="Quick reactions" className="flex items-center gap-0.5">
              {QUICK_REACTIONS.map((r) => (
                <button
                  key={r.emoji}
                  type="button"
                  aria-label={`React with ${r.label}`}
                  onClick={() => { setReactOpen(false); onReact?.(r.emoji); onDismiss?.() }}
                  className="rounded-md px-1.5 py-1 text-body leading-none hover:bg-neutral-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                >
                  <span className="text-[20px]" aria-hidden>{r.emoji}</span>
                </button>
              ))}
              </div>
            </PopoverContent>
          </Popover>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" aria-label="Go to Notification settings" onClick={onOpenSettings} className={iconBtnClass}>
              <Settings size={16} aria-hidden />
            </button>
          </TooltipTrigger>
          <TooltipContent>Go to Notification settings</TooltipContent>
        </Tooltip>
        {onDismiss && (
          <button type="button" aria-label="Dismiss notification" onClick={onDismiss} className={iconBtnClass}>
            <X size={16} aria-hidden />
          </button>
        )}
      </div>
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
      {data.reaction && (
        // Emoji 徽章(2026-11-20 user):18px 白圓、emoji 14px 置中;從頭像右下角再往右、往下各推 4px,少遮一點頭像;
        // 外框 1.5px 用卡片底色,像從頭像裡挖出一圈
        <span
          className="absolute -bottom-1 -right-1 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-white text-[14px] leading-none"
          style={{ boxShadow: '0 0 0 1.5px #33337B' }}
          aria-hidden
        >
          {data.reaction.emoji}
        </span>
      )}
    </span>
  ) : (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/[0.08]" aria-hidden>
      <AppIcon size={16} />
    </span>
  )
  const sendReply = () => {
    if (!draft.trim()) return
    // 送出後卡片直接收起,不顯示「Reply sent」(2026-11-17 user)
    setDraft('')
    setReplying(false)
    onDismiss?.()
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
    const compactBody = messageText
    return (
      <div
        role="status"
        aria-label={`${name}${data.context ? ` in ${data.context}` : ''}`}
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
        {/* 動作按鈕:同 Comfy 往下排一列(一顆撐滿、兩顆平分、間距 8),卡片長高(2026-11-17 user) */}
        {hasActions && <div className="flex gap-2">{actionButtons(true)}</div>}
        {showActions && result && <div className="h-7" aria-hidden />}
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
      role="status"
      aria-label={`${name}${data.context ? ` in ${data.context}` : ''}`}
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
          <span className={`line-clamp-2 text-[12px] font-normal leading-[1.3] text-white ${hasFooter ? 'h-[2.6em]' : ''}`}>
            {messageText}
          </span>
        </span>
      </button>

      {/* 第三區:回覆輸入框 + 送出(一直顯示) */}
      {/* 第三區:可回覆 → 輸入框;有動作 → 按鈕取代輸入框(一顆滿寬、兩顆平分,間距 8);結果出現後收起 */}
      {canReply && replyField(false)}
      {hasActions && <div className="flex gap-2">{actionButtons(true)}</div>}
      {showActions && result && <div className="h-7" aria-hidden />}
    </div>
  )
}

/** 通知卡快速回應(2026-11-25 user):由左至右 讚 / 愛心 / 笑哭 / OK 手勢 */
const QUICK_REACTIONS = [
  { emoji: '👍', label: 'Like' },
  { emoji: '❤️', label: 'Heart' },
  { emoji: '😂', label: 'Laugh' },
  { emoji: '👌', label: 'OK' },
] as const

/** 預覽關閉時第二排的固定文字(2026-11-17 user) */
const PREVIEW_HIDDEN = 'Message preview hidden'

// ════════════════════════════════════════════════════════════════════════════
// 疊放區(2026-11-17 user:右下角,距右 16、距底 120;由下〔舊〕往上〔新〕疊)
// ════════════════════════════════════════════════════════════════════════════
const AUTO_HIDE_MS = 10000
/** 同時顯示張數:預設 3(toast.spec.md 同規則);設定 Display › Show this many notifications on screen at once 可選 3–5(2026-11-12 user) */
export const DEFAULT_MAX_VISIBLE = 3

export function useBannerStack() {
  const [items, setItems] = useState<BannerData[]>([])
  // 滑鼠停留 / 回覆中的卡(2026-11-17 user):新訊息進來不擠掉、同來源只即時更新內文,不換位置
  const pinned = useRef(new Set<string>())
  const seq = useRef(0)
  const setPinned = useCallback((id: string, v: boolean) => {
    if (v) pinned.current.add(id)
    else pinned.current.delete(id)
  }, [])
  /** 超過張數上限 → 從最舊的開始收起,但跳過停留中的卡(停留中的卡卡在原位,直到送出 / 關閉 / 移開才繼續計時) */
  const trim = (list: BannerData[], max: number) => {
    const out = [...list]
    for (let i = out.length - 1; i >= 0 && out.length > max; i--) {
      if (!pinned.current.has(out[i].id)) out.splice(i, 1)
    }
    return out
  }
  /** group = 設定「Group banners from the same chat」:開 → 同 threadKey 收合成一張並累計則數;關 → 每則各一張 */
  const push = (b: BannerData, group = true, max = DEFAULT_MAX_VISIBLE) =>
    setItems((list) => {
      const fresh = { ...b, instanceKey: `${b.id}#${++seq.current}` }
      const prev = group && b.threadKey ? list.find((x) => x.threadKey === b.threadKey) : undefined
      if (!prev) return trim([fresh, ...list], max)
      const count = (prev.count ?? 1) + 1
      // 同一聊天的新訊息一律原地取代,不移到最上面(2026-11-18 user)。id / instanceKey 不變 → 回覆草稿保留,回覆仍送到同一個聊天;
      // 計時:沒停留 → 重新算 10 秒;停留中 → 不重算,移開後接著剩下的時間(TimedBanner)
      return list.map((x) => (x === prev ? { ...b, id: prev.id, instanceKey: prev.instanceKey, count } : x))
    })
  const dismiss = (id: string) => {
    pinned.current.delete(id)
    setItems((list) => list.filter((x) => x.id !== id))
  }
  /** 在別處讀過 → 收起同一對話的卡 */
  const dismissThread = (threadKey: string) => setItems((list) => list.filter((x) => x.threadKey !== threadKey))
  return { items, push, dismiss, dismissThread, setPinned }
}

/**
 * 標籤文字光學置中(2026-11-18 user:「APP 看起來偏上」)。不改 DS Tag 的 20px 高與 130% 行高,只把字往下推。
 * 原因:標籤裡沒有下伸部的字(APP / You),行框底部預留的下伸空間是空的 → 字形實測偏上;P、@ 的重量又在上半部,看起來更高。
 * - APP:實測頂 5.3 / 底 5.7。下移 0.5px 只在 2x 以上螢幕套用 —— 1x 會進位成 1px 反而偏下 0.8px,1x 維持原位(1 像素內最接近置中)。
 * - @You / @All:@ 字形頂端比大寫高,實測 1x 頂 3.8 / 底 5.2、2x 頂 3.8 / 底 4.7 → 一律下移 0.5px(1x 進位成 1px 後為 4.8 / 4.2)。
 */
const APP_TAG_NUDGE = '[@media(min-resolution:2dppx)]:[&>span]:translate-y-[0.5px]'
const MENTION_TAG_NUDGE = '[&>span]:translate-y-[0.5px]'

/** 疊放區位置(2026-11-17 user):右下角,距右 16、距底 120 */

/** 視窗右緣、疊放區高度那一帶,底下可捲動容器的直向捲軸寬(overlay 捲軸 = 0) */
function rightEdgeScrollbarWidth(stack: HTMLElement) {
  const y = Math.max(0, window.innerHeight - STACK_BOTTOM - 1)
  for (const node of document.elementsFromPoint(window.innerWidth - 1, y)) {
    if (!(node instanceof HTMLElement) || stack.contains(node)) continue
    const cs = getComputedStyle(node)
    const w = node.offsetWidth - node.clientWidth - parseFloat(cs.borderLeftWidth) - parseFloat(cs.borderRightWidth)
    if (w > 0 && /(auto|scroll)/.test(cs.overflowY) && node.scrollHeight > node.clientHeight) return w
  }
  // 整頁(html)捲動時 fixed 的 right 本來就不含捲軸
  return 0
}
const STACK_BOTTOM = 120

export function BannerStack({
  items,
  onDismiss,
  onOpen,
  onPinnedChange,
  onOpenSettings,
  showPreview,
  size = 'comfy',
}: {
  items: BannerData[]
  onDismiss: (id: string) => void
  onOpen?: (b: BannerData) => void
  /** 卡片停留 / 回覆中狀態 → useBannerStack().setPinned */
  onPinnedChange?: (id: string, pinned: boolean) => void
  /** 卡片第一列的設定鈕 → 打開 Settings › Notifications */
  onOpenSettings?: () => void
  showPreview: boolean
  size?: BannerSize
}) {
  // 視窗放不下時:從最舊(最下面)開始不顯示整張,不露出半張;視窗變大就再出現
  const ref = useRef<HTMLElement>(null)
  const [fitCount, setFitCount] = useState(items.length)
  // 距右 16 不含捲軸(2026-11-17 user):頁面若由內層容器捲動,捲軸畫在視窗裡,fixed 的 right 會把它算進去 → 量出右緣下方那個容器的捲軸寬補上
  const [scrollbarW, setScrollbarW] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => {
      setScrollbarW(rightEdgeScrollbarWidth(el))
      const limit = window.innerHeight - STACK_BOTTOM - 16 // 上方至少留 16
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
      // 由下(舊)往上(新)疊:items 是新→舊,底部對齊 → 最新在最上面、最舊在最下面,停留中的卡不會被新卡推動
      className="pointer-events-none fixed bottom-[120px] z-[60] flex flex-col gap-2"
      style={{ right: 16 + scrollbarW }}
    >
      {items.map((b, i) => (
        <div key={b.instanceKey ?? b.id} className={i >= fitCount ? 'invisible absolute' : undefined} aria-hidden={i >= fitCount || undefined}>
          <TimedBanner
            data={b}
            size={size}
            onDismiss={() => onDismiss(b.id)}
            onOpen={onOpen ? () => { onOpen(b); onDismiss(b.id) } : undefined}
            onPinnedChange={onPinnedChange}
            onOpenSettings={onOpenSettings}
            showPreview={showPreview}
          />
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
  onPinnedChange,
  onOpenSettings,
  showPreview,
}: {
  data: BannerData
  size: BannerSize
  onDismiss: () => void
  onOpen?: () => void
  onPinnedChange?: (id: string, pinned: boolean) => void
  onOpenSettings?: () => void
  showPreview: boolean
}) {
  const [hovered, setHovered] = useState(false)
  const [interacting, setInteracting] = useState(false)
  const remaining = useRef(AUTO_HIDE_MS)
  const startedAt = useRef(0)
  const paused = hovered || interacting
  // 停留 / 回覆中 → 告訴疊放區別擠掉這張、同來源只原地更新(2026-11-17 user)
  useEffect(() => { onPinnedChange?.(data.id, hovered || interacting) }, [hovered, interacting, data.id, onPinnedChange])
  // 同一聊天的新訊息原地取代(count 變了):沒停留時重新算 10 秒;停留中不重算(2026-11-18 user)
  const lastCount = useRef(data.count)
  useEffect(() => {
    if (lastCount.current !== data.count) {
      lastCount.current = data.count
      if (!paused) remaining.current = AUTO_HIDE_MS
    }
    if (paused) return
    startedAt.current = Date.now()
    const t = window.setTimeout(onDismiss, remaining.current)
    return () => {
      window.clearTimeout(t)
      remaining.current -= Date.now() - startedAt.current
    }
  }, [paused, onDismiss, data.count])
  return (
    <div className="pointer-events-auto" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      <NotificationBanner data={data} size={size} onDismiss={onDismiss} onOpen={onOpen} onInteractingChange={setInteracting} onOpenSettings={onOpenSettings} showPreview={showPreview} />
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
  // (Urgent / 緊急訊息:平台目前沒有這個功能,2026-11-20 user 決定先不處理;之後做再加回第一關)
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
    // 暫停中 @Mentions 區塊被強制顯示 Off(設定頁鎖住)→ @提及一律不跳,優先聯絡人也一樣(2026-11-20 user:優先聯絡人 @我 跳不跳取決於 @Mentions 是不是 Off)
    if (section?.key === 'mentions') return { outcome: 'badge', gate: 'Notifications paused · @Mentions off' }
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
