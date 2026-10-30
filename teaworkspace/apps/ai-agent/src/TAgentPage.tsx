// IT Service Desk 整頁 —— 獨立產品,整個 app 就是這一頁(2026-10-30 user:AI agent 拆成純 AI agent 產品,拿掉 NavRail)。
// 從 apps/chat/src/TAgentPage.tsx 複製後調整;tWorkspace 那份不動。
//
// ── 版面 ─────────────────────────────────────────────────────────────────────
// DS AppShell(app-shell.spec.md「版面規則」):Menu = 側欄、Main = 對話 / 清單、Right panel = 知識庫文章預覽;不用 AI agent 區
// (這一頁本身就是代理)。
// 側欄項目 New / Projects / Artifacts / Pinned / Recents(2026-10-30 user:Projects / Artifacts 先保留):
//   對照 Claude 側欄有獨立 Artifacts 區(support.claude.com/en/articles/9487310)與獨立 Starred 區;Gemini 把釘選放在 Recent 最上面
//   (support.google.com/gemini/answer/13666746)。Pinned / Recents 分開 = Claude 做法。
// 右側面板(2026-10-30 user:「開在 right panel,走跟 Claude 右邊面板預覽一樣的方式」):代理內文的文章連結,
//   以及值班者身分的單號連結 → 在同一個事件裡 `requestAside(內容類型)`(使用者主動要求 Right 顯示內容,§4);
//   × 關閉後對話填滿;換對話時收起。內容依身分(personas.tsx)。
//
// ── 消費的 SSOT ──────────────────────────────────────────────────────────────
// - DS AppShell + AppShellAside + Sidebar(SidebarHeader / SidebarGroup collapsible / SidebarGroupLabel / SidebarMenuButton /
//   SidebarMenuAction showOnHover + DropdownMenu —— sidebar.spec.md「Inline actions」)、SidebarTrigger(Pattern A:Main 頁首最左)
// - Main 頁首 = DS ChromeHeader(SidebarTrigger + h1 text-body-lg font-medium)
// - 對話 = AgentPanel 家族的 AgentConversation / AgentMessage / AgentPromptInput(經 TAgent.tsx 的 renderTurns / TAgentPrompt;
//   agent-panel.spec.md「何時不用:全螢幕沉浸式對話產品 → 產品自建頁面」—— 頁面是本 app 組的,零件全用 DS 的)
// - 新對話首頁 = DS Empty(AgentLogo attract 48,spec「附:空狀態」)+ 建議 = DS Chip variant="assist"
// - 改名 / 刪除 = DS Dialog(height="hug"、maxWidth 440)+ Field + useFormValidation(agent-panel.spec.md「附:歷史浮層」同款)
// - Projects / Artifacts = DS DataTable + LinkInput view(站內路徑 `/conversations/<id>` 才渲染成連結;頁面攔截改成切換對話)

import { useEffect, useState, type ReactNode } from 'react'
import {
  AppShell,
  AppShellAside,
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
  useAppShell,
  useFormValidation,
} from '@qijenchen/design-system'
import { SquarePen, FolderKanban, Shapes, MoreHorizontal, Pin, PinOff, Pencil, Trash2 } from 'lucide-react'
import {
  TAGENT_LABEL,
  TAgentOpenArticleProvider,
  TAgentOpenTicketProvider,
  TAgentPrompt,
  renderTurns,
  type TAgentConversation,
  type TAgentEngine,
} from './TAgent'
import { ARTICLES, ArticlePreview } from './articles'
import { getTicket, TicketPreview } from './tickets'
import type { Persona } from './personas'
import { CHROME_SIDEBAR_BG, CHROME_SIDEBAR_FILL_X } from './chrome'

/** 整頁的位置:新對話首頁 / 某一則對話 / Projects / Artifacts。也是側欄 SidebarProvider 的 activeId(單選高亮)。 */
export type TAgentRoute = 'new' | 'projects' | 'artifacts' | `conversation:${string}`

export const conversationRoute = (id: string): TAgentRoute => `conversation:${id}`

/** 版面寬度:沿用 tWorkspace(apps/chat App.tsx SHELL_MAIN_MIN_WIDTH / SHELL_MENU_WIDTH) */
const MAIN_MIN_WIDTH = 600
const MENU_WIDTH = { min: 240, initial: 320, max: 480 }
/** Right panel(文章 / 單子)寬度:沿用 tWorkspace Right panel 既有的一組(apps/chat App.tsx SHELL_THREAD_WIDTH 320 / 480 / 720) */
const PANEL_WIDTH = { min: 320, initial: 480, max: 720 }

/** 對話欄寬上限(訊息與輸入盒同一欄、置中);沿用 tWorkspace 880(TAgentPage COLUMN_MAX_WIDTH) */
const COLUMN_MAX_WIDTH = 880

type Panel = { conversationId: string; kind: 'article' | 'ticket'; id: string }

/** 新對話首頁的問候(沿用 tWorkspace:帶名字、依當地時間分早 / 午 / 晚) */
function greeting(name: string, now = new Date()) {
  const h = now.getHours()
  const part = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
  return `${part}, ${name}`
}

/**
 * 對話區:提供文章 / 單號連結的動作。要在 AppShell 子樹內才拿得到 `requestAside`(app-shell.spec.md「Hook export」),
 * 所以包在 Main 裡,不放在頁面最外層。
 */
function PanelScope({ onOpen, tickets, children }: { onOpen: (kind: Panel['kind'], id: string) => void; tickets: boolean; children: ReactNode }) {
  const { requestAside } = useAppShell()
  // 使用者主動要求 Right 顯示內容 → 同一個事件裡呼叫(§4:放不下時連帶規則由 AppShell 處理)
  const open = (kind: Panel['kind'], id: string) => {
    onOpen(kind, id)
    requestAside(kind)
  }
  return (
    <TAgentOpenArticleProvider openArticle={(id) => open('article', id)}>
      <TAgentOpenTicketProvider openTicket={tickets ? (id) => open('ticket', id) : null}>{children}</TAgentOpenTicketProvider>
    </TAgentOpenArticleProvider>
  )
}

export function TAgentPage({
  engine,
  route,
  onRouteChange,
  persona,
}: {
  engine: TAgentEngine
  route: TAgentRoute
  onRouteChange: (route: TAgentRoute) => void
  persona: Persona
}) {
  const [draft, setDraft] = useState('')
  const [renameTarget, setRenameTarget] = useState<TAgentConversation | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<TAgentConversation | null>(null)
  /** 右側面板開著的內容,記在哪一則對話開的(換對話時收起;回到那則也不自動重開 —— 已關閉的面板不自動重開,§2) */
  const [panel, setPanel] = useState<Panel | null>(null)

  const activeConversation = route.startsWith('conversation:')
    ? engine.conversations.find((c) => `conversation:${c.id}` === route)
    : undefined
  // 開著的對話被刪掉 → 回新對話首頁
  const effectiveRoute: TAgentRoute = route.startsWith('conversation:') && !activeConversation ? 'new' : route

  // 換對話 / 離開對話 → 收起右側面板
  useEffect(() => {
    setPanel((prev) => (prev && prev.conversationId !== activeConversation?.id ? null : prev))
  }, [activeConversation?.id])
  const openArticle = panel?.kind === 'article' ? ARTICLES[panel.id] : undefined
  // 單子跟著劇本進度變(狀態、負責人、活動紀錄)
  const openTicket = panel?.kind === 'ticket' ? getTicket(panel.id, engine.scriptPos) : undefined

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
        <SidebarMenuButton id={conversationRoute(c.id)} tooltip={c.title}>
          {c.title}
        </SidebarMenuButton>
        {/* 未讀紅點(2026-10-30 user:沿用現有 dot 樣式):Badge dot + 同色;滑過 / 焦點在列上時讓位給 ⋯ */}
        {engine.unreadIds.has(c.id) && (
          <SidebarMenuBadge
            dot
            variant="critical"
            aria-label="New reply"
            className="!bg-[#EC540F] group-hover/menu-item:invisible group-focus-within/menu-item:invisible"
          />
        )}
        {rowMenu(c)}
      </SidebarMenuItem>
    ))

  const pinned = engine.listed.filter((c) => c.pinned)
  const recents = engine.listed.filter((c) => !c.pinned)

  const sidebar = (
    <Sidebar collapsible="offcanvas" contentType="agent-nav" widthRange={MENU_WIDTH} className={`${CHROME_SIDEBAR_BG} ${CHROME_SIDEBAR_FILL_X}`}>
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
      <SidebarTrigger aria-label={`Toggle ${TAGENT_LABEL} sidebar`} />
      <h1 className="flex-1 truncate text-body-lg font-medium">{headerTitle}</h1>
      {activeConversation && (
        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              {/* 切換鈕:圖示固定 Pin,狀態由 pressed(aria-pressed + 選中底)表達 —— button.tsx 檔頭範例同款 */}
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

  let main: ReactNode
  if (effectiveRoute === 'projects') main = <ProjectsView engine={engine} projects={persona.projects} onOpenConversation={openConversation} />
  else if (effectiveRoute === 'artifacts') main = <ArtifactsView engine={engine} artifacts={persona.artifacts} onOpenConversation={openConversation} />
  else if (activeConversation)
    main = (
      <div className="flex h-full min-h-0 flex-col">
        <PanelScope tickets={persona.ticketPanel} onOpen={(kind, id) => setPanel({ conversationId: activeConversation.id, kind, id })}>
          {/* className 落在 log 本體:同一欄置中;捲軸仍在整個 Main 右緣 */}
          <AgentConversation className="mx-auto w-full" style={{ maxWidth: COLUMN_MAX_WIDTH }}>
            {renderTurns(activeConversation)}
          </AgentConversation>
        </PanelScope>
        {/* AgentPromptInput 自帶 m-loose mt-0(與 AgentConversation 的 p-loose 同一條內緣)→ 外層不再加 padding */}
        <div className="mx-auto w-full" style={{ maxWidth: COLUMN_MAX_WIDTH }}>
          <TAgentPrompt key={activeConversation.id} engine={engine} draft={draft} onDraftChange={setDraft} onSend={send} />
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
            title={greeting(persona.userName)}
            description={persona.homeDescription}
          />
          {/* 輸入盒自帶下緣 m-loose → 與建議之間不再加 gap */}
          <div>
            <TAgentPrompt engine={engine} draft={draft} onDraftChange={setDraft} onSend={send} />
            {/* 建議 chip 相互間距 4 = AgentMessage 附件 Chip assist 同值(agent-panel.spec.md「chip 相互垂直/水平間距 4」) */}
            <div className="flex flex-wrap justify-center gap-1">
              {persona.suggestions.map((s) => (
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
        mainMinWidth={MAIN_MIN_WIDTH}
        className="h-full"
        sidebar={sidebar}
        header={header}
        asideOpen={!!(openArticle || openTicket)}
        onAsideOpenChange={(open) => { if (!open) setPanel(null) }}
        aside={
          // FILL_X:Right panel 內層 ScrollArea 同側欄的撐寬問題(chrome.ts CHROME_SIDEBAR_FILL_X 說明),長指令行改在區塊內橫捲
          openArticle ? (
            <AppShellAside title={openArticle.title} contentType="article" widthRange={PANEL_WIDTH} className={CHROME_SIDEBAR_FILL_X}>
              <ArticlePreview article={openArticle} />
            </AppShellAside>
          ) : openTicket ? (
            <AppShellAside title={`#${openTicket.id}`} contentType="ticket" widthRange={PANEL_WIDTH} className={CHROME_SIDEBAR_FILL_X}>
              <TicketPreview ticket={openTicket} />
            </AppShellAside>
          ) : undefined
        }
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
                // IME 選字的 Enter 不提交(isComposing + keyCode 229,apps/chat STRUCTURE.md「IME 中文輸入法 Enter 防誤送出」)
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
    const m = href?.match(/^\/conversations\/(.+)$/)
    if (!m) return
    e.preventDefault()
    e.stopPropagation()
    onOpenConversation(m[1])
  }
}

const conversationLinkCell = (label: string, conversationId: string | undefined) =>
  conversationId ? <LinkInput mode="view" value={`/conversations/${conversationId}`} label={label} /> : label

function ProjectsView({ engine, projects, onOpenConversation }: { engine: TAgentEngine; projects: Persona['projects']; onOpenConversation: (id: string) => void }) {
  // 對話資料與側欄同一份:數量只算還在的對話;「最近一則」= Recents 排序(最近活動在前)裡最前面那一則
  const rows = projects.map((p) => {
    const alive = engine.listed.filter((c) => p.conversationIds.includes(c.id))
    return { ...p, conversations: alive.length, latestId: alive[0]?.id }
  })
  type Row = (typeof rows)[number]
  const columns = [
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

function ArtifactsView({ engine, artifacts, onOpenConversation }: { engine: TAgentEngine; artifacts: Persona['artifacts']; onOpenConversation: (id: string) => void }) {
  // 來源對話已被刪除的成果物不列
  const rows = artifacts.flatMap((a) => {
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
