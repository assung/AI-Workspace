// tWorkspace Settings(2026-11-07):Notifications 分類 + 原 Chats 分類,切換即生效(無 Save / Cancel)。
// 控制項(2026-11-10 user 決定,完全對標 Teams):選項一律 Checkbox;Switch 只用在功能區塊標題列當總開關。
// 設計依據:Teams 通知機制規格 + Teams 通知決策流程圖(兩張圖的每道關卡對到一個控制項,見 STRUCTURE.md §Settings)。
//
// 關卡 → 控制項:
//   寄件人標緊急           → 平台目前沒有緊急訊息功能,不處理(2026-11-20 user)
//   這類通知怎麼設定        → Native apps › Chats 子頁:每種通知選 Show in banner / Off;功能區塊標題列的 Switch = 總開關
//                            (關閉 → 子項 Select disabled、保留原值,同 Teams;2026-11-10 user 決定)
//                            目前只有 Chats 有通知(2026-11-10 user:功能目前只有 chat)
//   這個聊天被靜音          → 聊天列表的 Mute(既有);被直接 @ 仍通知,寫在 Chats 子頁說明
//   暫停所有通知            → Pause notifications(1 小時 / 2 小時 / 今天 / 直到手動恢復;頭像選單也有捷徑)
//   勿擾 + 優先名單         → Let priority contacts through + Priority contacts 子頁(tWorkspace 尚無勿擾狀態,名單先作用於暫停)
//   會議中靜音              → Display › Show notifications while "In a Call" status(取消勾選 = 會議中靜音)
//   第 2 張圖:系統勿擾連動  → Follow Do Not Disturb on this computer
import { useEffect, useId, useState } from 'react'
import {
  AccountMenu,
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  ItemAvatar,
  ItemContent,
  ItemIcon,
  PeoplePicker,
  RadioGroup,
  RadioGroupItem,
  Select,
  Switch,
  toast,
  type AvatarData,
  type PersonData,
} from '@qijenchen/design-system'
import {
  ArrowLeft,
  Bell,
  BellOff,
  ChevronDown,
  MessageCircle,
  MessagesSquare,
  Settings,
  type LucideIcon,
} from 'lucide-react'

// ════════════════════════════════════════════════════════════════════════════
// 資料模型
// ════════════════════════════════════════════════════════════════════════════

/** 每種通知怎麼送達(2026-11-10 user:Show in banner / Off;聊天的未讀數本來就在,不另設 Badge only)。 */
export type DeliveryMode = 'banner' | 'off'

export type NativeAppKey = 'chats' | 'tasks' | 'docs' | 'drive'

/** 暫停到哪個時間點(epoch ms);'manual' = 直到手動恢復;null = 沒有暫停。 */
export type PauseUntil = number | 'manual' | null

export type NotificationPrefs = {
  pauseUntil: PauseUntil
  allowPriority: boolean
  /** PersonData.id */
  priorityIds: string[]
  /** Display › Show notifications while "In a Call" status;取消勾選 = 會議 / 通話中只放行該場聊天 */
  showDuringCalls: boolean
  followSystemFocus: boolean
  showPreview: boolean
  /** Display › Group banners from the same chat(2026-11-10 user 新增,預設開);關閉 = 每則各一張 */
  groupBanners: boolean
  /** Display › Size:Comfy / Compact(對標 Teams,預設 Comfy;2026-11-11) */
  bannerSize: 'comfy' | 'compact'
  /** Display › Show this many notifications on screen at once:同時最多幾張,3–5,預設 3(2026-11-12 user) */
  maxBanners: 3 | 4 | 5
  delivery: Partial<Record<NativeAppKey, Record<string, DeliveryMode>>>
  /** 功能區塊總開關(key = EventSection.key);關閉 → 該區塊通知全部不送,子項保留原值 */
  sectionEnabled: Record<string, boolean>
}

type EventDef = { key: string; label: string; description?: string; defaultMode: DeliveryMode }
/** 功能區塊:有 key = 標題列帶總開關 Switch */
type EventSection = { key?: string; title: string; events: EventDef[] }

/**
 * 有通知的 native app。目前只有 Chats(2026-11-10 user);Tasks / Docs / Drive 之後再加。
 * @Mentions 區塊照 user 設計稿:Everyone in the chat @mentions / Personal @mentions,預設 Show in banner。
 * Messages 區塊沿用 Teams 聊天分類(新訊息 / 回覆 / 表情回應);表情回應預設 Off(Teams 預設只進摘要)。
 */
export const NATIVE_APPS: { key: NativeAppKey; label: string; icon: LucideIcon; intro: string; sections: EventSection[] }[] = [
  {
    key: 'chats',
    label: 'Chats',
    icon: MessageCircle,
    intro: 'Muted a chat? You still get a banner when someone @mentions you there directly.',
    sections: [
      {
        key: 'mentions',
        title: '@Mentions',
        events: [
          { key: 'mentionsEveryone', label: 'Everyone in the chat @mentions', defaultMode: 'banner' },
          { key: 'mentionsPersonal', label: 'Personal @mentions', defaultMode: 'banner' },
        ],
      },
      {
        title: 'Messages',
        events: [
          { key: 'messages', label: 'New messages', description: 'One-on-one and group chats', defaultMode: 'banner' },
          { key: 'replies', label: 'Replies', description: 'Replies in threads you started or joined', defaultMode: 'banner' },
          { key: 'reactions', label: 'Reactions', description: 'Someone reacts to your message', defaultMode: 'off' },
        ],
      },
    ],
  },
]

export function defaultNotificationPrefs(priorityIds: string[] = []): NotificationPrefs {
  const delivery = {} as NotificationPrefs['delivery']
  for (const app of NATIVE_APPS) {
    delivery[app.key] = Object.fromEntries(app.sections.flatMap((sec) => sec.events).map((e) => [e.key, e.defaultMode]))
  }
  const sectionEnabled = Object.fromEntries(
    NATIVE_APPS.flatMap((app) => app.sections).filter((sec) => sec.key).map((sec) => [sec.key as string, true]),
  )
  return {
    pauseUntil: null,
    allowPriority: true,
    priorityIds,
    showDuringCalls: true,
    // 規格第 10 節第 8 點:預設就尊重系統勿擾(Teams 的 Windows 連動預設關,這裡刻意不同)
    followSystemFocus: true,
    showPreview: true,
    groupBanners: true,
    bannerSize: 'comfy',
    maxBanners: 3,
    delivery,
    sectionEnabled,
  }
}

const MAX_BANNER_OPTIONS = [
  { value: '3', label: '3 (default)' },
  { value: '4', label: '4' },
  { value: '5', label: '5' },
]

const DELIVERY_OPTIONS = [
  { value: 'banner', label: 'Show in banner' },
  { value: 'off', label: 'Off' },
]

/** 暫停時長(2026-11-07 user 選:1 小時 / 2 小時 / 今天 / 直到手動恢復)。 */
const PAUSE_OPTIONS: { key: string; label: string; until: () => PauseUntil }[] = [
  { key: '1h', label: 'For 1 hour', until: () => Date.now() + 60 * 60 * 1000 },
  { key: '2h', label: 'For 2 hours', until: () => Date.now() + 2 * 60 * 60 * 1000 },
  {
    key: 'today',
    label: 'For the rest of today',
    until: () => {
      const d = new Date()
      d.setHours(24, 0, 0, 0)
      return d.getTime()
    },
  },
  { key: 'manual', label: 'Until I turn them back on', until: () => 'manual' },
]

export function isPaused(p: NotificationPrefs, now = Date.now()) {
  return p.pauseUntil === 'manual' || (typeof p.pauseUntil === 'number' && p.pauseUntil > now)
}

function formatTime(ms: number) {
  return new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

/** 「Paused until 9:42 PM」/「Paused until you turn them back on」 */
export function pauseStatusText(until: PauseUntil) {
  if (until === 'manual') return 'Paused until you turn them back on'
  if (typeof until === 'number') {
    const sameDay = new Date(until).toDateString() === new Date().toDateString()
    return `Paused until ${sameDay ? '' : 'tomorrow, '}${formatTime(until)}`
  }
  return ''
}

/** 開始暫停時的 Toast(neutral + Undo:toast.spec.md 的 action 只給復原類後手)。 */
function announcePause(until: PauseUntil, onUndo: () => void) {
  toast({
    title: 'Notifications paused',
    description: pauseStatusText(until).replace('Paused until', 'Until'),
    action: { label: 'Undo', onClick: onUndo },
  })
}

// ════════════════════════════════════════════════════════════════════════════
// 設定列(Family 2 list item:content 左 / control 右,flush rows + 分隔線)
// item-anatomy.spec.md 的 6 家共識:settings row = flush 0 gap + separator;
// DS Field horizontal 的 description 會落在 control 欄,不是 settings list 的「label 下方說明」,故用 ItemContent 組列。
// ════════════════════════════════════════════════════════════════════════════
function SettingRow({
  label,
  description,
  icon,
  avatar,
  control,
}: {
  label: React.ReactNode
  description?: React.ReactNode
  icon?: LucideIcon
  /** 人物列的頭像(ItemAvatar block:頭像是列的主體,對齊 label + description) */
  avatar?: { src?: string; alt: string }
  control: (ids: { labelId: string; descriptionId?: string }) => React.ReactNode
}) {
  const labelId = useId()
  const descriptionId = useId()
  return (
    // 2026-11-10:選項改 Checkbox 後,列與列不再用分隔線(Teams 設定頁同),字級統一 body 14(ItemContent size md = Checkbox md)
    <div className="flex items-center gap-4 py-2">
      {icon && <ItemIcon icon={icon} />}
      {avatar && <ItemAvatar mode="block" src={avatar.src} alt={avatar.alt} />}
      <ItemContent
        className="min-w-0 flex-1"
        size="md"
        labelTruncate={false}
        // ItemContent 在 MenuItem 外不帶字級(由容器決定),這裡明訂 text-body 14 = Checkbox md label(checkbox.tsx「md:label text-body」)
        label={<span id={labelId} className="text-body text-foreground">{label}</span>}
        description={description ? <span id={descriptionId} className="text-body">{description}</span> : undefined}
      />
      <div className="flex shrink-0 items-center gap-2">{control({ labelId, descriptionId: description ? descriptionId : undefined })}</div>
    </div>
  )
}

function SettingSection({
  title,
  enabled,
  onEnabledChange,
  locked,
  note,
  children,
}: {
  title: string
  /** 有傳 = 功能區塊:標題列右側放總開關 Switch(2026-11-10 user:Switch 只用在這裡) */
  enabled?: boolean
  onEnabledChange?: (v: boolean) => void
  /** 總開關被外部條件鎖住(例如暫停通知中),同時顯示原因 */
  locked?: boolean
  note?: string
  children: React.ReactNode
}) {
  const id = useId()
  const noteId = useId()
  return (
    <section aria-labelledby={id} aria-describedby={note ? noteId : undefined} className="flex flex-col gap-[var(--layout-space-tight)]">
      <div className="flex items-center justify-between gap-4">
        <h3 id={id} className="text-body font-semibold text-foreground">{title}</h3>
        {onEnabledChange && <Switch checked={!!enabled} disabled={locked} onCheckedChange={onEnabledChange} aria-labelledby={id} />}
      </div>
      {note && <p id={noteId} className="text-body text-fg-secondary">{note}</p>}
      <div className="flex flex-col">{children}</div>
    </section>
  )
}

/** 勾選項(Teams 設定頁同款:Checkbox 在前、文字在後;切換即生效) */
function CheckboxList({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-3 py-2">{children}</div>
}

// ════════════════════════════════════════════════════════════════════════════
// Pause 控制(設定頁一份、頭像選單一份,共用 PAUSE_OPTIONS)
// ════════════════════════════════════════════════════════════════════════════
function PauseControl({ prefs, onChange }: { prefs: NotificationPrefs; onChange: (p: NotificationPrefs) => void }) {
  if (isPaused(prefs)) {
    return (
      <Button variant="secondary" size="sm" startIcon={Bell} onClick={() => onChange({ ...prefs, pauseUntil: null })}>
        Resume
      </Button>
    )
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" size="sm" endIcon={ChevronDown}>Pause</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {PAUSE_OPTIONS.map((o) => (
          <DropdownMenuItem
            key={o.key}
            onSelect={() => {
              const until = o.until()
              onChange({ ...prefs, pauseUntil: until })
              announcePause(until, () => onChange({ ...prefs, pauseUntil: null }))
            }}
          >
            {o.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * 頭像選單(tWorkspace NavRail 底部;DS AccountMenu = 「自己」的帳號入口)。
 * Teams 的「暫停所有通知」放在個人頭像選單(MC1465768:"from the profile menu"),這裡同位置提供捷徑。
 */
export function WorkspaceAccountMenu({
  user,
  prefs,
  onChange,
  onOpenNotificationSettings,
}: {
  user: { name: string; avatar: Omit<AvatarData, 'hoverCard' | 'alt'> }
  prefs: NotificationPrefs
  onChange: (p: NotificationPrefs) => void
  onOpenNotificationSettings: () => void
}) {
  const paused = isPaused(prefs)
  return (
    <AccountMenu user={user} align="end" triggerAriaLabel="Account and notifications">
      <DropdownMenuGroup>
        {paused ? (
          <DropdownMenuItem startIcon={Bell} description={pauseStatusText(prefs.pauseUntil)} onSelect={() => onChange({ ...prefs, pauseUntil: null })}>
            Resume notifications
          </DropdownMenuItem>
        ) : (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger startIcon={BellOff}>Pause notifications</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {PAUSE_OPTIONS.map((o) => (
                <DropdownMenuItem
                  key={o.key}
                  onSelect={() => {
                    const until = o.until()
                    onChange({ ...prefs, pauseUntil: until })
                    announcePause(until, () => onChange({ ...prefs, pauseUntil: null }))
                  }}
                >
                  {o.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}
        <DropdownMenuItem startIcon={Settings} onSelect={onOpenNotificationSettings}>Notification settings</DropdownMenuItem>
      </DropdownMenuGroup>
    </AccountMenu>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// Settings dialog
// ════════════════════════════════════════════════════════════════════════════
export type SettingsRoute = 'notifications' | `notifications/${NativeAppKey}` | 'notifications/priority' | 'chats'

type Category = { key: 'notifications' | 'chats'; label: string; icon: LucideIcon }
const CATEGORIES: Category[] = [
  { key: 'notifications', label: 'Notifications', icon: Bell },
  { key: 'chats', label: 'Chats', icon: MessagesSquare },
]

export function WorkspaceSettingsModal({
  open,
  onOpenChange,
  initialRoute = 'notifications',
  prefs,
  onPrefsChange,
  people,
  showChatPreview,
  onShowChatPreviewChange,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  initialRoute?: SettingsRoute
  prefs: NotificationPrefs
  onPrefsChange: (p: NotificationPrefs) => void
  /** 可加入優先名單的人(PeoplePicker people) */
  people: (PersonData & { id: string })[]
  showChatPreview: boolean
  onShowChatPreviewChange: (v: boolean) => void
}) {
  const [route, setRoute] = useState<SettingsRoute>(initialRoute)
  useEffect(() => { if (open) setRoute(initialRoute) }, [open, initialRoute])

  const category = route === 'chats' ? 'chats' : 'notifications'
  const app = NATIVE_APPS.find((a) => route === `notifications/${a.key}`)
  const isPriority = route === 'notifications/priority'
  const title = app ? app.label : isPriority ? 'Priority contacts' : category === 'chats' ? 'Chats list' : 'Notifications'
  const back = app || isPriority ? () => setRoute('notifications') : undefined

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* 720 = DS Dialog 寬度 tier 最大檔(dialog.spec.md 400/480/512/560/720);設定類左欄 + 內容需要寬版。高度 fill:子頁切換時外框不跳 */}
      <DialogContent maxWidth={720} height="fill" className="p-0 overflow-hidden">
        <div className="flex h-full min-h-0">
          <nav aria-label="Settings categories" className="flex w-44 shrink-0 flex-col gap-0.5 border-r border-divider bg-surface p-3">
            <p className="px-2 pb-1 pt-0.5 text-caption font-semibold uppercase tracking-wide text-fg-secondary">Settings</p>
            {CATEGORIES.map((c) => {
              const Icon = c.icon
              const active = category === c.key
              return (
                <button
                  key={c.key}
                  type="button"
                  aria-current={active ? 'page' : undefined}
                  onClick={() => setRoute(c.key)}
                  className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-body text-foreground ${active ? 'bg-neutral-selected font-medium' : 'hover:bg-neutral-hover'}`}
                >
                  <Icon size={15} />
                  {c.label}
                </button>
              )
            })}
          </nav>
          <div className="flex min-w-0 min-h-0 flex-1 flex-col">
            <DialogHeader className="border-b border-divider px-6 py-4">
              <div className="flex items-center gap-2">
                {back && (
                  <Button variant="text" size="sm" iconOnly startIcon={ArrowLeft} aria-label="Back to Notifications" onClick={back} />
                )}
                <DialogTitle>{title}</DialogTitle>
              </div>
            </DialogHeader>
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {category === 'chats' ? (
                <CheckboxList>
                  <Checkbox
                    label="Show message previews for chats"
                    description="Display the latest message below each chat name"
                    checked={showChatPreview}
                    onCheckedChange={(v) => onShowChatPreviewChange(v === true)}
                  />
                </CheckboxList>
              ) : app ? (
                <AppDeliveryPage app={app} prefs={prefs} onChange={onPrefsChange} />
              ) : isPriority ? (
                <PriorityContactsPage prefs={prefs} onChange={onPrefsChange} people={people} />
              ) : (
                <NotificationsPage prefs={prefs} onChange={onPrefsChange} people={people} onNavigate={setRoute} />
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function NotificationsPage({
  prefs,
  onChange,
  people,
  onNavigate,
}: {
  prefs: NotificationPrefs
  onChange: (p: NotificationPrefs) => void
  people: (PersonData & { id: string })[]
  onNavigate: (r: SettingsRoute) => void
}) {
  const paused = isPaused(prefs)
  const priorityNames = prefs.priorityIds
    .map((id) => people.find((p) => p.id === id)?.name)
    .filter(Boolean) as string[]
  const prioritySummary =
    priorityNames.length === 0
      ? 'No one yet'
      : priorityNames.length <= 2
        ? priorityNames.join(', ')
        : `${priorityNames.slice(0, 2).join(', ')} and ${priorityNames.length - 2} more`

  return (
    <div className="flex flex-col gap-[var(--layout-space-loose)]">
      <SettingSection title="Focus">
        <SettingRow
          label="Pause notifications"
          description={paused ? pauseStatusText(prefs.pauseUntil) : 'Stop banners and sounds for a while. Unread badges keep counting.'}
          control={() => <PauseControl prefs={prefs} onChange={onChange} />}
        />
        <CheckboxList>
          <Checkbox
            label="Let priority contacts through"
            description="Banners from people on your priority list still show while notifications are paused."
            checked={prefs.allowPriority}
            onCheckedChange={(v) => onChange({ ...prefs, allowPriority: v === true })}
          />
        </CheckboxList>
        <SettingRow
          label="Priority contacts"
          description={prioritySummary}
          control={({ labelId }) => (
            <Button variant="secondary" size="sm" aria-describedby={labelId} onClick={() => onNavigate('notifications/priority')}>Edit</Button>
          )}
        />
        <CheckboxList>
          <Checkbox
            label="Follow Do Not Disturb on this computer"
            description="Hide banners while Focus (macOS) or Do Not Disturb (Windows) is on."
            checked={prefs.followSystemFocus}
            onCheckedChange={(v) => onChange({ ...prefs, followSystemFocus: v === true })}
          />
        </CheckboxList>
      </SettingSection>

      {/* 文案照 user 設計稿(2026-11-10);第 2 項取代原 Focus 區的 Mute during meetings and calls(同一道關卡,方向相反);Sound 之後另立一區 */}
      <SettingSection title="Display">
        <CheckboxList>
          <Checkbox
            label="Show message and content previews in notifications"
            checked={prefs.showPreview}
            onCheckedChange={(v) => onChange({ ...prefs, showPreview: v === true })}
          />
          <Checkbox
            label={'Show notifications while "In a Call" status'}
            checked={prefs.showDuringCalls}
            onCheckedChange={(v) => onChange({ ...prefs, showDuringCalls: v === true })}
          />
          <Checkbox
            label="Group banners from the same chat"
            checked={prefs.groupBanners}
            onCheckedChange={(v) => onChange({ ...prefs, groupBanners: v === true })}
          />
        </CheckboxList>
        <BannerSizeField value={prefs.bannerSize} onChange={(v) => onChange({ ...prefs, bannerSize: v })} />
        <SettingRow
          // 整句當標籤、選單在右(對標 Teams「Dismiss notifications after this amount of time [5 seconds (default)]」,2026-11-12)
          label="Show this many notifications on screen at once"
          control={() => (
            <Select
              className="w-40"
              size="sm"
              aria-label="Show this many notifications on screen at once"
              options={MAX_BANNER_OPTIONS}
              value={String(prefs.maxBanners)}
              onChange={(v) => onChange({ ...prefs, maxBanners: Number(v) as 3 | 4 | 5 })}
            />
          )}
        />
      </SettingSection>

      <SettingSection title="Native apps">
        {NATIVE_APPS.map((a) => {
          // 摘要照「實際生效」的值算:區塊總開關關閉、或暫停中的 @Mentions,都算 Off
          const saved = prefs.delivery[a.key] ?? {}
          const modes = a.sections.flatMap((sec) =>
            sec.events.map((e) =>
              (sec.key && prefs.sectionEnabled[sec.key] === false) || (paused && sec.key === 'mentions') ? 'off' : saved[e.key] ?? e.defaultMode,
            ),
          )
          const banners = modes.filter((m) => m === 'banner').length
          const off = modes.filter((m) => m === 'off').length
          const summary = `${banners} shown in banners${off ? ` · ${off} off` : ''}`
          return (
            <SettingRow
              key={a.key}
              icon={a.icon}
              label={a.label}
              description={summary}
              control={({ labelId }) => (
                <Button variant="secondary" size="sm" aria-describedby={labelId} onClick={() => onNavigate(`notifications/${a.key}`)}>Edit</Button>
              )}
            />
          )
        })}
      </SettingSection>
    </div>
  )
}

/** Display › Size(Teams 文案:Change the size of your message and content previews. Choose Comfy or Compact.) */
function BannerSizeField({ value, onChange }: { value: 'comfy' | 'compact'; onChange: (v: 'comfy' | 'compact') => void }) {
  const id = useId()
  return (
    <div className="flex flex-col gap-2 py-2">
      <span id={id} className="text-body text-foreground">Change the size of your message and content previews.</span>
      <RadioGroup aria-labelledby={id} value={value} onValueChange={(v) => onChange(v as 'comfy' | 'compact')} className="flex flex-col gap-2">
        <RadioGroupItem value="comfy" label="Comfy" description="Shows where it came from, two lines of the message, and actions like Reply." />
        <RadioGroupItem value="compact" label="Compact" description="One line of the message. Reply is still one click away." />
      </RadioGroup>
    </div>
  )
}

function AppDeliveryPage({
  app,
  prefs,
  onChange,
}: {
  app: (typeof NATIVE_APPS)[number]
  prefs: NotificationPrefs
  onChange: (p: NotificationPrefs) => void
}) {
  const modes = prefs.delivery[app.key] ?? {}
  // 暫停通知中(2026-11-20 user,對齊 Teams Mute all notifications):@Mentions 區塊全部顯示 Off 且 disabled;
  // 只改顯示,不改存的值 → 恢復通知後自動切回原本的設定,免得使用者以為「明明沒暫停了還收不到」
  const paused = isPaused(prefs)
  return (
    <div className="flex flex-col gap-[var(--layout-space-loose)]">
      <p className="text-body text-fg-secondary">{app.intro}</p>
      {app.sections.map((sec) => {
        const locked = paused && sec.key === 'mentions'
        const savedEnabled = sec.key ? prefs.sectionEnabled[sec.key] !== false : true
        const enabled = locked ? false : savedEnabled
        return (
          <SettingSection
            key={sec.title}
            title={sec.title}
            enabled={enabled}
            locked={locked}
            note={locked ? 'Off while notifications are paused. Your choices come back when you resume.' : undefined}
            onEnabledChange={sec.key ? (v) => onChange({ ...prefs, sectionEnabled: { ...prefs.sectionEnabled, [sec.key as string]: v } }) : undefined}
          >
            {sec.events.map((e) => (
              <SettingRow
                key={e.key}
                label={e.label}
                description={e.description}
                control={({ labelId }) => (
                  <Select
                    className="w-40"
                    size="sm"
                    aria-label={`${e.label} notifications`}
                    aria-describedby={labelId}
                    // 總開關關閉 → disabled,保留原值(Teams 同);暫停中的 @Mentions 顯示 Off(存的值不動)
                    disabled={!enabled}
                    options={DELIVERY_OPTIONS}
                    value={locked ? 'off' : modes[e.key] ?? e.defaultMode}
                    onChange={(v) =>
                      onChange({ ...prefs, delivery: { ...prefs.delivery, [app.key]: { ...modes, [e.key]: v as DeliveryMode } } })
                    }
                  />
                )}
              />
            ))}
          </SettingSection>
        )
      })}
    </div>
  )
}

function PriorityContactsPage({
  prefs,
  onChange,
  people,
}: {
  prefs: NotificationPrefs
  onChange: (p: NotificationPrefs) => void
  people: (PersonData & { id: string })[]
}) {
  // 對照 Teams「Manage priority access」:上方搜尋加人,下方逐列列出、可移除(名單要看得到名字,不能只剩頭像堆疊)
  const selected = prefs.priorityIds.map((id) => people.find((p) => p.id === id)).filter(Boolean) as (PersonData & { id: string })[]
  const candidates = people.filter((p) => !prefs.priorityIds.includes(p.id))
  return (
    <div className="flex flex-col gap-[var(--layout-space-tight)]">
      <p className="text-body text-fg-secondary">
        {prefs.allowPriority
          ? 'Banners from these people still show while notifications are paused.'
          : 'Turn on “Let priority contacts through” for this list to take effect.'}
      </p>
      <PeoplePicker
        aria-label="Add priority contacts"
        placeholder="Add people"
        searchPlaceholder="Search people"
        people={candidates}
        value={null}
        onChange={(v) => {
          const ids = v.map((x) => (typeof x === 'string' ? x : (x as PersonData & { id: string }).id))
          onChange({ ...prefs, priorityIds: [...prefs.priorityIds, ...ids.filter((id) => !prefs.priorityIds.includes(id))] })
        }}
      />
      <div className="flex flex-col">
        {selected.map((p) => (
          <SettingRow
            key={p.id}
            avatar={{ src: p.avatarUrl, alt: p.name }}
            label={p.name}
            description={p.description}
            control={({ labelId }) => (
              <Button
                variant="text"
                size="sm"
                aria-describedby={labelId}
                onClick={() => onChange({ ...prefs, priorityIds: prefs.priorityIds.filter((id) => id !== p.id) })}
              >
                Remove
              </Button>
            )}
          />
        ))}
      </div>
    </div>
  )
}
