// 管理者劇本的表格、週報(2026-11-03 user:管理者一問一答拿到列表,最後請代理整理成 HTML 報告拿去報告用)。
// 資料在 teamStats.ts。
//
// ── 消費的 SSOT ──────────────────────────────────────────────────────────────
// - 對話裡的列表 = DS DataTable 唯讀、高度隨內容(data-table.spec.md「簡單展示也用 DataTable(最少 config)——不維護第二個靜態 Table 元件」;
//   「無高度約束(auto):適合少量資料、預覽、嵌入式表格」)。數字欄 meta.type="number" → 靠右(column-types.ts)。
//   不排序、不滑過(列點了沒有反應;FileItem spec「只有點了會有反應的才有滑過底色」同一條規則)。
// - 圖表只放在報告裡(2026-11-03 user:「照 DS spec,圖放在報告裡」)= DS Chart(ChartContainer + Recharts BarChart,
//   顏色走 ChartConfig → `var(--color-{key})`,chart.spec.md「不硬寫色值」)。兩個數列(上週 / 前一週)→ 要 legend。
//   類型名稱長(「Registry 與映像檔」)→ 橫條(layout="vertical"),類別名稱放左邊一行讀完,不用斜字或換行。
// - 報告段落標題 / 條列 / 字級 = articles.tsx 同一組(text-h4、list utilities、text-body);期間等 metadata = DescriptionList horizontal
// - 對話裡的報告檔 = DS FileItem compact、surface="form"、無 status(file-item.spec.md「表單 / 訊息附件」靜態態,點了打開 = 主要動作;
//   rich 要縮圖,HTML 沒有縮圖會顯示檔名首字,不用)
// - 預覽開在右側面板(2026-11-03 user 同意:照 Claude artifact 的做法);頂列 × 左邊 Download + Open in new tab(AsideHeaderActions,暫時做法)
import { createContext, useContext, useRef, type ReactNode } from 'react'
import {
  Button,
  ButtonDivider,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  DataTable,
  DescriptionItem,
  DescriptionList,
  FileItem,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  type ChartConfig,
  type DataTableProps,
} from '@qijenchen/design-system'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { Download, ExternalLink } from 'lucide-react'
import { AsideHeaderActions } from './AsideHeaderActions'
import { TicketLink } from './TAgent'
import { CATEGORIES, COMPARISON, OBSERVATIONS, OPEN_TICKETS, PERIOD, PREV_PERIOD, TEAM, TOTALS, pct } from './teamStats'

type Columns<T> = DataTableProps<T>['columns']

/** 對話 / 報告共用的唯讀表格 */
function StaticTable<T>({ columns, data, label }: { columns: Columns<T>; data: T[]; label: string }) {
  return (
    <DataTable
      aria-label={label}
      columns={columns}
      data={data}
      size="sm"
      height="auto"
      enableHover={false}
      tableOptions={{ enableSorting: false }}
    />
  )
}

// ── 表格 ─────────────────────────────────────────────────────────────────────
const comparisonColumns: Columns<(typeof COMPARISON)[number]> = [
  // 期間寫在表格前的文字 / 報告的「期間」列,表頭只寫「上週 / 前一週」(右側面板 480 寬也放得下,不截斷)
  { accessorKey: 'metric', header: '指標', meta: { type: 'string', width: 100 } },
  { accessorKey: 'current', header: '上週', meta: { type: 'string', align: 'right', width: 96 } },
  { accessorKey: 'prev', header: '前一週', meta: { type: 'string', align: 'right', width: 96 } },
  { accessorKey: 'change', header: '變化', meta: { type: 'string', align: 'right', width: 150 } },
]
export const ComparisonTable = () => <StaticTable label="上週與前一週比較" columns={comparisonColumns} data={COMPARISON} />

const categoryRows = CATEGORIES.map((c) => ({ ...c, share: pct(c.tickets, TOTALS.tickets) }))
const categoryColumns: Columns<(typeof categoryRows)[number]> = [
  { accessorKey: 'category', header: '類型', meta: { type: 'string', width: 180 } },
  { accessorKey: 'tickets', header: '件數', meta: { type: 'number', width: 90 } },
  { accessorKey: 'share', header: '占比', meta: { type: 'string', align: 'right', width: 90 } },
  { accessorKey: 'closed', header: '已結案', meta: { type: 'number', width: 90 } },
]
export const CategoryTable = () => <StaticTable label="問題類型排序" columns={categoryColumns} data={categoryRows} />

const openColumns: Columns<(typeof OPEN_TICKETS)[number]> = [
  // 單號 = TicketLink(點了在右側看單子,同其他劇本)
  { accessorKey: 'id', header: '單號', meta: { width: 96 }, cell: ({ row }) => <TicketLink id={row.original.id} /> },
  { accessorKey: 'title', header: '標題', meta: { type: 'string', width: 260 } },
  { accessorKey: 'category', header: '類型', meta: { type: 'string', width: 150 } },
  { accessorKey: 'assignee', header: '負責人', meta: { type: 'string', width: 90 } },
  { id: 'age', accessorFn: (t) => `${t.ageDays} 天`, header: '已開', meta: { type: 'string', align: 'right', width: 72 } },
]
export const OpenTicketsTable = () => <StaticTable label="未結案的單" columns={openColumns} data={OPEN_TICKETS} />
/** 報告裡的版本:右側面板寬 480,拿掉「類型」(問題類型在上一段已有圖表與表格),其餘欄同對話 */
const reportOpenColumns = openColumns
  .filter((c) => (c as { accessorKey?: string }).accessorKey !== 'category')
  .map((c) => ((c as { accessorKey?: string }).accessorKey === 'title' ? { ...c, meta: { ...c.meta, width: 180 } } : c))
const ReportOpenTicketsTable = () => <StaticTable label="未結案的單" columns={reportOpenColumns} data={OPEN_TICKETS} />

// ── 報告 ─────────────────────────────────────────────────────────────────────
export const REPORT = {
  title: `${TEAM}週報：${PERIOD.label}`,
  fileName: `k8s-platform-weekly-${PERIOD.from.replaceAll('/', '')}.html`,
}

const chartConfig = {
  tickets: { label: '上週', color: 'var(--chart-1)' },
  prevTickets: { label: '前一週', color: 'var(--chart-2)' },
} satisfies ChartConfig

function CategoryChart() {
  return (
    <ChartContainer config={chartConfig} className="aspect-[4/3]">
      <BarChart accessibilityLayer data={CATEGORIES} layout="vertical" margin={{ left: 8 }}>
        <CartesianGrid horizontal={false} />
        <YAxis dataKey="category" type="category" tickLine={false} axisLine={false} width={148} />
        <XAxis type="number" tickLine={false} axisLine={false} allowDecimals={false} />
        <ChartTooltip content={<ChartTooltipContent />} />
        {/* 圖例順序 = 畫的順序(上週在前);Recharts 預設依 dataKey 字母排,會變成「前一週、上週」 */}
        <ChartLegend content={<ChartLegendContent />} itemSorter={(item) => (item.dataKey === 'tickets' ? 0 : 1)} />
        <Bar dataKey="tickets" fill="var(--color-tickets)" radius={4} />
        <Bar dataKey="prevTickets" fill="var(--color-prevTickets)" radius={4} />
      </BarChart>
    </ChartContainer>
  )
}

/** 下載 / 新分頁用:把面板裡畫好的報告(含圖表的 SVG)連同目前頁面的樣式包成一份獨立的 HTML;
 *  寬度 = 面板當下的寬(圖表 SVG 與表格欄寬是照這個寬畫的,換寬會留白或截斷) */
function toStandaloneHtml(node: HTMLElement) {
  const css = Array.from(document.styleSheets)
    .flatMap((s) => {
      try {
        return Array.from(s.cssRules).map((r) => r.cssText)
      } catch {
        return []
      }
    })
    .join('\n')
  const theme = document.documentElement.getAttribute('data-theme') ?? 'light'
  return `<!doctype html>
<html lang="zh-Hant" data-theme="${theme}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${REPORT.title}</title>
<style>${css}</style></head>
<body class="bg-canvas text-foreground"><main style="max-width:${node.offsetWidth}px;margin:0 auto">${node.outerHTML}</main></body>
</html>`
}

export function ReportPreview() {
  const ref = useRef<HTMLDivElement>(null)
  const blobUrl = () => (ref.current ? URL.createObjectURL(new Blob([toStandaloneHtml(ref.current)], { type: 'text/html' })) : null)
  const download = () => {
    const url = blobUrl()
    if (!url) return
    const a = document.createElement('a')
    a.href = url
    a.download = REPORT.fileName
    a.click()
    URL.revokeObjectURL(url)
  }
  const openInNewTab = () => {
    const url = blobUrl()
    if (url) window.open(url, '_blank', 'noopener')
  }
  return (
    <div ref={ref} className="flex flex-col gap-[var(--layout-space-loose)] p-[var(--layout-space-loose)]">
      <AsideHeaderActions deps="report">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="text" size="sm" iconOnly startIcon={Download} aria-label="Download" title="" onClick={download} />
          </TooltipTrigger>
          <TooltipContent>Download</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="text" size="sm" iconOnly startIcon={ExternalLink} aria-label="Open in new tab" title="" onClick={openInNewTab} />
          </TooltipTrigger>
          <TooltipContent>Open in new tab</TooltipContent>
        </Tooltip>
        <ButtonDivider />
      </AsideHeaderActions>
      <h2 className="text-h3 font-semibold">{REPORT.title}</h2>
      <DescriptionList orientation="horizontal">
        <DescriptionItem label="期間">{PERIOD.label}（與前一週 {PREV_PERIOD.label} 比較）</DescriptionItem>
        <DescriptionItem label="團隊">{TEAM}</DescriptionItem>
        <DescriptionItem label="整理">AI agent（資料來源：IT Service Desk 工單）</DescriptionItem>
      </DescriptionList>
      <h3 className="text-h4 font-semibold">摘要</h3>
      <ComparisonTable />
      <h3 className="text-h4 font-semibold">問題類型</h3>
      <CategoryChart />
      <CategoryTable />
      <h3 className="text-h4 font-semibold">未結案的單</h3>
      <ReportOpenTicketsTable />
      <h3 className="text-h4 font-semibold">觀察</h3>
      <ul className="flex list-disc flex-col gap-1 ps-[var(--layout-space-loose)] text-body">
        {OBSERVATIONS.map((o) => <li key={o}>{o}</li>)}
      </ul>
    </div>
  )
}

// ── 對話裡的報告檔 ────────────────────────────────────────────────────────────
const ReportActionsContext = createContext<(() => void) | null>(null)
export function ReportActionsProvider({ open, children }: { open: () => void; children: ReactNode }) {
  return <ReportActionsContext.Provider value={open}>{children}</ReportActionsContext.Provider>
}
export function ReportFileCard() {
  const open = useContext(ReportActionsContext)
  return (
    <div className="mt-2">
      <FileItem name={REPORT.fileName} description="HTML" onClick={open ?? undefined} actionAriaLabel={`Open ${REPORT.fileName}`} />
    </div>
  )
}
