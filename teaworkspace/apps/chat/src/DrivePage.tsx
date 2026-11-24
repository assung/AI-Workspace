// DrivePage — tWorkspace 的 Drive 分頁(2026-10-28 keyscreen → 同日 user 確認後加入 prototype,user:「左側側邊欄標題為 Drive,下方區分為 My drive 跟 Channel drives
// (會跟 chat channel 連動),首頁為 My drive。右側內容頁包含麵包屑路徑及列表呈現檔案」)。
//
// 版面與 Tasks / tAgent 頁同一套:DS AppShell(primary-sidebar)+ DS Sidebar(offcanvas、淺灰底)+ Main 頁首 DS ChromeHeader。
// - 左側:My drive(預設)/ Pinned(釘選的頻道檔案區或資料夾)/ Channel drives(可收合;= 有檔案的 Chat 群組頻道,順序同 Chat 列表)。
//   對照 Microsoft Teams:每個頻道自帶一個檔案區;Google Drive「Starred」、Slack 釘選區 = 常用位置置頂。
//   釘選 / 取消釘選:列上「⋯」選單(tAgent 側欄同款);釘選後從 Channel drives 移到 Pinned(tAgent Pinned / Recents 同規則)。
//   2026-10-28 user:「只列出有檔案的頻道,另外需要有 pin 的區塊;demo 的 drive 數量預設不要放太多」。
// - 頁首:SidebarTrigger + 位置 +(頻道時)「Open chat」回到該頻道 +「New」(New folder / Upload files)。
//   位置:根目錄 = h1 標題;進到資料夾 = DS Breadcrumb 直接放在頁首(app-shell.spec.md「Breadcrumb 預設位置」:
//   primary-sidebar → Header 內,對齊 Linear local header;2026-10-28 user「header 呈現麵包屑,更精簡」)。
//   麵包屑只有一層時不顯示(breadcrumb.spec.md「單一層級禁用」),所以根目錄維持標題。根層帶 icon(spec:首項 icon 作視覺錨點)。
// - 列表:DS DataTable。Name = 檔案類型彩色圖示 + ItemLabel(2026-10-28 user「彩圖,類似 Google Drive」:
//   DS ItemAvatar `shape="square"` + 分類色(檔案 `solid`)—— 資料夾 neutral 淺灰、文件 blue、試算表 green、簡報 amber、PDF / 圖片 red,
//   Google Drive 檔案圖示的配色;尺寸由 item-anatomy 依列高自動決定);
//   資料夾名稱 = DS LinkInput 站內連結(點了進資料夾,與 tAgent Projects 表格同一個 navigate-valued cell 做法)。
//   Owner = DS person 欄;Last modified = YYYY/MM/DD hh:mm AM/PM;File size,資料夾為 DS 空值佔位「-」。資料夾排在前面(Drive / OneDrive 同)。
// - 尚未做(keyscreen 範圍外):開檔預覽、上傳 / 新資料夾、列操作(下載 / 分享 / 改名)、排序切換。
import { useState, type ReactNode } from 'react'
import type { TAgentRoomRef } from './TAgent'
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarTrigger,
  AppShell,
  ChromeHeader,
  DataTable,
  Button,
  Empty,
  LinkInput,
  ItemAvatar,
  ItemLabel,
  SidebarMenuAction,
  Breadcrumb,
  BreadcrumbList,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@qijenchen/design-system'
import {
  HardDrive,
  MessagesSquare,
  MessageCircle,
  Folder,
  FolderOpen,
  FolderPlus,
  FileText,
  FileSpreadsheet,
  FileImage,
  Presentation,
  Plus,
  Upload,
  MoreHorizontal,
  Pin,
  PinOff,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { CHROME_SIDEBAR_BG, CHROME_SIDEBAR_FILL_X } from './chrome'
import type { TaskPerson } from './TasksPage'

/** 'my' = My drive;`channel:<roomId>` = 該聊天頻道的檔案區 */
export type DriveRoot = 'my' | `channel:${string}`
export type DriveRoute = { root: DriveRoot; path: string[] }

type Kind = 'folder' | 'doc' | 'pdf' | 'sheet' | 'slides' | 'image'
type DriveNode = {
  id: string
  name: string
  kind: Kind
  /** 成員 key(App 的 PEOPLE / ME) */
  owner: string
  /** YYYY/MM/DD hh:mm AM/PM */
  modified: string
  size?: string
  children?: DriveNode[]
}

// 檔案類型 → 圖示 + 分類色(Google Drive 配色:資料夾灰、Docs 藍、Sheets 綠、Slides 黃、PDF / 圖片紅)
// 資料夾用 neutral 非 solid(淺灰底 + 深色圖示):solid neutral 是 neutral-9 近黑,比彩色檔案圖示還重;Google Drive 的資料夾也是低調的灰
const KIND_ICON: Record<Kind, { icon: LucideIcon; color: 'neutral' | 'blue' | 'green' | 'amber' | 'red'; solid: boolean }> = {
  folder: { icon: Folder, color: 'neutral', solid: false },
  doc: { icon: FileText, color: 'blue', solid: true },
  pdf: { icon: FileText, color: 'red', solid: true },
  sheet: { icon: FileSpreadsheet, color: 'green', solid: true },
  slides: { icon: Presentation, color: 'amber', solid: true },
  image: { icon: FileImage, color: 'red', solid: true },
}

// 內容延續 Chat / Tasks 示範資料(東頂 #3、週五品茶、零售買家、品茶室升級)
const MY_DRIVE: DriveNode[] = [
  {
    id: 'q4-tasting', name: 'Q4 Tasting Program', kind: 'folder', owner: 'me', modified: '2026/10/27 05:40 PM',
    children: [
      {
        id: 'tasting-photos', name: 'Tasting photos', kind: 'folder', owner: 'me', modified: '2026/10/27 08:50 AM',
        children: [
          { id: 'f-aroma', name: 'Aroma station by the window.jpg', kind: 'image', owner: 'yating', modified: '2026/10/27 08:50 AM', size: '1.9 MB' },
          { id: 'f-room3', name: 'Tasting room No.3.jpg', kind: 'image', owner: 'yating', modified: '2026/10/24 04:18 PM', size: '2.4 MB' },
        ],
      },
      { id: 'f-scoring', name: 'Friday tasting scoring sheet.xlsx', kind: 'sheet', owner: 'me', modified: '2026/10/27 05:40 PM', size: '48 KB' },
      { id: 'f-invite', name: 'Buyer invite — Friday tasting.docx', kind: 'doc', owner: 'me', modified: '2026/10/27 11:02 AM', size: '32 KB' },
      { id: 'f-blind', name: 'Blind comparison plan — Alishan vs Dong Ding.docx', kind: 'doc', owner: 'me', modified: '2026/10/26 03:15 PM', size: '26 KB' },
    ],
  },
  {
    id: 'lugu', name: 'Lugu Co-op Sourcing', kind: 'folder', owner: 'me', modified: '2026/10/26 09:21 AM',
    children: [
      {
        id: 'contracts', name: 'Contracts', kind: 'folder', owner: 'me', modified: '2026/09/30 10:00 AM',
        children: [
          { id: 'f-agreement', name: 'Lugu Co-op supply agreement 2026.pdf', kind: 'pdf', owner: 'me', modified: '2026/09/30 10:00 AM', size: '420 KB' },
        ],
      },
      { id: 'f-lab', name: 'Dong Ding batch #3 lab report.pdf', kind: 'pdf', owner: 'shinichi', modified: '2026/10/26 09:21 AM', size: '1.1 MB' },
      { id: 'f-moisture', name: 'Spring harvest moisture readings.xlsx', kind: 'sheet', owner: 'shinichi', modified: '2026/10/26 09:21 AM', size: '64 KB' },
    ],
  },
  {
    id: 'buyers', name: 'Retail Buyer Outreach', kind: 'folder', owner: 'me', modified: '2026/10/22 08:47 AM',
    children: [
      { id: 'f-buyerlist', name: 'Q3 retail buyer list.xlsx', kind: 'sheet', owner: 'me', modified: '2026/10/22 08:47 AM', size: '86 KB' },
      { id: 'f-onepager', name: 'Premium line one-pager.pptx', kind: 'slides', owner: 'guanyu', modified: '2026/10/21 06:30 PM', size: '5.6 MB' },
    ],
  },
  { id: 'f-roast', name: 'Dong Ding #3 roast notes.docx', kind: 'doc', owner: 'me', modified: '2026/10/19 02:20 PM', size: '18 KB' },
  { id: 'f-catalogue', name: 'Q4 tea catalogue draft.pdf', kind: 'pdf', owner: 'me', modified: '2026/10/15 10:42 AM', size: '3.2 MB' },
]

// 頻道檔案區:頻道裡貼過的檔案(key = Chat room id)。沒有資料的頻道顯示空狀態。
const CHANNEL_DRIVES: Record<string, DriveNode[]> = {
  'tea-team': [
    {
      id: 'reports', name: 'Tasting reports', kind: 'folder', owner: 'guanyu', modified: '2026/10/27 08:40 AM',
      children: [
        { id: 'c-report43', name: 'Tasting report — week 43.pdf', kind: 'pdf', owner: 'guanyu', modified: '2026/10/27 08:40 AM', size: '780 KB' },
        { id: 'c-report42', name: 'Tasting report — week 42.pdf', kind: 'pdf', owner: 'guanyu', modified: '2026/10/20 09:05 AM', size: '742 KB' },
      ],
    },
    { id: 'c-aroma', name: 'Aroma station by the window.jpg', kind: 'image', owner: 'yating', modified: '2026/10/27 08:50 AM', size: '1.9 MB' },
    { id: 'c-firmware', name: 'Water temperature controller — firmware notes.pdf', kind: 'pdf', owner: 'kenji', modified: '2026/10/27 08:52 AM', size: '310 KB' },
    { id: 'c-template', name: 'Scoring sheet template.xlsx', kind: 'sheet', owner: 'guanyu', modified: '2026/10/14 02:10 PM', size: '40 KB' },
  ],
  'product-team': [
    { id: 'c-roadmap', name: 'Q4 roadmap.pptx', kind: 'slides', owner: 'guanyu', modified: '2026/10/23 05:12 PM', size: '7.4 MB' },
    { id: 'c-release', name: 'Release notes — 2.8.docx', kind: 'doc', owner: 'yui', modified: '2026/10/22 11:05 AM', size: '22 KB' },
  ],
  'semi-sales': [
    { id: 'c-wafer', name: 'Weekly wafer starts by product.xlsx', kind: 'sheet', owner: 'g-chen', modified: '2026/10/27 02:22 PM', size: '120 KB' },
  ],
  engineering: [
    { id: 'c-staging', name: 'Staging deploy checklist.docx', kind: 'doc', owner: 'kenji', modified: '2026/10/17 11:03 AM', size: '28 KB' },
    { id: 'c-depmap', name: 'Service dependency map.png', kind: 'image', owner: 'kenji', modified: '2026/10/16 04:40 PM', size: '860 KB' },
  ],
}

const ROOT_LABEL_MY = 'My drive'

/** 站內路徑 `/drive/<root>/<folderId>/…`:麵包屑與資料夾連結共用,由頁面攔截成切換位置(SPA link interception,TAgentPage 同款) */
const routeHref = (r: DriveRoute) => `/drive/${encodeURIComponent(r.root)}${r.path.map((id) => `/${encodeURIComponent(id)}`).join('')}`
function parseHref(href: string): DriveRoute | null {
  const m = href.match(/^\/drive\/([^/]+)((?:\/[^/]+)*)$/)
  if (!m) return null
  return { root: decodeURIComponent(m[1]) as DriveRoot, path: m[2].split('/').filter(Boolean).map(decodeURIComponent) }
}

export function DrivePage({
  mainMinWidth,
  menuWidth,
  portalContainer,
  channels,
  resolvePerson,
  onOpenChannel,
  initialRoute = { root: 'my', path: [] },
  renderAgent,
}: {
  mainMinWidth: number
  menuWidth: { min: number; initial: number; max: number }
  portalContainer: HTMLElement | null
  /** Chat 的群組頻道(id + 名稱),順序同 Chat 列表 */
  channels: { id: string; title: string }[]
  resolvePerson: (key: string) => TaskPerson
  /** 頻道檔案區的「Open chat」:切到 Chat 分頁並開該頻道 */
  onOpenChannel: (roomId: string) => void
  initialRoute?: DriveRoute
  /**
   * 右側 AI agent 區(側邊面板 + 入口鈕,2026-10-29 user「task / docs / drive 的內容頁都要有 FAB」)。
   * 參數 = 這一頁目前的位置,面板以 context chip 帶入;App 提供(對話資料與開合狀態在 App)。
   */
  renderAgent?: (context: TAgentRoomRef) => ReactNode
}) {
  const [route, setRoute] = useState<DriveRoute>(initialRoute)
  // 釘選:存位置的站內路徑(頻道檔案區根目錄或資料夾)。示範預設釘兩個:Tea Tasting 頻道、My drive 的 Q4 Tasting Program
  const [pinned, setPinned] = useState<string[]>([
    routeHref({ root: 'channel:tea-team', path: [] }),
    routeHref({ root: 'my', path: ['q4-tasting'] }),
  ])

  const channelId = route.root.startsWith('channel:') ? route.root.slice('channel:'.length) : null
  const channel = channelId ? channels.find((c) => c.id === channelId) : undefined
  const rootLabel = channel ? channel.title : ROOT_LABEL_MY
  const rootNodes = channelId ? CHANNEL_DRIVES[channelId] ?? [] : MY_DRIVE

  // 沿 path 走到目前資料夾;路徑上每一層都記下來給麵包屑
  const trail = walk(rootNodes, route.path)
  const nodes = trail.length ? trail[trail.length - 1].children ?? [] : rootNodes
  const title = trail.length ? trail[trail.length - 1].name : rootLabel
  const rows = [...nodes].sort((a, b) => Number(b.kind === 'folder') - Number(a.kind === 'folder'))

  // 側欄列 = 位置的站內路徑;釘選列的名稱 = 頻道名或資料夾名
  const labelOf = (href: string) => {
    const r = parseHref(href)
    if (!r) return href
    const cid = r.root.startsWith('channel:') ? r.root.slice('channel:'.length) : null
    const base = cid ? channels.find((c) => c.id === cid)?.title ?? cid : ROOT_LABEL_MY
    const t = walk(cid ? CHANNEL_DRIVES[cid] ?? [] : MY_DRIVE, r.path)
    return t.length ? t[t.length - 1].name : base
  }
  const myHref = routeHref({ root: 'my', path: [] })
  // Channel drives:只列有檔案的頻道(2026-10-28 user),已釘選的移到 Pinned
  const channelRows = channels
    .filter((c) => (CHANNEL_DRIVES[c.id]?.length ?? 0) > 0)
    .map((c) => ({ href: routeHref({ root: `channel:${c.id}`, path: [] }), title: c.title }))
    .filter((c) => !pinned.includes(c.href))
  const currentHref = routeHref(route)
  const sidebarIds = [myHref, ...pinned, ...channelRows.map((c) => c.href)]
  // 高亮:目前位置剛好是側欄某一列就亮那列;在資料夾深處則亮它所屬的根(My drive / 該頻道)
  const activeId = sidebarIds.includes(currentHref) ? currentHref : routeHref({ root: route.root, path: [] })

  const togglePin = (href: string) =>
    setPinned((list) => (list.includes(href) ? list.filter((h) => h !== href) : [...list, href]))
  const rowMenu = (href: string, label: string, isPinned: boolean) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuAction icon={MoreHorizontal} showOnHover aria-label={`More actions for ${label}`} />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="right" align="start" sideOffset={8}>
        <DropdownMenuItem startIcon={isPinned ? PinOff : Pin} onSelect={() => togglePin(href)}>
          {isPinned ? 'Unpin' : 'Pin'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )

  const sidebar = (
    // 與 Tasks / tAgent 頁側欄同一組設定(收合 offcanvas、寬度、淺灰底)
    <Sidebar collapsible="offcanvas" contentType="drive-nav" widthRange={menuWidth} className={`${CHROME_SIDEBAR_BG} ${CHROME_SIDEBAR_FILL_X}`}>
      <SidebarHeader>
        <h2 className="flex-1 truncate text-body-lg font-medium">Drive</h2>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton id={myHref} startIcon={HardDrive} tooltip={ROOT_LABEL_MY}>{ROOT_LABEL_MY}</SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {pinned.length > 0 && (
          <SidebarGroup collapsible value="pinned">
            <SidebarGroupLabel>Pinned</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {pinned.map((href) => {
                  const label = labelOf(href)
                  return (
                    <SidebarMenuItem key={href}>
                      <SidebarMenuButton id={href} tooltip={label}>{label}</SidebarMenuButton>
                      {rowMenu(href, label, true)}
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
        <SidebarGroup collapsible value="channel-drives">
          <SidebarGroupLabel>Channel drives</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {channelRows.map((c) => (
                <SidebarMenuItem key={c.href}>
                  <SidebarMenuButton id={c.href} tooltip={c.title}>{c.title}</SidebarMenuButton>
                  {rowMenu(c.href, c.title, false)}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  )

  // 麵包屑與資料夾連結都是站內路徑 → 攔截成切換位置
  const interceptDriveLink = (e: React.MouseEvent) => {
    const href = (e.target as Element).closest?.('a[href]')?.getAttribute('href')
    const next = href ? parseHref(href) : null
    if (!next) return
    e.preventDefault()
    e.stopPropagation()
    setRoute(next)
  }

  const crumbs = [
    { label: rootLabel, href: routeHref({ root: route.root, path: [] }), startIcon: channel ? MessagesSquare : HardDrive },
    ...trail.map((f, i) => (i === trail.length - 1
      ? { label: f.name }
      : { label: f.name, href: routeHref({ root: route.root, path: route.path.slice(0, i + 1) }) })),
  ]

  const header = (
    <ChromeHeader className="bg-surface" onClickCapture={interceptDriveLink}>
      <SidebarTrigger aria-label="Toggle drive sidebar" />
      {trail.length > 0 ? (
        // 資料夾內:麵包屑直接當頁首的位置(app-shell.spec.md「Breadcrumb 預設位置」primary-sidebar → Header 內);
        // 頁面標題仍以 h1 提供給螢幕閱讀器(與麵包屑末位同字)
        <div className="min-w-0 flex-1">
          <h1 className="sr-only">{title}</h1>
          <Breadcrumb>
            <BreadcrumbList items={crumbs} />
          </Breadcrumb>
        </div>
      ) : (
        <h1 className="flex-1 truncate text-body-lg font-medium">{title}</h1>
      )}
      <div className="flex items-center gap-2">
        {channel && (
          <Button variant="tertiary" size="sm" startIcon={MessageCircle} onClick={() => onOpenChannel(channel.id)}>Open chat</Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="primary" size="sm" startIcon={Plus}>New</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={8}>
            <DropdownMenuItem startIcon={FolderPlus}>New folder</DropdownMenuItem>
            <DropdownMenuItem startIcon={Upload}>Upload files</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </ChromeHeader>
  )

  type Row = DriveNode
  const nameCell = (n: Row) => (
    <span className="flex min-w-0 flex-1 items-center gap-2">
      <ItemAvatar icon={KIND_ICON[n.kind].icon} color={KIND_ICON[n.kind].color} shape="square" solid={KIND_ICON[n.kind].solid} aria-hidden />
      {n.kind === 'folder'
        ? <LinkInput mode="view" value={routeHref({ root: route.root, path: [...route.path, n.id] })} label={n.name} />
        : <ItemLabel>{n.name}</ItemLabel>}
    </span>
  )
  // 欄寬:DS `meta.width` = 最小保留寬,多出來的空間依比例分配(data-table.spec.md「Column 寬度 API」)
  const columns = [
    { accessorKey: 'name', header: 'Name', cell: ({ row }: { row: { original: Row } }) => nameCell(row.original), meta: { width: 360 } },
    { id: 'owner', accessorFn: (n: Row) => resolvePerson(n.owner), header: 'Owner', meta: { type: 'person' as const, width: 200 } },
    { accessorKey: 'modified', header: 'Last modified', meta: { type: 'string' as const, width: 184 } },
    { id: 'size', accessorFn: (n: Row) => n.size ?? '-', header: 'File size', meta: { type: 'string' as const, width: 104 } },
  ]

  const emptyCopy = channel
    ? 'No files yet. Files shared in this channel’s chat show up here.'
    : 'This folder is empty.'

  const main = (
    <div className="flex h-full min-h-0 flex-col px-[var(--layout-space-loose)] py-[var(--layout-space-tight)]" onClickCapture={interceptDriveLink}>
      <DataTable
        columns={columns}
        data={rows}
        height="100%"
        getRowId={(n: Row) => n.id}
        aria-label={`Files in ${title}`}
        emptyState={<Empty icon={FolderOpen} description={emptyCopy} />}
      />
    </div>
  )

  return (
    <SidebarProvider
      activeId={activeId}
      onActiveChange={(id) => { const next = parseHref(id); if (next) setRoute(next) }}
      style={{ minHeight: 'auto', height: '100%' }}
    >
      <AppShell
        layout="primary-sidebar"
        mainMinWidth={mainMinWidth}
        className="h-full"
        portalContainer={portalContainer}
        sidebar={sidebar}
        header={header}
        agent={renderAgent?.({ id: `drive:${routeHref(route)}`, title })}
      >
        {main}
      </AppShell>
    </SidebarProvider>
  )
}

/** 沿資料夾 id 路徑往下走,回傳路上每一層資料夾(遇到不存在的 id 就停) */
function walk(root: DriveNode[], path: string[]) {
  const trail: DriveNode[] = []
  let nodes = root
  for (const id of path) {
    const folder = nodes.find((n) => n.id === id && n.kind === 'folder')
    if (!folder) break
    trail.push(folder)
    nodes = folder.children ?? []
  }
  return trail
}
