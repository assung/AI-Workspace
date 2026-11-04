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
// - 對話裡的報告檔(artifacts.tsx ArtifactCard)= DS FileItem compact、surface="form"、無 status(file-item.spec.md「表單 / 訊息附件」靜態態,點了打開 = 主要動作;
//   rich 要縮圖,HTML 沒有縮圖會顯示檔名首字,不用)
// - 預覽開在右側面板(2026-11-03 user 同意:照 Claude artifact 的做法);頂列 × 左邊 Download + Open in new tab(AsideHeaderActions,暫時做法)
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  type ChartConfig,
  type DataTableProps,
} from '@qijenchen/design-system'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { Download, ExternalLink } from 'lucide-react'
import { AsideHeaderActions } from './AsideHeaderActions'
import { inArtifactViewer, saveFile } from './download'
import type { ArtifactItem } from './artifacts'
import { TicketLink } from './TAgent'
import { CATEGORIES, COMPARISON, OBSERVATIONS, OPEN_TICKETS, PERIOD, PREV_PERIOD, TEAM, TOTALS, pct } from './teamStats'

type Columns<T> = DataTableProps<T>['columns']

/**
 * 對話 / 報告共用的唯讀表格。
 * 長文字欄(標題、類型)換行不截斷 = DataTable「自動行高」+ 欄位 `wrap`(data-table.spec.md 四、行高模式:
 * 「適合描述、備註等需完整顯示的欄位」);只有一行的列高度同固定行高。
 * 欄寬 = 最窄時的寬(加總 ≤ 右側面板 480 的內容寬,面板最窄也不必橫捲);容器比較寬時 DataTable 依比例撐開。
 */
function StaticTable<T>({ columns, data, label }: { columns: Columns<T>; data: T[]; label: string }) {
  return (
    <DataTable
      aria-label={label}
      columns={columns}
      data={data}
      size="sm"
      height="auto"
      autoRowHeight
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
  { accessorKey: 'category', header: '類型', meta: { type: 'string', width: 160, wrap: true } },
  { accessorKey: 'tickets', header: '件數', meta: { type: 'number', width: 90 } },
  { accessorKey: 'share', header: '占比', meta: { type: 'string', align: 'right', width: 90 } },
  { accessorKey: 'closed', header: '已結案', meta: { type: 'number', width: 90 } },
]
export const CategoryTable = () => <StaticTable label="問題類型排序" columns={categoryColumns} data={categoryRows} />

const openColumns: Columns<(typeof OPEN_TICKETS)[number]> = [
  // 單號 = TicketLink(點了在右側看單子,同其他劇本)
  // 變寬時多出來的寬度給標題:其他欄設 maxWidth(DataTable 分配欄寬時撞到上限的欄先凍結、餘數分給其他欄,data-table.spec.md 欄寬段)
  { accessorKey: 'id', header: '單號', meta: { width: 84, maxWidth: 100 }, cell: ({ row }) => <TicketLink id={row.original.id} /> },
  { accessorKey: 'title', header: '標題', meta: { type: 'string', width: 132, wrap: true } },
  { accessorKey: 'category', header: '類型', meta: { type: 'string', width: 92, maxWidth: 150, wrap: true } },
  { accessorKey: 'assignee', header: '負責人', meta: { type: 'string', width: 68, maxWidth: 90 } },
  { id: 'age', accessorFn: (t) => `${t.ageDays} 天`, header: '已開', meta: { type: 'string', align: 'right', width: 64, maxWidth: 72 } },
]
export const OpenTicketsTable = () => <StaticTable label="未結案的單" columns={openColumns} data={OPEN_TICKETS} />

// ── 報告 ─────────────────────────────────────────────────────────────────────
export const REPORT = {
  title: `${TEAM}週報：${PERIOD.label}`,
  fileName: `k8s-platform-weekly-${PERIOD.from.replaceAll('/', '')}.html`,
}
/** 劇本跑完後收進側欄 Artifacts 的那一筆(2026-11-04 user:Artifacts 承載代理產出的草稿產物) */
export const WEEKLY_REPORT_ARTIFACT: ArtifactItem = {
  id: 'a-weekly',
  name: REPORT.title,
  fileName: REPORT.fileName,
  type: 'HTML',
  conversationId: 'script',
  updated: '2026/10/30 09:40 AM',
}

const chartConfig = {
  tickets: { label: '上週', color: 'var(--chart-1)' },
  prevTickets: { label: '前一週', color: 'var(--chart-2)' },
} satisfies ChartConfig

/** 右側面板窄 → 4:3 才不會扁;下載的文件(880 寬)用 ChartContainer 預設 16:9(chart.spec.md「高度決定」) */
function CategoryChart({ doc }: { doc?: boolean }) {
  return (
    <ChartContainer config={chartConfig} className={doc ? undefined : 'aspect-[4/3]'}>
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

/** 報告本文(右側預覽與下載共用同一份) */
function ReportBody({ doc }: { doc?: boolean }) {
  return (
    <>
      <h2 className="text-h3 font-semibold">{REPORT.title}</h2>
      <DescriptionList orientation="horizontal">
        <DescriptionItem label="期間">{PERIOD.label}（與前一週 {PREV_PERIOD.label} 比較）</DescriptionItem>
        <DescriptionItem label="團隊">{TEAM}</DescriptionItem>
        <DescriptionItem label="整理">AI agent（資料來源：IT Service Desk 工單）</DescriptionItem>
      </DescriptionList>
      <h3 className="text-h4 font-semibold">摘要</h3>
      <ComparisonTable />
      <h3 className="text-h4 font-semibold">問題類型</h3>
      <CategoryChart doc={doc} />
      <CategoryTable />
      <h3 className="text-h4 font-semibold">未結案的單</h3>
      <OpenTicketsTable />
      <h3 className="text-h4 font-semibold">觀察</h3>
      <ul className="flex list-disc flex-col gap-1 ps-[var(--layout-space-loose)] text-body">
        {OBSERVATIONS.map((o) => <li key={o}>{o}</li>)}
      </ul>
    </>
  )
}

const BODY_CLASS = 'flex flex-col gap-[var(--layout-space-loose)] p-[var(--layout-space-loose)]'
/**
 * 下載 / 新分頁的文件寬(2026-11-04 user:預覽太窄、下載後表格字被截斷,週報無法報告)= 對話欄寬上限 880(TAgentPage COLUMN_MAX_WIDTH 同值)。
 * 不照右側面板當下的寬:另外在畫面外用這個寬畫一份,再連同頁面樣式包成獨立 HTML。
 * 不做隨視窗縮放:下載後是靜態檔,DataTable 欄寬與圖表 SVG 是程式量出來的,檔案裡不會重算。
 */
const DOC_WIDTH = 880

async function renderStandaloneHtml() {
  const host = document.createElement('div')
  host.style.cssText = `position:fixed;left:-10000px;top:0;width:${DOC_WIDTH}px`
  host.className = 'bg-canvas text-foreground'
  document.body.appendChild(host)
  const root = createRoot(host)
  // 另一個 React root,拿不到 app 的 Provider → 補上同一組 TooltipProvider(main.tsx 同值;DataTable 截斷提示要用)
  flushSync(() => root.render(<TooltipProvider delayDuration={500} skipDelayDuration={300}><div className={BODY_CLASS}><ReportBody doc /></div></TooltipProvider>))
  // 等 DataTable 量欄寬、圖表量容器(ResizeObserver)畫完
  await new Promise((r) => setTimeout(r, 400))
  const html = host.innerHTML
  root.unmount()
  host.remove()
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
<body class="bg-canvas text-foreground"><main style="max-width:${DOC_WIDTH}px;margin:0 auto">${html}</main></body>
</html>`
}

export function ReportPreview() {
  const blobUrl = async () => URL.createObjectURL(new Blob([await renderStandaloneHtml()], { type: 'text/html' }))
  const download = async () => saveFile(REPORT.fileName, await renderStandaloneHtml(), 'text/html')
  const openInNewTab = async () => {
    // 先開分頁再填網址:等報告畫完才 window.open 會被瀏覽器當成彈出視窗擋掉
    const tab = window.open('', '_blank')
    const url = await blobUrl()
    if (tab) tab.location.href = url
  }
  return (
    <div className={BODY_CLASS}>
      <AsideHeaderActions deps="report">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="text" size="sm" iconOnly startIcon={Download} aria-label="Download" title="" onClick={() => void download()} />
          </TooltipTrigger>
          <TooltipContent>Download</TooltipContent>
        </Tooltip>
        {/* artifact 框不允許開新分頁 → 在框裡不顯示這顆(只留 Download) */}
        {!inArtifactViewer() && <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="text" size="sm" iconOnly startIcon={ExternalLink} aria-label="Open in new tab" title="" onClick={() => void openInNewTab()} />
          </TooltipTrigger>
          <TooltipContent>Open in new tab</TooltipContent>
        </Tooltip>}
        <ButtonDivider />
      </AsideHeaderActions>
      <ReportBody />
    </div>
  )
}
