// tWorkspace Settings(2026-11-07):Notifications 分類 + 原 Chats 分類,切換即生效(無 Save / Cancel)。
// 設計依據:Teams 通知機制規格 + Teams 通知決策流程圖(兩張圖的每道關卡對到一個控制項,見 STRUCTURE.md §Settings)。
//
// 關卡 → 控制項:
//   寄件人標緊急           → 無設定(收件人不能拒收,同 Teams)
//   這類通知怎麼設定        → Native apps 子頁:每種通知選 Banner and badge / Badge only / Off
//                            (tWorkspace 沒有活動摘要;被擋下的通知只留未讀徽章 —— 2026-11-07 user 決定)
//   這個聊天被靜音          → 聊天列表的 Mute(既有);被直接 @ 仍通知,寫在 Chats 子頁說明
//   暫停所有通知            → Pause notifications(1 小時 / 2 小時 / 今天 / 直到手動恢復;頭像選單也有捷徑)
//   勿擾 + 優先名單         → Let priority contacts through + Priority contacts 子頁(tWorkspace 尚無勿擾狀態,名單先作用於暫停)
//   會議中靜音              → Mute during meetings and calls
//   第 2 張圖:系統勿擾連動  → Follow Do Not Disturb on this computer
import { useEffect, useId, useState } from 'react'
import {
  AccountMenu,
  Button,
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
  FileText,
  HardDrive,
  ListChecks,
  MessageCircle,
  MessagesSquare,
  Settings,
  type LucideIcon,
} from 'lucide-react'

// ════════════════════════════════════════════════════════════════════════════
// 資料模型
// ════════════════════════════════════════════════════════════════════════════

/** 每種通知怎麼送達(對應 Teams 的 Banner and feed / Only show in feed / Off;沒有摘要 → 徽章)。 */
export type DeliveryMode = 'banner' | 'badge' | 'off'

export type NativeAppKey = 'chats' | 'tasks' | 'docs' | 'drive'

/** 暫停到哪個時間點(epoch ms);'manual' = 直到手動恢復;null = 沒有暫停。 */
export type PauseUntil = number | 'manual' | null

export type NotificationPrefs = {
  pauseUntil: PauseUntil
  allowPriority: boolean
  /** PersonData.id */
  priorityIds: string[]
  muteInMeetings: boolean
  followSystemFocus: boolean
  showPreview: boolean
  /** 同一來源(同一聊天 / 任務 / 檔案)的橫幅收合成一張;關閉 = 每則各一張(2026-11-10 user 新增,預設開) */
  groupBanners: boolean
  playSound: boolean
  delivery: Record<NativeAppKey, Record<string, DeliveryMode>>
}

type EventDef = { key: string; label: string; description: string; defaultMode: DeliveryMode }

/**
 * 每個 native app 的通知種類。預設值對照 Teams:@提及 / 回覆 = 橫幅;按讚與表情 = 只進摘要(這裡 = 只留徽章)。
 * 種類與文案依各 app 實際會發生的事,同 Jira / Notion / Google Drive 的通知分類。
 */
export const NATIVE_APPS: { key: NativeAppKey; label: string; icon: LucideIcon; intro: string; events: EventDef[] }[] = [
  {
    key: 'chats',
    label: 'Chats',
    icon: MessageCircle,
    intro: 'Muted a chat? You still get a banner when someone @mentions you there directly.',
    events: [
      { key: 'mentions', label: '@mentions', description: 'Someone mentions you by name', defaultMode: 'banner' },
      { key: 'messages', label: 'New messages', description: 'One-on-one and group chats', defaultMode: 'banner' },
      { key: 'replies', label: 'Replies', description: 'Replies in threads you started or joined', defaultMode: 'banner' },
      { key: 'reactions', label: 'Reactions', description: 'Someone reacts to your message', defaultMode: 'badge' },
    ],
  },
  {
    key: 'tasks',
    label: 'Tasks',
    icon: ListChecks,
    intro: 'Notifications for tasks you own, are assigned to, or follow.',
    events: [
      { key: 'assigned', label: 'Assigned to you', description: 'A task is assigned or reassigned to you', defaultMode: 'banner' },
      { key: 'mentions', label: '@mentions in comments', description: 'Someone mentions you in a task comment', defaultMode: 'banner' },
      { key: 'due', label: 'Due date reminders', description: 'A task you own is due within 24 hours', defaultMode: 'banner' },
      { key: 'updates', label: 'Status changes', description: 'A task you follow moves to a new status', defaultMode: 'badge' },
    ],
  },
  {
    key: 'docs',
    label: 'Docs',
    icon: FileText,
    intro: 'Notifications for docs you created or were shared with.',
    events: [
      { key: 'mentions', label: '@mentions', description: 'Someone mentions you in a doc or comment', defaultMode: 'banner' },
      { key: 'comments', label: 'Comments on your docs', description: 'New comments and replies on docs you own', defaultMode: 'banner' },
      { key: 'shared', label: 'Shared with you', description: 'Someone gives you access to a doc', defaultMode: 'badge' },
      { key: 'access', label: 'Access requests', description: 'Someone asks to view or edit your doc', defaultMode: 'banner' },
    ],
  },
  {
    key: 'drive',
    label: 'Drive',
    icon: HardDrive,
    intro: 'Notifications for files and folders in your drive.',
    events: [
      { key: 'shared', label: 'Shared with you', description: 'Someone shares a file or folder with you', defaultMode: 'badge' },
      { key: 'comments', label: 'Comments on your files', description: 'New comments on files you own', defaultMode: 'banner' },
      { key: 'access', label: 'Access requests', description: 'Someone asks to open your file or folder', defaultMode: 'banner' },
    ],
  },
]

export function defaultNotificationPrefs(priorityIds: string[] = []): NotificationPrefs {
  const delivery = {} as NotificationPrefs['delivery']
  for (const app of NATIVE_APPS) {
    delivery[app.key] = Object.fromEntries(app.events.map((e) => [e.key, e.defaultMode]))
  }
  return {
    pauseUntil: null,
    allowPriority: true,
    priorityIds,
    muteInMeetings: false,
    // 規格第 10 節第 8 點:預設就尊重系統勿擾(Teams 的 Windows 連動預設關,這裡刻意不同)
    followSystemFocus: true,
    showPreview: true,
    groupBanners: true,
    playSound: true,
    delivery,
  }
}

const DELIVERY_OPTIONS = [
  { value: 'banner', label: 'Banner and badge' },
  { value: 'badge', label: 'Badge only' },
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
    <div className="flex items-center gap-4 border-b border-divider py-3 last:border-b-0">
      {icon && <ItemIcon icon={icon} />}
      {avatar && <ItemAvatar mode="block" src={avatar.src} alt={avatar.alt} />}
      <ItemContent
        className="min-w-0 flex-1"
        labelTruncate={false}
        label={<span id={labelId}>{label}</span>}
        description={description ? <span id={descriptionId}>{description}</span> : undefined}
      />
      <div className="flex shrink-0 items-center gap-2">{control({ labelId, descriptionId: description ? descriptionId : undefined })}</div>
    </div>
  )
}

function SettingSection({ title, children }: { title: string; children: React.ReactNode }) {
  const id = useId()
  return (
    <section aria-labelledby={id} className="flex flex-col gap-[var(--layout-space-tight)]">
      <h3 id={id} className="text-body font-semibold text-foreground">{title}</h3>
      <div className="flex flex-col">{children}</div>
    </section>
  )
}

function SwitchRow({
  label,
  description,
  checked,
  onCheckedChange,
}: {
  label: string
  description?: string
  checked: boolean
  onCheckedChange: (v: boolean) => void
}) {
  return (
    <SettingRow
      label={label}
      description={description}
      control={({ labelId, descriptionId }) => (
        <Switch checked={checked} onCheckedChange={onCheckedChange} aria-labelledby={labelId} aria-describedby={descriptionId} />
      )}
    />
  )
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
                <SwitchRow
                  label="Show message previews for chats"
                  description="Display the latest message below each chat name"
                  checked={showChatPreview}
                  onCheckedChange={onShowChatPreviewChange}
                />
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
        <SwitchRow
          label="Let priority contacts through"
          description="Banners from people on your priority list still show while notifications are paused."
          checked={prefs.allowPriority}
          onCheckedChange={(v) => onChange({ ...prefs, allowPriority: v })}
        />
        <SettingRow
          label="Priority contacts"
          description={prioritySummary}
          control={({ labelId }) => (
            <Button variant="secondary" size="sm" aria-describedby={labelId} onClick={() => onNavigate('notifications/priority')}>Edit</Button>
          )}
        />
        <SwitchRow
          label="Mute during meetings and calls"
          description="Only the meeting chat and urgent messages show banners while you're in a meeting or call."
          checked={prefs.muteInMeetings}
          onCheckedChange={(v) => onChange({ ...prefs, muteInMeetings: v })}
        />
        <SwitchRow
          label="Follow Do Not Disturb on this computer"
          description="Hide banners while Focus (macOS) or Do Not Disturb (Windows) is on."
          checked={prefs.followSystemFocus}
          onCheckedChange={(v) => onChange({ ...prefs, followSystemFocus: v })}
        />
      </SettingSection>

      <SettingSection title="Display">
        <SwitchRow
          label="Show message preview"
          description="Show the message text in banners. Turn off to show only who sent it."
          checked={prefs.showPreview}
          onCheckedChange={(v) => onChange({ ...prefs, showPreview: v })}
        />
        <SwitchRow
          label="Group notifications"
          description="Combine banners from the same chat, task, or file into one. Turn off to show each one separately."
          checked={prefs.groupBanners}
          onCheckedChange={(v) => onChange({ ...prefs, groupBanners: v })}
        />
        <SwitchRow
          label="Play sound"
          description="Play a sound when a banner appears."
          checked={prefs.playSound}
          onCheckedChange={(v) => onChange({ ...prefs, playSound: v })}
        />
      </SettingSection>

      <SettingSection title="Native apps">
        {NATIVE_APPS.map((a) => {
          const modes = Object.values(prefs.delivery[a.key])
          const banners = modes.filter((m) => m === 'banner').length
          const off = modes.filter((m) => m === 'off').length
          const summary = `${banners} with banners${off ? ` · ${off} off` : ''}`
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

function AppDeliveryPage({
  app,
  prefs,
  onChange,
}: {
  app: (typeof NATIVE_APPS)[number]
  prefs: NotificationPrefs
  onChange: (p: NotificationPrefs) => void
}) {
  return (
    <div className="flex flex-col gap-[var(--layout-space-tight)]">
      <p className="text-body text-fg-secondary">{app.intro}</p>
      <div className="flex flex-col">
        {app.events.map((e) => (
          <SettingRow
            key={e.key}
            label={e.label}
            description={e.description}
            control={({ labelId }) => (
              <Select
                className="w-44"
                size="sm"
                aria-label={`${e.label} notifications`}
                aria-describedby={labelId}
                options={DELIVERY_OPTIONS}
                value={prefs.delivery[app.key][e.key]}
                onChange={(v) =>
                  onChange({
                    ...prefs,
                    delivery: { ...prefs.delivery, [app.key]: { ...prefs.delivery[app.key], [e.key]: v as DeliveryMode } },
                  })
                }
              />
            )}
          />
        ))}
      </div>
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
