// TasksPage — tWorkspace 的 Tasks 分頁(2026-10-28 keyscreen → 同日 user 確認後加入 prototype,user:「左側 panel 同 agent 頁,呈現 My tasks 及 Projects 區塊,
// 預設首頁是 My tasks,右側內容頁呈現任務列表。先出 keyscreen,確認沒問題後再加入 prototype」)。
//
// 版面與 tAgent 頁(TAgentPage.tsx)同一套:DS AppShell(primary-sidebar)+ DS Sidebar(offcanvas、widthRange 與 ChatList 同組、淺灰底)
// + Main 頁首 DS ChromeHeader(SidebarTrigger + h1)。
//
// - 左側:My tasks(預設)+ Projects(可收合群組,列出專案;與 tAgent 側欄 Pinned / Recents 同款列)。
// - My tasks:頁首分頁 Upcoming / Overdue / Completed(DS Tabs 放在 ChromeHeader `tabsSlot`)。
//   對照 Asana 首頁「My tasks」小工具的 Upcoming / Overdue / Completed 三分頁;Asana 完整「My tasks」頁是依到期日分段
//   (Recently assigned / Do today / Do next week / Do later),DS DataTable 沒有分組列(data-table.spec.md「何時不用」),所以這版用分頁。
// - 列表 = DS DataTable(第一欄 Task no.,2026-10-28 user):欄位型別照 DS(select + display="tag" 的狀態彩色標籤、date 欄 YYYY/MM/DD)。
//   「完成」以 Status 欄表達,不在列首放勾選框:DataTable 的勾選框是「選取」語意(data-table.spec.md L2),與「標記完成」不同件事。
// - 專案頁:同一張表,多一欄 Assignee(DS person 欄);沒有分頁。
// - 尚未做(keyscreen 範圍外):點列開任務詳情(預計 AppShell Right panel)、新增任務、改狀態 / 到期日。
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
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  DataTable,
  Button,
  Empty,
} from '@qijenchen/design-system'
import { CircleCheck, Plus } from 'lucide-react'
import { CHROME_SIDEBAR_BG } from './chrome'

export type TasksRoute = 'my-tasks' | `project:${string}`

type Status = 'todo' | 'in-progress' | 'blocked' | 'done'
type Priority = 'high' | 'medium' | 'low'

export type TaskPerson = { name: string; avatarUrl?: string; description?: string; status?: 'online' | 'away' | 'busy' | 'offline' }

type Task = {
  id: string
  title: string
  projectId: string
  /** YYYY-MM-DD */
  due: string
  status: Status
  priority: Priority
  /** 成員 key(App 的 PEOPLE / ME);'me' = 目前使用者 */
  assignee: string
}

/** 示範的「今天」:分頁(Upcoming / Overdue)以此日判斷,截圖與回歸測試才穩定 */
const DEMO_TODAY = '2026-10-28'

// key = 任務編號前綴(Jira / Linear 的「專案代號-流水號」,如 LUG-24);start = 示範資料的起始流水號(專案已進行一段時間)
export const TASK_PROJECTS = [
  { id: 'tasting', name: 'Q4 Tasting Program', key: 'TAS', start: 41 },
  { id: 'lugu', name: 'Lugu Co-op Sourcing', key: 'LUG', start: 23 },
  { id: 'buyers', name: 'Retail Buyer Outreach', key: 'BUY', start: 15 },
  { id: 'room', name: 'Tasting Room Upgrade', key: 'ROOM', start: 8 },
]

/** Task no. = 專案代號-流水號,依資料順序(= 建立順序)在各專案內遞增 */
function taskNumbers(tasks: { id: string; projectId: string }[]) {
  const next: Record<string, number> = {}
  const out: Record<string, string> = {}
  for (const t of tasks) {
    const p = TASK_PROJECTS.find((x) => x.id === t.projectId)!
    next[p.id] = (next[p.id] ?? p.start) + 1
    out[t.id] = `${p.key}-${next[p.id]}`
  }
  return out
}

// 內容延續 Chat 示範資料:Shinichi DM(東頂 #3、20 kg 保留、水分數據)、Tea Tasting 群組(香氣台、水溫控制器)、週五品茶與買家邀請
const TASKS: Task[] = [
  { id: 't1', title: 'Pull batch #3 moisture readings vs Q1 benchmark', projectId: 'lugu', due: '2026-10-27', status: 'todo', priority: 'high', assignee: 'me' },
  { id: 't2', title: 'Reserve 20 kg of batch #3 for the premium line', projectId: 'lugu', due: '2026-10-28', status: 'in-progress', priority: 'high', assignee: 'me' },
  { id: 't3', title: 'Confirm water temperature controller fix before Friday', projectId: 'room', due: '2026-10-29', status: 'in-progress', priority: 'high', assignee: 'me' },
  { id: 't4', title: 'Send Friday tasting invite to retail buyers', projectId: 'buyers', due: '2026-10-29', status: 'todo', priority: 'medium', assignee: 'me' },
  { id: 't5', title: 'Prepare scoring sheets for Friday tasting', projectId: 'tasting', due: '2026-10-30', status: 'todo', priority: 'medium', assignee: 'me' },
  { id: 't6', title: 'Set up blind comparison with last year’s Alishan', projectId: 'tasting', due: '2026-10-30', status: 'todo', priority: 'medium', assignee: 'me' },
  { id: 't7', title: 'Follow up with Q3 buyers who haven’t replied', projectId: 'buyers', due: '2026-11-03', status: 'todo', priority: 'low', assignee: 'me' },
  { id: 't8', title: 'Book courier for Lugu sample shipments', projectId: 'lugu', due: '2026-11-05', status: 'todo', priority: 'low', assignee: 'me' },
  { id: 't9', title: 'Update Q3 retail buyer list with new contacts', projectId: 'buyers', due: '2026-10-24', status: 'blocked', priority: 'medium', assignee: 'me' },
  { id: 't10', title: 'Move aroma station next to the window', projectId: 'room', due: '2026-10-27', status: 'done', priority: 'low', assignee: 'me' },
  { id: 't11', title: 'Review tasting report on Figma', projectId: 'tasting', due: '2026-10-26', status: 'done', priority: 'medium', assignee: 'me' },
  // 其他成員的任務(只在專案頁出現)
  { id: 't12', title: 'Bring aroma wheel and extra cups for Friday', projectId: 'tasting', due: '2026-10-30', status: 'todo', priority: 'low', assignee: 'yating' },
  { id: 't13', title: 'Run 50-cycle overnight test on the PID loop', projectId: 'room', due: '2026-10-27', status: 'done', priority: 'high', assignee: 'kenji' },
  { id: 't14', title: 'Share lab report for the spring harvest', projectId: 'lugu', due: '2026-10-29', status: 'in-progress', priority: 'medium', assignee: 'shinichi' },
  { id: 't15', title: 'Draft buyer one-pager for the premium line', projectId: 'buyers', due: '2026-11-04', status: 'todo', priority: 'medium', assignee: 'guanyu' },
  { id: 't16', title: 'Order tasting room No.3 lighting', projectId: 'room', due: '2026-11-06', status: 'todo', priority: 'low', assignee: 'yui' },
]

const TASK_NO = taskNumbers(TASKS)

// 狀態彩色標籤:DS Select `display="tag"` + option `tagVariant`(DataTable 狀態欄 canonical,data-table.anatomy.stories 同款)
const STATUS_OPTIONS = [
  { value: 'todo', label: 'To do', tagVariant: 'neutral' },
  { value: 'in-progress', label: 'In progress', tagVariant: 'blue' },
  { value: 'blocked', label: 'Blocked', tagVariant: 'red' },
  { value: 'done', label: 'Done', tagVariant: 'green' },
]
const PRIORITY_OPTIONS = [
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
]

// 日期 YYYY/MM/DD(user 慣用格式);zh-TW 的 2-digit 月 / 日 = 2026/10/28
const DATE_META = { type: 'date' as const, locale: 'zh-TW', formatOptions: { year: 'numeric', month: '2-digit', day: '2-digit' } as Intl.DateTimeFormatOptions }

type MyTasksTab = 'upcoming' | 'overdue' | 'completed'

export function TasksPage({
  mainMinWidth,
  menuWidth,
  portalContainer,
  resolvePerson,
  initialRoute = 'my-tasks',
}: {
  mainMinWidth: number
  menuWidth: { min: number; initial: number; max: number }
  portalContainer: HTMLElement | null
  /** 成員 key → DS person 欄要的資料(App 的 PEOPLE / ME) */
  resolvePerson: (key: string) => TaskPerson
  initialRoute?: TasksRoute
}) {
  const [route, setRoute] = useState<TasksRoute>(initialRoute)
  const [tab, setTab] = useState<MyTasksTab>('upcoming')

  const project = route.startsWith('project:') ? TASK_PROJECTS.find((p) => `project:${p.id}` === route) : undefined
  const projectName = (id: string) => TASK_PROJECTS.find((p) => p.id === id)?.name ?? ''

  const sidebar = (
    // 與 tAgent 頁側欄同一組設定(收合 offcanvas、寬度、淺灰底)
    <Sidebar collapsible="offcanvas" contentType="tasks-nav" widthRange={menuWidth} className={CHROME_SIDEBAR_BG}>
      <SidebarHeader>
        <h2 className="flex-1 truncate text-body-lg font-medium">Tasks</h2>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton id="my-tasks" startIcon={CircleCheck} tooltip="My tasks">My tasks</SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup collapsible value="projects">
          <SidebarGroupLabel>Projects</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {TASK_PROJECTS.map((p) => (
                <SidebarMenuItem key={p.id}>
                  <SidebarMenuButton id={`project:${p.id}`} tooltip={p.name}>{p.name}</SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  )

  const newTask = (
    <Button variant="primary" size="sm" startIcon={Plus}>New task</Button>
  )

  // ── My tasks ───────────────────────────────────────────────────────────
  const mine = TASKS.filter((t) => t.assignee === 'me')
  const byDue = (a: Task, b: Task) => a.due.localeCompare(b.due)
  const lists: Record<MyTasksTab, Task[]> = {
    upcoming: mine.filter((t) => t.status !== 'done' && t.due >= DEMO_TODAY).sort(byDue),
    overdue: mine.filter((t) => t.status !== 'done' && t.due < DEMO_TODAY).sort(byDue),
    completed: mine.filter((t) => t.status === 'done').sort((a, b) => b.due.localeCompare(a.due)),
  }
  const EMPTY_COPY: Record<MyTasksTab, string> = {
    upcoming: 'Nothing coming up. Tasks assigned to you with a due date show here.',
    overdue: 'You’re all caught up. Nothing is past due.',
    completed: 'Tasks you complete show here.',
  }

  // 欄寬:DS `meta.width` = 最小保留寬,多出來的空間依比例分給各欄(data-table.spec.md「Column 寬度 API」;不用 TanStack `size`)
  const columns = (withAssignee: boolean) => [
    // Task no. 放第一欄(2026-10-28 user);編號是識別碼,與 Jira / Linear 列表同位置
    { id: 'no', accessorFn: (t: Task) => TASK_NO[t.id], header: 'Task no.', meta: { type: 'string' as const, width: 104 } },
    { accessorKey: 'title', header: 'Task', meta: { type: 'string' as const, width: 360 } },
    { accessorKey: 'status', header: 'Status', meta: { type: 'select' as const, options: STATUS_OPTIONS, display: 'tag' as const, width: 128 } },
    { accessorKey: 'priority', header: 'Priority', meta: { type: 'select' as const, options: PRIORITY_OPTIONS, width: 104 } },
    ...(withAssignee
      ? [{ id: 'assignee', accessorFn: (t: Task) => resolvePerson(t.assignee), header: 'Assignee', meta: { type: 'person' as const, width: 200 } }]
      : [{ id: 'project', accessorFn: (t: Task) => projectName(t.projectId), header: 'Project', meta: { type: 'string' as const, width: 176 } }]),
    { id: 'due', accessorFn: (t: Task) => t.due, header: 'Due date', meta: { ...DATE_META, width: 120 } },
  ]

  const table = (rows: Task[], label: string, withAssignee = false, empty?: string) => (
    <div className="flex h-full min-h-0 flex-col px-[var(--layout-space-loose)] py-[var(--layout-space-tight)]">
      <DataTable
        columns={columns(withAssignee)}
        data={rows}
        height="100%"
        getRowId={(t: Task) => t.id}
        aria-label={label}
        emptyState={empty ? <Empty icon={CircleCheck} description={empty} /> : undefined}
      />
    </div>
  )

  let header: React.ReactNode
  let main: React.ReactNode
  if (project) {
    header = (
      <ChromeHeader className="bg-surface">
        <SidebarTrigger aria-label="Toggle tasks sidebar" />
        <h1 className="flex-1 truncate text-body-lg font-medium">{project.name}</h1>
        {newTask}
      </ChromeHeader>
    )
    main = table(TASKS.filter((t) => t.projectId === project.id).sort(byDue), `${project.name} tasks`, true)
  } else {
    // 分頁列放在頁首第二列(ChromeHeader tabsSlot,header-canonical W2);Tabs root 包住整個殼,讓頁首的 TabsList 與內容區的 TabsContent 同一個 context
    header = (
      <ChromeHeader
        className="bg-surface"
        tabsSlot={
          <TabsList>
            <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
            <TabsTrigger value="overdue">Overdue</TabsTrigger>
            <TabsTrigger value="completed">Completed</TabsTrigger>
          </TabsList>
        }
      >
        <SidebarTrigger aria-label="Toggle tasks sidebar" />
        <h1 className="flex-1 truncate text-body-lg font-medium">My tasks</h1>
        {newTask}
      </ChromeHeader>
    )
    main = (
      <>
        {(['upcoming', 'overdue', 'completed'] as const).map((k) => (
          <TabsContent key={k} value={k} className="h-full min-h-0">
            {table(lists[k], `My tasks — ${k}`, false, EMPTY_COPY[k])}
          </TabsContent>
        ))}
      </>
    )
  }

  const shell = (
    <SidebarProvider
      activeId={route}
      onActiveChange={(id) => setRoute(id as TasksRoute)}
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

  return project ? shell : (
    <Tabs value={tab} onValueChange={(v) => setTab(v as MyTasksTab)} className="h-full">
      {shell}
    </Tabs>
  )
}
