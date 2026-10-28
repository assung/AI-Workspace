// DrivePage — tWorkspace 的 Drive 分頁(2026-10-28 keyscreen,user:「左側側邊欄標題為 Drive,下方區分為 My drive 跟 Channel drives
// (會跟 chat channel 連動),首頁為 My drive。右側內容頁包含麵包屑路徑及列表呈現檔案」)。
//
// 版面與 Tasks / tAgent 頁同一套:DS AppShell(primary-sidebar)+ DS Sidebar(offcanvas、淺灰底)+ Main 頁首 DS ChromeHeader。
// - 左側:My drive(預設)+ Channel drives(可收合群組,= Chat 的群組頻道,由 App 傳入,順序同 Chat 列表)。
//   對照 Microsoft Teams:每個頻道自帶一個檔案區(頻道裡貼的檔案就在那);OneDrive / Google Drive 左側「我的雲端硬碟」+「共用雲端硬碟」。
// - 頁首:SidebarTrigger + h1(目前資料夾名稱)+(頻道時)「Open chat」回到該頻道 +「New」(New folder / Upload files)。
// - 麵包屑:DS Breadcrumb,放在列表上方;末位 = 頁首 h1 同字(breadcrumb.spec.md「Title-breadcrumb-end 同步」),
//   只有一層(在 My drive 或頻道根目錄)時不顯示(同 spec「單一層級禁用」)。根層帶 icon(spec:首項 icon 作視覺錨點)。
// - 列表:DS DataTable。Name = ItemIcon + ItemLabel(item-anatomy;DataTable cell icon canonical 16px + gap-2);
//   資料夾名稱 = DS LinkInput 站內連結(點了進資料夾,與 tAgent Projects 表格同一個 navigate-valued cell 做法)。
//   Owner = DS person 欄;Last modified = YYYY/MM/DD hh:mm AM/PM;File size,資料夾為 DS 空值佔位「-」。資料夾排在前面(Drive / OneDrive 同)。
// - 尚未做(keyscreen 範圍外):開檔預覽、上傳 / 新資料夾、列操作(下載 / 分享 / 改名)、排序切換。
import { useState } from 'react'
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
  ItemIcon,
  ItemLabel,
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
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { CHROME_SIDEBAR_BG } from './chrome'
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

const KIND_ICON: Record<Kind, LucideIcon> = {
  folder: Folder,
  doc: FileText,
  pdf: FileText,
  sheet: FileSpreadsheet,
  slides: Presentation,
  image: FileImage,
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
}) {
  const [route, setRoute] = useState<DriveRoute>(initialRoute)

  const channelId = route.root.startsWith('channel:') ? route.root.slice('channel:'.length) : null
  const channel = channelId ? channels.find((c) => c.id === channelId) : undefined
  const rootLabel = channel ? channel.title : ROOT_LABEL_MY
  const rootNodes = channelId ? CHANNEL_DRIVES[channelId] ?? [] : MY_DRIVE

  // 沿 path 走到目前資料夾;路徑上每一層都記下來給麵包屑
  const trail: DriveNode[] = []
  let nodes = rootNodes
  for (const id of route.path) {
    const folder = nodes.find((n) => n.id === id && n.kind === 'folder')
    if (!folder) break
    trail.push(folder)
    nodes = folder.children ?? []
  }
  const title = trail.length ? trail[trail.length - 1].name : rootLabel
  const rows = [...nodes].sort((a, b) => Number(b.kind === 'folder') - Number(a.kind === 'folder'))

  const sidebar = (
    // 與 Tasks / tAgent 頁側欄同一組設定(收合 offcanvas、寬度、淺灰底)
    <Sidebar collapsible="offcanvas" contentType="drive-nav" widthRange={menuWidth} className={CHROME_SIDEBAR_BG}>
      <SidebarHeader>
        <h2 className="flex-1 truncate text-body-lg font-medium">Drive</h2>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton id="my" startIcon={HardDrive} tooltip={ROOT_LABEL_MY}>{ROOT_LABEL_MY}</SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup collapsible value="channel-drives">
          <SidebarGroupLabel>Channel drives</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {channels.map((c) => (
                <SidebarMenuItem key={c.id}>
                  <SidebarMenuButton id={`channel:${c.id}`} tooltip={c.title}>{c.title}</SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  )

  const header = (
    <ChromeHeader className="bg-surface">
      <SidebarTrigger aria-label="Toggle drive sidebar" />
      <h1 className="flex-1 truncate text-body-lg font-medium">{title}</h1>
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

  const crumbs = [
    { label: rootLabel, href: routeHref({ root: route.root, path: [] }), startIcon: channel ? MessagesSquare : HardDrive },
    ...trail.map((f, i) => (i === trail.length - 1
      ? { label: f.name }
      : { label: f.name, href: routeHref({ root: route.root, path: route.path.slice(0, i + 1) }) })),
  ]

  type Row = DriveNode
  const nameCell = (n: Row) => (
    <span className="flex min-w-0 flex-1 items-center gap-2">
      <ItemIcon icon={KIND_ICON[n.kind]} className="text-fg-secondary" />
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
    <div
      className="flex h-full min-h-0 flex-col gap-[var(--layout-space-tight)] px-[var(--layout-space-loose)] py-[var(--layout-space-tight)]"
      onClickCapture={(e) => {
        const href = (e.target as Element).closest?.('a[href]')?.getAttribute('href')
        const next = href ? parseHref(href) : null
        if (!next) return
        e.preventDefault()
        e.stopPropagation()
        setRoute(next)
      }}
    >
      {trail.length > 0 && (
        <Breadcrumb>
          <BreadcrumbList size="sm" items={crumbs} />
        </Breadcrumb>
      )}
      <div className="min-h-0 flex-1">
        <DataTable
          columns={columns}
          data={rows}
          height="100%"
          getRowId={(n: Row) => n.id}
          aria-label={`Files in ${title}`}
          emptyState={<Empty icon={FolderOpen} description={emptyCopy} />}
        />
      </div>
    </div>
  )

  return (
    <SidebarProvider
      activeId={route.root}
      onActiveChange={(id) => setRoute({ root: id as DriveRoot, path: [] })}
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
    </SidebarProvider>
  )
}
