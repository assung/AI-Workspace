// DocsPage — tWorkspace 的 Docs 分頁(2026-10-28 keyscreen,user:「左側欄標題為 Docs,下方為 selector,預設選在 My space(首頁),
// 下方是 Overview(點進去看 space 的概覽資訊),接著是隔線,隔線下方區塊為 Content,呈現 pages(tree view)。右側為頁面頁,
// header 邏輯同 Drive 的麵包屑,下方是文章內容,類似 Confluence」)。
//
// 版面與 Tasks / Drive / tAgent 頁同一套:DS AppShell(primary-sidebar)+ DS Sidebar(offcanvas、淺灰底)+ Main 頁首 DS ChromeHeader。
// - 左側:
//   · 空間選擇器 = DS Select(選項帶 icon + 說明;Confluence 側欄頂的 space 切換、Notion teamspace 同位置)。
//   · Overview = SidebarMenuButton(扁平項目)。
//   · SidebarSeparator。
//   · Content = SidebarGroup + DS TreeView(sidebar.spec.md「內容形態選擇」:深度 > 1 / 使用者自建的頁面樹 → TreeView;
//     Notion 側欄的頁面樹同屬此類)。單選,選中的頁與其上層自動展開。
// - 頁首(同 Drive):Overview = h1 標題;頁面 = DS Breadcrumb(md)直接放頁首(app-shell.spec.md「Breadcrumb 預設位置」primary-sidebar → Header 內),
//   根層 = 空間名(連回 Overview,Confluence 同)。
// - 文章(Confluence 頁面):置中欄寬 880(沿用 tAgent 對話欄,2026-10-23 user 定);標題 text-h3(breadcrumb.spec.md:md 麵包屑配 h3 標題)
//   + 作者 / 最後更新;內文區塊 = 標題 / 段落 / 清單 / DS DataTable / DS Alert(Confluence 的 info panel)。
// - Overview(Confluence space overview):空間名稱與說明、DS DescriptionList(Owner / Pages / Last updated)、最近更新的頁(DS DataTable,頁名連到該頁)。
// - 尚未做(keyscreen 範圍外):編輯、新增頁、頁面樹拖曳排序、留言、分享。
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
  SidebarSeparator,
  SidebarTrigger,
  AppShell,
  ChromeHeader,
  Select,
  TreeView,
  TreeItem,
  Breadcrumb,
  BreadcrumbList,
  DataTable,
  DescriptionList,
  DescriptionItem,
  Alert,
  Avatar,
  Button,
  LinkInput,
} from '@qijenchen/design-system'
import { LayoutDashboard, FileText, UserRound, Leaf, Rocket, Plus, Pencil, Share2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { CHROME_SIDEBAR_BG } from './chrome'
import type { TaskPerson } from './TasksPage'

/** 文章與 Overview 的欄寬:沿用 tAgent 對話欄 880(2026-10-23 user 定),同一個產品的閱讀欄同寬 */
const ARTICLE_MAX_WIDTH = 880

type Block =
  | { type: 'h2'; text: string }
  | { type: 'p'; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'callout'; variant: 'info' | 'warning'; title: string; text?: string }
  /** widths = 各欄 DS `meta.width`(最小保留寬,多的依比例分配) */
  | { type: 'table'; columns: string[]; widths: number[]; rows: string[][] }

type DocPage = {
  id: string
  title: string
  owner: string
  /** YYYY/MM/DD hh:mm AM/PM */
  updated: string
  updatedBy: string
  body?: Block[]
  children?: DocPage[]
}

type Space = { id: string; name: string; description: string; icon: LucideIcon; color: 'blue' | 'green' | 'purple'; owner: string; pages: DocPage[] }

// ── 示範內容:延續 Chat / Tasks / Drive(東頂 #3、週五品茶、零售買家)─────────────
const MY_PAGES: DocPage[] = [
  {
    id: 'q4-tasting', title: 'Q4 Tasting Program', owner: 'me', updated: '2026/10/27 05:42 PM', updatedBy: 'me',
    body: [
      { type: 'p', text: 'Plans, run sheets and methods for the Q4 Friday tastings. Each session scores four Dong Ding and four High Mountain samples and decides what moves to the premium single-origin line.' },
      { type: 'ul', items: ['Friday tasting run sheet — who does what on the day', 'Blind comparison method — how we score against last year’s Alishan'] },
    ],
    children: [
      {
        id: 'run-sheet', title: 'Friday tasting run sheet', owner: 'me', updated: '2026/10/27 05:42 PM', updatedBy: 'me',
        body: [
          { type: 'callout', variant: 'info', title: 'Friday 10:30 AM · Tasting room No.3', text: 'Retail buyers are invited this round. Keep the blind comparison internal until scoring is done.' },
          { type: 'h2', text: 'Purpose' },
          { type: 'p', text: 'Confirm which spring-harvest batches go into the premium single-origin line, and give retail buyers a first look at batch #3 before we reserve stock.' },
          { type: 'h2', text: 'Agenda' },
          {
            type: 'table',
            columns: ['Time', 'Session', 'Owner'],
            widths: [104, 360, 160],
            rows: [
              ['10:30 AM', 'Welcome and brewing setup', 'Lin Ya-Ting'],
              ['10:45 AM', 'Dong Ding flight (4 samples)', 'Kudo Shinichi'],
              ['11:15 AM', 'High Mountain flight (4 samples)', 'Chen Guan-Yu'],
              ['11:45 AM', 'Blind comparison vs last year’s Alishan', 'Me'],
              ['12:15 PM', 'Scoring wrap-up and buyer Q&A', 'Me'],
            ],
          },
          { type: 'h2', text: 'Before the session' },
          { type: 'ul', items: ['Print scoring sheets (template in Drive › Q4 Tasting Program)', 'Check the water temperature controller holds 95°C — firmware fix shipped this week', 'Set up the aroma station by the window', 'Bring the aroma wheel and extra cups'] },
        ],
      },
      {
        id: 'blind-method', title: 'Blind comparison method', owner: 'me', updated: '2026/10/26 03:15 PM', updatedBy: 'me',
        body: [
          { type: 'p', text: 'Samples are coded A–H by someone who isn’t scoring. Tasters score aroma, liquor color, body and finish from 1 to 5; we reveal codes only after every sheet is in.' },
          { type: 'ul', items: ['Same water, 95°C, 5 g per 150 ml, 3-minute steep', 'Rinse cups between flights', 'Record finish length in seconds'] },
        ],
      },
    ],
  },
  {
    id: 'lugu', title: 'Lugu Co-op sourcing', owner: 'me', updated: '2026/10/26 09:30 AM', updatedBy: 'shinichi',
    body: [{ type: 'p', text: 'Evaluations, visit notes and reservations for the Lugu Co-op spring harvest.' }],
    children: [
      {
        id: 'dongding-3', title: 'Dong Ding batch #3 evaluation', owner: 'shinichi', updated: '2026/10/26 09:30 AM', updatedBy: 'shinichi',
        body: [
          { type: 'callout', variant: 'info', title: 'Decision: reserve 20 kg for the premium line', text: 'Agreed in the 2026/10/24 sync. Reservation request sent to the co-op.' },
          { type: 'h2', text: 'Summary' },
          { type: 'p', text: 'The spring harvest is lighter in body than last year, likely because of the dry March. Batch #3 stands out: golden amber liquor, no greenish tint, and a honey-caramel finish that lingers for almost a minute.' },
          { type: 'h2', text: 'Moisture readings vs Q1 benchmark' },
          {
            type: 'table',
            columns: ['Batch', 'Moisture', 'Q1 benchmark', 'Result'],
            widths: [160, 120, 140, 160],
            rows: [
              ['Batch #1', '4.8%', '≤ 5.0%', 'Pass'],
              ['Batch #2', '5.3%', '≤ 5.0%', 'Re-dry'],
              ['Batch #3', '4.2%', '≤ 5.0%', 'Pass — best'],
            ],
          },
          { type: 'h2', text: 'Next steps' },
          { type: 'ul', items: ['Confirm the 20 kg reservation with the co-op', 'Run the blind comparison with last year’s Alishan on Friday', 'Share the lab report with retail buyers after the tasting'] },
        ],
      },
      {
        id: 'visit-notes', title: 'Supplier visit notes — October', owner: 'me', updated: '2026/10/14 06:05 PM', updatedBy: 'me',
        body: [{ type: 'p', text: 'Visited the co-op roasting house on 2026/10/12. The new charcoal roaster is in use for batches #3 onward; they expect a second roast pass for the winter harvest.' }],
      },
    ],
  },
  {
    id: 'buyer-playbook', title: 'Retail buyer playbook', owner: 'me', updated: '2026/10/22 08:47 AM', updatedBy: 'guanyu',
    body: [
      { type: 'p', text: 'How we approach retail buyers for the premium line: who to contact first, what to send, and when to follow up.' },
      { type: 'ul', items: ['Send the one-pager and a tasting invite together', 'Follow up after 5 working days if there’s no reply', 'Log every reply in the Q3 retail buyer list'] },
    ],
  },
  {
    id: 'meeting-notes', title: 'Meeting notes', owner: 'me', updated: '2026/10/27 06:10 PM', updatedBy: 'me',
    body: [{ type: 'p', text: 'Notes from the weekly tasting sync.' }],
    children: [
      {
        id: 'sync-1027', title: '2026/10/27 Tasting sync', owner: 'me', updated: '2026/10/27 06:10 PM', updatedBy: 'me',
        body: [{ type: 'ul', items: ['Water temperature drift fixed; 50-cycle overnight test passed', 'Aroma station moved next to the window', 'Buyers invited to Friday’s session'] }],
      },
      {
        id: 'sync-1020', title: '2026/10/20 Tasting sync', owner: 'me', updated: '2026/10/20 05:30 PM', updatedBy: 'me',
        body: [{ type: 'ul', items: ['Batch #3 is the standout so far', 'Need moisture readings vs Q1 benchmark before reserving'] }],
      },
    ],
  },
]

export const SPACES: Space[] = [
  { id: 'my', name: 'My space', description: 'Your personal pages: plans, notes and drafts.', icon: UserRound, color: 'blue', owner: 'me', pages: MY_PAGES },
  {
    id: 'tea-tasting', name: 'Tea Tasting', description: 'Shared guides for the tasting team.', icon: Leaf, color: 'green', owner: 'guanyu',
    pages: [
      { id: 'room-guide', title: 'Tasting room guide', owner: 'yating', updated: '2026/10/24 04:20 PM', updatedBy: 'yating', body: [{ type: 'p', text: 'How to book tasting room No.3 and reset it after a session.' }] },
      { id: 'rubric', title: 'Scoring rubric', owner: 'guanyu', updated: '2026/10/14 02:10 PM', updatedBy: 'guanyu', body: [{ type: 'p', text: 'Aroma, liquor color, body and finish, each scored 1–5.' }] },
    ],
  },
  {
    id: 'product', name: 'Product Team', description: 'Roadmaps, release notes and specs.', icon: Rocket, color: 'purple', owner: 'guanyu',
    pages: [
      { id: 'roadmap', title: 'Q4 roadmap', owner: 'guanyu', updated: '2026/10/23 05:12 PM', updatedBy: 'guanyu', body: [{ type: 'p', text: 'What ships this quarter and why.' }] },
      { id: 'release', title: 'Release process', owner: 'yui', updated: '2026/10/22 11:05 AM', updatedBy: 'yui', body: [{ type: 'p', text: 'From code freeze to store review.' }] },
    ],
  },
]

/** 頁面在樹裡的路徑(含自己),找不到回空陣列 */
function pathTo(pages: DocPage[], id: string): DocPage[] {
  for (const p of pages) {
    if (p.id === id) return [p]
    const sub = p.children ? pathTo(p.children, id) : []
    if (sub.length) return [p, ...sub]
  }
  return []
}
const flatten = (pages: DocPage[]): DocPage[] => pages.flatMap((p) => [p, ...(p.children ? flatten(p.children) : [])])

/** 站內路徑 `/docs/<space>[/<pageId>]`:麵包屑與頁面連結共用,由頁面攔截成切換(Drive 同款) */
const docsHref = (space: string, page?: string) => `/docs/${encodeURIComponent(space)}${page ? `/${encodeURIComponent(page)}` : ''}`
function parseDocsHref(href: string) {
  const m = href.match(/^\/docs\/([^/]+)(?:\/([^/]+))?$/)
  return m ? { space: decodeURIComponent(m[1]), page: m[2] ? decodeURIComponent(m[2]) : null } : null
}

export type DocsRoute = { space: string; page: string | null }

export function DocsPage({
  mainMinWidth,
  menuWidth,
  portalContainer,
  resolvePerson,
  initialRoute = { space: 'my', page: null },
}: {
  mainMinWidth: number
  menuWidth: { min: number; initial: number; max: number }
  portalContainer: HTMLElement | null
  resolvePerson: (key: string) => TaskPerson
  initialRoute?: DocsRoute
}) {
  const [route, setRoute] = useState<DocsRoute>(initialRoute)
  const space = SPACES.find((s) => s.id === route.space) ?? SPACES[0]
  const trail = route.page ? pathTo(space.pages, route.page) : []
  const page = trail[trail.length - 1]
  // 樹的展開:預設展開目前頁的上層(使用者自己開合的部分保留)
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(trail.slice(0, -1).map((p) => p.id)))

  const go = (next: DocsRoute) => {
    setRoute(next)
    if (next.page) {
      const s = SPACES.find((x) => x.id === next.space) ?? SPACES[0]
      const ancestors = pathTo(s.pages, next.page).slice(0, -1).map((p) => p.id)
      setExpanded((prev) => new Set([...prev, ...ancestors]))
    }
  }

  const interceptDocsLink = (e: React.MouseEvent) => {
    const href = (e.target as Element).closest?.('a[href]')?.getAttribute('href')
    const next = href ? parseDocsHref(href) : null
    if (!next) return
    e.preventDefault()
    e.stopPropagation()
    go(next)
  }

  const renderTree = (pages: DocPage[]) =>
    pages.map((p) => (
      <TreeItem key={p.id} id={p.id} icon={FileText} label={p.title}>
        {p.children ? renderTree(p.children) : undefined}
      </TreeItem>
    ))

  const sidebar = (
    // 與 Tasks / Drive / tAgent 頁側欄同一組設定(收合 offcanvas、寬度、淺灰底)
    <Sidebar collapsible="offcanvas" contentType="docs-nav" widthRange={menuWidth} className={CHROME_SIDEBAR_BG}>
      <SidebarHeader>
        <h2 className="flex-1 truncate text-body-lg font-medium">Docs</h2>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent className="flex flex-col gap-[var(--layout-space-tight)]">
            <div className="px-[var(--layout-space-loose)]">
              <Select
                aria-label="Space"
                width="fill"
                value={space.id}
                onChange={(id) => { setExpanded(new Set()); go({ space: id, page: null }) }}
                options={SPACES.map((s) => ({ value: s.id, label: s.name, icon: s.icon, description: s.description }))}
              />
            </div>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton id="overview" startIcon={LayoutDashboard} tooltip="Overview">Overview</SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarSeparator />
        <SidebarGroup>
          <SidebarGroupLabel>Content</SidebarGroupLabel>
          <SidebarGroupContent>
            <TreeView
              aria-label={`${space.name} pages`}
              selectedIds={new Set(page ? [page.id] : [])}
              onSelectedChange={(ids) => { const id = [...ids][0]; if (id) go({ space: space.id, page: id }) }}
              expandedIds={expanded}
              onExpandedChange={setExpanded}
            >
              {renderTree(space.pages)}
            </TreeView>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  )

  const crumbs = [
    { label: space.name, href: docsHref(space.id), startIcon: space.icon },
    ...trail.map((p, i) => (i === trail.length - 1 ? { label: p.title } : { label: p.title, href: docsHref(space.id, p.id) })),
  ]

  const header = (
    <ChromeHeader className="bg-surface" onClickCapture={interceptDocsLink}>
      <SidebarTrigger aria-label="Toggle docs sidebar" />
      {page ? (
        // 頁面:麵包屑直接當頁首的位置(同 Drive);頁面標題是文章裡的 h1
        <div className="min-w-0 flex-1">
          <Breadcrumb>
            <BreadcrumbList items={crumbs} />
          </Breadcrumb>
        </div>
      ) : (
        <h1 className="flex-1 truncate text-body-lg font-medium">Overview</h1>
      )}
      <div className="flex items-center gap-2">
        {page ? (
          <>
            <Button variant="tertiary" size="sm" startIcon={Share2}>Share</Button>
            <Button variant="primary" size="sm" startIcon={Pencil}>Edit</Button>
          </>
        ) : (
          <Button variant="primary" size="sm" startIcon={Plus}>New page</Button>
        )}
      </div>
    </ChromeHeader>
  )

  const byline = (p: DocPage) => {
    const owner = resolvePerson(p.owner)
    const editor = resolvePerson(p.updatedBy)
    return (
      <div className="flex items-center gap-2 text-body text-fg-secondary">
        <Avatar src={owner.avatarUrl} alt={owner.name} size={24} />
        <span>Owned by {owner.name} · Last updated {p.updated}{p.updatedBy !== p.owner ? ` by ${editor.name}` : ''}</span>
      </div>
    )
  }

  const renderBlock = (b: Block, i: number) => {
    switch (b.type) {
      case 'h2':
        return <h2 key={i} className="text-h4 font-semibold">{b.text}</h2>
      case 'p':
        return <p key={i} className="text-body">{b.text}</p>
      case 'ul':
        return (
          <ul key={i} className="flex list-disc flex-col gap-1 ps-[var(--layout-space-loose)] text-body">
            {b.items.map((t) => <li key={t}>{t}</li>)}
          </ul>
        )
      case 'callout':
        return <Alert key={i} variant={b.variant} title={b.title} description={b.text} />
      case 'table': {
        const cols = b.columns.map((c, ci) => ({ id: `c${ci}`, accessorFn: (r: string[]) => r[ci], header: c, meta: { type: 'string' as const, width: b.widths[ci] } }))
        return <DataTable key={i} columns={cols} data={b.rows} getRowId={(r: string[]) => r[0]} aria-label={b.columns.join(', ')} />
      }
    }
  }

  // 最近更新的頁(Overview):依更新時間新到舊,前 5 筆
  const recent = flatten(space.pages).sort((a, b) => toTime(b.updated) - toTime(a.updated)).slice(0, 5)
  const recentColumns = [
    { accessorKey: 'title', header: 'Page', cell: ({ row }: { row: { original: DocPage } }) => <LinkInput mode="view" value={docsHref(space.id, row.original.id)} label={row.original.title} />, meta: { width: 320 } },
    { id: 'by', accessorFn: (p: DocPage) => resolvePerson(p.updatedBy), header: 'Last updated by', meta: { type: 'person' as const, width: 200 } },
    { accessorKey: 'updated', header: 'Updated', meta: { type: 'string' as const, width: 184 } },
  ]
  const ownerPerson = resolvePerson(space.owner)

  const main = (
    <div className="h-full min-h-0 overflow-y-auto" onClickCapture={interceptDocsLink}>
      <article
        className="mx-auto flex w-full flex-col gap-[var(--layout-space-loose)] px-[var(--layout-space-loose)] py-[var(--layout-space-loose)]"
        style={{ maxWidth: ARTICLE_MAX_WIDTH }}
      >
        {page ? (
          <>
            <div className="flex flex-col gap-[var(--layout-space-tight)]">
              <h1 className="text-h3 font-semibold">{page.title}</h1>
              {byline(page)}
            </div>
            {(page.body ?? []).map(renderBlock)}
          </>
        ) : (
          <>
            <div className="flex items-center gap-[var(--layout-space-loose)]">
              <Avatar icon={space.icon} shape="square" color={space.color} solid size={48} aria-hidden />
              <div className="flex min-w-0 flex-col">
                <h2 className="text-h3 font-semibold">{space.name}</h2>
                <p className="text-body text-fg-secondary">{space.description}</p>
              </div>
            </div>
            <DescriptionList cols={3}>
              <DescriptionItem label="Owner">
                <span className="flex items-center gap-2"><Avatar src={ownerPerson.avatarUrl} alt={ownerPerson.name} size={24} />{ownerPerson.name}</span>
              </DescriptionItem>
              <DescriptionItem label="Pages">{String(flatten(space.pages).length)}</DescriptionItem>
              <DescriptionItem label="Last updated">{recent[0]?.updated ?? '-'}</DescriptionItem>
            </DescriptionList>
            <h3 className="text-h5 font-semibold">Recently updated</h3>
            <DataTable columns={recentColumns} data={recent} getRowId={(p: DocPage) => p.id} aria-label="Recently updated pages" />
          </>
        )}
      </article>
    </div>
  )

  return (
    <SidebarProvider
      activeId={page ? `page:${page.id}` : 'overview'}
      onActiveChange={(id) => { if (id === 'overview') go({ space: space.id, page: null }) }}
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

/** 'YYYY/MM/DD hh:mm AM/PM' → 可比較的時間值 */
function toTime(s: string) {
  const m = s.match(/^(\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2}) (AM|PM)$/)
  if (!m) return 0
  const h = (Number(m[4]) % 12) + (m[6] === 'PM' ? 12 : 0)
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), h, Number(m[5])).getTime()
}
