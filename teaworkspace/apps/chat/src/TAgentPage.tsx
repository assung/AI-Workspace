// tAgent 整頁 — 點 NavRail 的 tAgent 分頁進入的專屬頁面(2026-10-23 user:「我期待會有一個純屬於 tAgent 的頁面,而非是開出側邊欄」)。
// 側邊面板(TAgentDock)只在其他分頁透過入口鈕叫出;這一頁本身就是代理,不放入口鈕。
//
// ── 版面 ─────────────────────────────────────────────────────────────────────
// 與 Chat 分頁同一套 DS AppShell(app-shell.spec.md「版面規則」):Menu = tAgent 側欄、Main = 對話 / 清單;不用 Right panel 與 AI agent 區。
// 側欄項目(user 指定 New / Projects / Artifacts / Pinned / Recents):
//   對照 Claude 側欄有獨立 Artifacts 區(support.claude.com/en/articles/9487310)與獨立 Starred 區、列上 ⋯ 選單加星
//   (guideflow「how to star a chat from the sidebar in claudeai」);Gemini 則把釘選放在 Recent 最上面
//   (support.google.com/gemini/answer/13666746)。user 的 Pinned / Recents 分開 = Claude 做法。
//
// ── 消費的 SSOT ──────────────────────────────────────────────────────────────
// - DS AppShell + Sidebar(SidebarHeader / SidebarGroup collapsible / SidebarGroupLabel / SidebarMenuButton / SidebarMenuAction
//   showOnHover + DropdownMenu —— sidebar.spec.md「Inline actions」;列鈕自動讓出 pr-8)、SidebarTrigger(Pattern A:Main 頁首最左)
// - Main 頁首 = DS ChromeHeader(DS app-shell `_demo-helpers.tsx` PageHeader 同款:SidebarTrigger + h1 text-body-lg font-medium)
// - 對話 = AgentPanel 家族的 AgentConversation / AgentMessage / AgentPromptInput / AgentDecisionCard(經 TAgent.tsx 的 renderTurns / TAgentPrompt;
//   agent-panel.spec.md「何時不用:全螢幕沉浸式對話產品 → 產品自建頁面」—— 頁面是本 app 組的,零件全用 DS 的)
// - 新對話首頁 = DS Empty(AgentLogo attract 48,spec「附:空狀態」)+ 建議 = DS Chip variant="assist"(chip.spec.md:按鈕語意、可獨立使用)
// - 改名 / 刪除 = DS Dialog(height="hug"、maxWidth 440)+ Field + useFormValidation —— 逐項照 AgentPanelHeader 歷史浮層的改名 / 刪除
//   (agent-panel.spec.md「附:歷史浮層」),文案英文
// - Projects / Artifacts = DS DataTable(2026-10-23 user:先維持表格,等 DS 出 Card)(data-table.spec.md「簡單展示也用 DataTable」)+ LinkInput view(站內路徑 `/tagent/<id>` 才渲染成連結;
//   頁面攔截改成切換對話,DS agent-panel.stories TaskListView 同款)

import { useEffect, useState } from 'react'
import {
  AppShell,
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarTrigger,
  ChromeHeader,
  AgentConversation,
  AgentLogo,
  Empty,
  Chip,
  Button,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
  Field,
  FieldLabel,
  FieldError,
  Input,
  DataTable,
  LinkInput,
  useFormValidation,
} from '@qijenchen/design-system'
import { SquarePen, FolderKanban, Shapes, MoreHorizontal, Pin, PinOff, Pencil, Trash2 } from 'lucide-react'
import {
  TAGENT_LABEL,
  TAgentNavigateProvider,
  TAgentOpenDocProvider,
  type TAgentOpenDoc,
  TAgentPrompt,
  renderTurns,
  type TAgentConversation,
  type TAgentEngine,
} from './TAgent'
import { CHROME_SIDEBAR_BG, CHROME_SIDEBAR_FILL_X } from './chrome'

/** 整頁的位置:新對話首頁 / 某一則對話 / Projects / Artifacts。也是側欄 SidebarProvider 的 activeId(單選高亮)。 */
export type TAgentRoute = 'new' | 'projects' | 'artifacts' | `conversation:${string}`

const conversationRoute = (id: string): TAgentRoute => `conversation:${id}`

/**
 * 對話欄寬上限(訊息與輸入盒同一欄、置中)。沿用本 app 既有值 880 = 主 InputBox 在 fullWidth OFF 時的上限(STRUCTURE.md 常數速查)。
 * 待 user 決定(2026-10-23 提出):Claude / ChatGPT 對話欄約 768;880 的代理長文一行約 120 字,偏長。
 */
const COLUMN_MAX_WIDTH = 880

/** 新對話首頁的建議(Chip assist;點了填入輸入盒,不直接送出 —— 使用者可先改) */
const SUGGESTIONS = [
  'What is waiting on me today?',
  'Summarize my unread chats',
  'Draft the invite for Friday’s tasting',
]

/** `conversationIds` = 屬於這個專案的對話;Name 連到其中最近一則(2026-10-23 user:Projects 開最近一則對話) */
type Project = { id: string; name: string; description: string; conversationIds: string[]; updated: string }
type Artifact = { id: string; name: string; type: string; conversationId: string; updated: string }

// 日期格式 YYYY/MM/DD hh:mm AM/PM(本專案慣例)
const PROJECTS: Project[] = [
  { id: 'p-tasting', name: 'Q4 Tasting Program', description: 'Friday tastings, scoring and buyer invites', conversationIds: ['c-dongding', 'c-buyers'], updated: '2026/10/22 09:31 AM' },
  { id: 'p-lugu', name: 'Lugu Co-op Sourcing', description: 'Spring Dong Ding batches, lab reports and reservations', conversationIds: ['c-roast', 'c-dongding'], updated: '2026/10/21 04:12 PM' },
  { id: 'p-buyers', name: 'Retail Buyer Outreach', description: 'Q3–Q4 buyer list and follow-ups', conversationIds: ['c-buyers'], updated: '2026/10/18 11:05 AM' },
]
/** 新對話首頁的問候(2026-10-23 user 選「帶名字的問候」):依當地時間分早 / 午 / 晚 */
function greeting(name: string, now = new Date()) {
  const h = now.getHours()
  const part = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
  return `${part}, ${name}`
}

const ARTIFACTS: Artifact[] = [
  { id: 'a-scoring', name: 'Friday tasting scoring sheet', type: 'Sheet', conversationId: 'c-dongding', updated: '2026/10/22 09:28 AM' },
  { id: 'a-buyers', name: 'Q3 retail buyer list', type: 'Sheet', conversationId: 'c-buyers', updated: '2026/10/22 08:47 AM' },
  { id: 'a-roast', name: 'Dong Ding #3 roast notes', type: 'Doc', conversationId: 'c-roast', updated: '2026/10/19 02:20 PM' },
  { id: 'a-staging', name: 'Staging deploy checklist', type: 'Doc', conversationId: 'c-staging', updated: '2026/10/17 11:03 AM' },
]

/**
 * 側欄對話列的未讀點(2026-11-23 Aaron:藍、8×8、左右各 6px)。
 * DS SidebarMenuBadge 絕對定位在列右側、SidebarMenuButton 不替它留位置 → 長標題會跑到點底下。
 * 產品端暫時做法:點往內移 6px;有未讀時按鈕右側多留 6 + 8 + 6 = 20px。待 DS 提供(STRUCTURE.md §4.5)。
 */
const UNREAD_DOT_CLASS = '!h-2 !w-2 right-[calc(var(--layout-space-loose)+6px)]'
const UNREAD_ROW_PAD = '!pr-[calc(var(--layout-space-loose)+20px)]'

export function TAgentPage({
  engine,
  route,
  onRouteChange,
  onOpenInChat,
  mainMinWidth,
  menuWidth,
  portalContainer,
  userName,
  onOpenDoc,
}: {
  engine: TAgentEngine
  route: TAgentRoute
  onRouteChange: (route: TAgentRoute) => void
  /** 代理內文的來源連結 / 聊天室附件:切到 Chat 分頁、開該聊天室並 flash 訊息(messageId 空 = 只開聊天室) */
  onOpenInChat: (roomId: string, messageId: string) => void
  mainMinWidth: number
  menuWidth: { min: number; initial: number; max: number }
  portalContainer: HTMLElement | null
  /** 首頁問候用的名字 */
  userName: string
  /** 代理內文的 Docs 連結(DocLink):切到 Docs 分頁並開該頁 */
  onOpenDoc: TAgentOpenDoc
}) {
  const [draft, setDraft] = useState('')
  const [renameTarget, setRenameTarget] = useState<TAgentConversation | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<TAgentConversation | null>(null)

  const activeConversation = route.startsWith('conversation:')
    ? engine.conversations.find((c) => `conversation:${c.id}` === route)
    : undefined
  // 開著的對話被刪掉 → 回新對話首頁
  const effectiveRoute: TAgentRoute = route.startsWith('conversation:') && !activeConversation ? 'new' : route

  // 劇本台詞預先填入輸入盒(2026-10-29 user:「第一句話先預設填入輸入框內」):劇本還沒開始 → 新對話首頁;
  // 開始後 → 劇本那一則對話,輪到使用者時填下一句。只在台詞或位置改變時填,不蓋掉使用者正在打的字。
  const prefillHere = engine.scriptPrefill !== null
    && (engine.scriptConvId === null ? effectiveRoute === 'new' : activeConversation?.id === engine.scriptConvId)
  useEffect(() => {
    if (prefillHere && engine.scriptPrefill) setDraft(engine.scriptPrefill)
  }, [prefillHere, engine.scriptPrefill, effectiveRoute])

  const send = (text: string, attachments: Parameters<TAgentEngine['send']>[2]) => {
    const id = engine.send(activeConversation?.id ?? null, text, attachments)
    setDraft('')
    if (!activeConversation) onRouteChange(conversationRoute(id))
  }

  const rowMenu = (c: TAgentConversation) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuAction icon={MoreHorizontal} showOnHover aria-label={`More actions for ${c.title}`} />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="right" align="start" sideOffset={8}>
        <DropdownMenuItem startIcon={c.pinned ? PinOff : Pin} onSelect={() => engine.togglePin(c.id)}>
          {c.pinned ? 'Unpin' : 'Pin'}
        </DropdownMenuItem>
        <DropdownMenuItem startIcon={Pencil} onSelect={() => setRenameTarget(c)}>Rename</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem startIcon={Trash2} className="text-error" onSelect={() => setDeleteTarget(c)}>Delete</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )

  const conversationRows = (list: TAgentConversation[]) =>
    list.map((c) => (
      <SidebarMenuItem key={c.id}>
        <SidebarMenuButton
          id={conversationRoute(c.id)}
          tooltip={c.title}
          className={engine.unreadIds.has(c.id) ? UNREAD_ROW_PAD : undefined}
        >
          {c.title}
        </SidebarMenuButton>
        {/* 未讀點:同 Chat 列表(藍、8×8、左右 6px);與 hover 才出現的 ⋯ 同位置 → 滑過 / 焦點在列上時讓位給 ⋯ */}
        {engine.unreadIds.has(c.id) && (
          <SidebarMenuBadge
            dot
            variant="high"
            aria-label="New reply"
            className={`${UNREAD_DOT_CLASS} group-hover/menu-item:invisible group-focus-within/menu-item:invisible`}
          />
        )}
        {rowMenu(c)}
      </SidebarMenuItem>
    ))

  const pinned = engine.listed.filter((c) => c.pinned)
  const recents = engine.listed.filter((c) => !c.pinned)

  const sidebar = (
    // 收合 = offcanvas、寬度設定與 Chat 分頁的 ChatList 同一組(兩個分頁左側面板一致;2026-10-22 user 選「無細列」)
    <Sidebar collapsible="offcanvas" contentType="tagent-nav" widthRange={menuWidth} className={`${CHROME_SIDEBAR_BG} ${CHROME_SIDEBAR_FILL_X}`}>
      <SidebarHeader>
        <h2 className="flex-1 truncate text-body-lg font-medium">{TAGENT_LABEL}</h2>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton id="new" startIcon={SquarePen} tooltip="New conversation">New conversation</SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton id="projects" startIcon={FolderKanban} tooltip="Projects">Projects</SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton id="artifacts" startIcon={Shapes} tooltip="Artifacts">Artifacts</SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {pinned.length > 0 && (
          <SidebarGroup collapsible value="pinned">
            <SidebarGroupLabel>Pinned</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>{conversationRows(pinned)}</SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
        <SidebarGroup collapsible value="recents">
          <SidebarGroupLabel>Recents</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>{conversationRows(recents)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  )

  const headerTitle =
    effectiveRoute === 'projects' ? 'Projects'
      : effectiveRoute === 'artifacts' ? 'Artifacts'
        : activeConversation ? activeConversation.title
          : 'New conversation'

  const header = (
    <ChromeHeader className="bg-surface">
      <SidebarTrigger aria-label="Toggle AI agent sidebar" />
      <h1 className="flex-1 truncate text-body-lg font-medium">{headerTitle}</h1>
      {activeConversation && (
        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              {/* 切換鈕:圖示固定 Pin,狀態由 pressed(aria-pressed + 選中底)表達 —— button.tsx 檔頭範例 `pressed={isPinned} startIcon={Pin}` 同款 */}
              <Button
                variant="text"
                size="sm"
                iconOnly
                startIcon={Pin}
                pressed={!!activeConversation.pinned}
                aria-label="Pin conversation"
                title=""
                onClick={() => engine.togglePin(activeConversation.id)}
              />
            </TooltipTrigger>
            <TooltipContent>{activeConversation.pinned ? 'Unpin' : 'Pin'}</TooltipContent>
          </Tooltip>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="text" size="sm" iconOnly startIcon={MoreHorizontal} aria-label="More conversation actions" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={8}>
              <DropdownMenuItem startIcon={Pencil} onSelect={() => setRenameTarget(activeConversation)}>Rename</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem startIcon={Trash2} className="text-error" onSelect={() => setDeleteTarget(activeConversation)}>Delete</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </ChromeHeader>
  )

  const openConversation = (id: string) => onRouteChange(conversationRoute(id))

  let main: React.ReactNode
  if (effectiveRoute === 'projects') main = <ProjectsView engine={engine} onOpenConversation={openConversation} />
  else if (effectiveRoute === 'artifacts') main = <ArtifactsView engine={engine} onOpenConversation={openConversation} />
  else if (activeConversation)
    main = (
      <div className="flex h-full min-h-0 flex-col">
        <TAgentNavigateProvider navigate={onOpenInChat}>
          <TAgentOpenDocProvider openDoc={(space, page) => onOpenDoc(space, page, activeConversation.id)}>
            {/* className 落在 log 本體:同一欄置中;捲軸仍在整個 Main 右緣 */}
            <AgentConversation className="mx-auto w-full" style={{ maxWidth: COLUMN_MAX_WIDTH }}>
              {renderTurns(activeConversation, (roomId) => onOpenInChat(roomId, ''))}
            </AgentConversation>
          </TAgentOpenDocProvider>
        </TAgentNavigateProvider>
        {/* AgentPromptInput 自帶 m-loose mt-0(與 AgentConversation 的 p-loose 同一條內緣)→ 外層不再加 padding,輸入盒與訊息左右對齊 */}
        <div className="mx-auto w-full" style={{ maxWidth: COLUMN_MAX_WIDTH }}>
          <TAgentPrompt engine={engine} conversation={activeConversation} draft={draft} onDraftChange={setDraft} onSend={send} />
        </div>
      </div>
    )
  else
    main = (
      // 新對話首頁:問候 + 輸入盒 + 建議,整組在 Main 垂直置中(Claude / ChatGPT 新對話同型)
      <div className="flex h-full min-h-0 flex-col items-center justify-center overflow-y-auto px-[var(--layout-space-loose)]">
        <div className="flex w-full flex-col gap-[var(--layout-space-loose)]" style={{ maxWidth: COLUMN_MAX_WIDTH }}>
          <Empty
            icon={<AgentLogo state="attract" size={48} label={TAGENT_LABEL} />}
            title={greeting(userName)}
            description="What can I help with? Ask across your chats, tasks, and docs, or use + to narrow it down to a file or a chat."
          />
          {/* 輸入盒自帶下緣 m-loose → 與建議之間不再加 gap(上下都是 loose 16) */}
          <div>
            <TAgentPrompt engine={engine} draft={draft} onDraftChange={setDraft} onSend={send} />
            {/* 建議 chip 相互間距 4 = AgentMessage 附件 Chip assist 同值(agent-panel.spec.md「chip 相互垂直/水平間距 4」) */}
            <div className="flex flex-wrap justify-center gap-1">
              {SUGGESTIONS.map((s) => (
                <Chip key={s} variant="assist" onClick={() => setDraft(s)}>{s}</Chip>
              ))}
            </div>
          </div>
        </div>
      </div>
    )

  return (
    <SidebarProvider
      activeId={effectiveRoute}
      onActiveChange={(id) => {
        onRouteChange(id as TAgentRoute)
        if (id === 'new') setDraft('')
      }}
      style={{ minHeight: 'auto', height: '100%' }}
    >
      <AppShell
        layout="primary-sidebar"
        mainMinWidth={mainMinWidth}
        className="h-full"
        portalContainer={portalContainer}
        sidebar={sidebar}
        header={header}
      >
        {main}
      </AppShell>
      {renameTarget && (
        <RenameConversationDialog
          conversation={renameTarget}
          onClose={() => setRenameTarget(null)}
          onConfirm={(title) => {
            engine.rename(renameTarget.id, title)
            setRenameTarget(null)
          }}
        />
      )}
      {deleteTarget && (
        <Dialog open onOpenChange={(next) => { if (!next) setDeleteTarget(null) }}>
          {/* 確認框:height="hug"、寬 440(AgentPanelHeader 刪除確認同款) */}
          <DialogContent height="hug" maxWidth={440}>
            <DialogHeader>
              <DialogTitle>Delete conversation</DialogTitle>
            </DialogHeader>
            <DialogBody>Delete “{deleteTarget.title}”? This takes effect immediately and can’t be undone.</DialogBody>
            <DialogFooter>
              <Button variant="tertiary" onClick={() => setDeleteTarget(null)}>Cancel</Button>
              <Button
                variant="primary"
                danger
                onClick={() => {
                  engine.remove(deleteTarget.id)
                  if (activeConversation?.id === deleteTarget.id) onRouteChange('new')
                  setDeleteTarget(null)
                }}
              >
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </SidebarProvider>
  )
}

/** 改名:逐項照 DS AgentRenameDialog(useFormValidation 更新類;沒改停用、空白按「Save」才報錯;Enter = 儲存,輸入法選字的 Enter 不算)。 */
function RenameConversationDialog({
  conversation,
  onClose,
  onConfirm,
}: {
  conversation: TAgentConversation
  onClose: () => void
  onConfirm: (title: string) => void
}) {
  const form = useFormValidation({
    initialValues: { title: conversation.title },
    intent: 'update',
    validate: { title: (v) => (String(v).trim() ? undefined : 'Name can’t be empty') },
    onSubmit: ({ title }) => {
      const trimmed = String(title).trim()
      if (trimmed === conversation.title) { onClose(); return }
      onConfirm(trimmed)
    },
  })
  const titleProps = form.getInputProps('title')
  return (
    <Dialog open onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent height="hug" maxWidth={440}>
        <DialogHeader>
          <DialogTitle>Rename conversation</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <Field required invalid={!!form.errors.title}>
            <FieldLabel>Name</FieldLabel>
            <Input
              {...titleProps}
              error={!!form.errors.title}
              onFocus={(e) => e.currentTarget.select()}
              onKeyDown={(e) => {
                titleProps.onKeyDown(e)
                // IME 選字的 Enter 不提交(本 app 既有判準:isComposing + keyCode 229,STRUCTURE.md「IME 中文輸入法 Enter 防誤送出」)
                if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229) {
                  e.preventDefault()
                  void form.handleSubmit()
                }
              }}
            />
            <FieldError>{form.errors.title}</FieldError>
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="tertiary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={form.submitDisabled} loading={form.isSubmitting} onClick={() => void form.handleSubmit()}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** 內部連結由頁面攔截、改成切換對話(SPA link interception,DS agent-panel.stories TaskListView 同款) */
function interceptConversationLink(onOpenConversation: (id: string) => void) {
  return (e: React.MouseEvent) => {
    const href = (e.target as Element).closest?.('a[href]')?.getAttribute('href')
    const m = href?.match(/^\/tagent\/(.+)$/)
    if (!m) return
    e.preventDefault()
    e.stopPropagation()
    onOpenConversation(m[1])
  }
}

/**
 * 每列的主欄(Name)= 連到對話的站內連結(LinkInput view;站內路徑 `/tagent/<id>` 才渲染成連結 —— DS TaskListView 標題欄同款)。
 * 2026-10-23 user:先維持表格(DS 尚無 Card 元件),Projects 開最近一則對話、Artifacts 開來源對話。
 */
const conversationLinkCell = (label: string, conversationId: string | undefined) =>
  conversationId ? <LinkInput mode="view" value={`/tagent/${conversationId}`} label={label} /> : label

function ProjectsView({ engine, onOpenConversation }: { engine: TAgentEngine; onOpenConversation: (id: string) => void }) {
  // 對話資料與側欄同一份:數量只算還在的對話;「最近一則」= Recents 排序(最近活動在前)裡最前面那一則
  const rows = PROJECTS.map((p) => {
    const alive = engine.listed.filter((c) => p.conversationIds.includes(c.id))
    return { ...p, conversations: alive.length, latestId: alive[0]?.id }
  })
  type Row = (typeof rows)[number]
  const columns = [
    // DS 欄位型別(data-table.spec.md「Cell 單行截斷原則」:固定行高 → 單行 + ellipsis,截斷才出 tooltip)
    { accessorKey: 'name', header: 'Name', cell: ({ row }: { row: { original: Row } }) => conversationLinkCell(row.original.name, row.original.latestId) },
    { accessorKey: 'description', header: 'Description', meta: { type: 'string' as const } },
    { accessorKey: 'conversations', header: 'Conversations', meta: { type: 'number' as const } },
    { accessorKey: 'updated', header: 'Last updated', meta: { type: 'string' as const } },
  ]
  return (
    <div className="flex h-full min-h-0 flex-col px-[var(--layout-space-loose)] py-[var(--layout-space-tight)]" onClickCapture={interceptConversationLink(onOpenConversation)}>
      <DataTable columns={columns} data={rows} height="100%" getRowId={(p: Row) => p.id} aria-label="Projects" />
    </div>
  )
}

function ArtifactsView({ engine, onOpenConversation }: { engine: TAgentEngine; onOpenConversation: (id: string) => void }) {
  // 來源對話已被刪除的成果物不列(示範資料與對話同一份)
  const rows = ARTIFACTS.flatMap((a) => {
    const source = engine.conversations.find((c) => c.id === a.conversationId)
    return source ? [{ ...a, createdIn: source.title }] : []
  })
  type Row = (typeof rows)[number]
  const columns = [
    { accessorKey: 'name', header: 'Name', cell: ({ row }: { row: { original: Row } }) => conversationLinkCell(row.original.name, row.original.conversationId) },
    { accessorKey: 'type', header: 'Type', meta: { type: 'select' as const } },
    { accessorKey: 'createdIn', header: 'Created in', meta: { type: 'string' as const } },
    { accessorKey: 'updated', header: 'Last updated', meta: { type: 'string' as const } },
  ]
  return (
    <div className="flex h-full min-h-0 flex-col px-[var(--layout-space-loose)] py-[var(--layout-space-tight)]" onClickCapture={interceptConversationLink(onOpenConversation)}>
      <DataTable columns={columns} data={rows} height="100%" getRowId={(a: Row) => a.id} aria-label="Artifacts" />
    </div>
  )
}
