// 工單(右側面板預覽;2026-10-30 user:值班者視角點單號 → 右側面板看單子)。
// 面板做法同文章預覽(Claude artifact 式:開在對話右側、× 關閉、操作鈕在頂列 × 左邊 —— 見 articles.tsx / AsideHeaderActions.tsx)。
//
// ── 消費的 SSOT ──────────────────────────────────────────────────────────────
// - 欄位 = DS DescriptionList horizontal + divided(description-list「訂單詳情 / 檔案資訊」型的 metadata 列;key 長度不一 → divided 對齊)
// - 狀態 = DS Tag + 色(badge.spec.md「狀態描述 → Tag + 色彩,不用 Badge」)。配色對照 Atlassian Lozenge 的語意:
//   neutral = 一般 / 草稿、information = 進行中、warning = 需要留意、success = 完成
//   (developer.atlassian.com/platform/forge/ui-kit/components/lozenge)→ New 灰、In progress 藍、
//   Waiting for requester 黃(等別人回覆,需要留意;tag.spec.md yellow「常用於注意類」)、Closed 綠。
// - 段落標題 / 條列 / 字級 = articles.tsx 同一組(text-h4、list utilities、text-body)
// 單子內容跟著劇本走(SD-2318 / SD-2320 的狀態、負責人、活動紀錄 = engine.scriptPos;各身分的劇本步數不同,里程碑由 personas.tsx 給)。
import { Button, ButtonDivider, DescriptionItem, DescriptionList, Tag, Tooltip, TooltipContent, TooltipTrigger } from '@qijenchen/design-system'
import { ExternalLink } from 'lucide-react'
import { AsideHeaderActions } from './AsideHeaderActions'
import type { TicketMilestones } from './oncallScript'
import { whatHappenedItems, type TicketDraft } from './ticketDraft'

type Status = 'New' | 'In progress' | 'Waiting for requester' | 'Closed'
const STATUS_COLOR: Record<Status, 'neutral' | 'blue' | 'yellow' | 'green'> = {
  New: 'neutral',
  'In progress': 'blue',
  'Waiting for requester': 'yellow',
  Closed: 'green',
}

export type Ticket = {
  id: string
  title: string
  status: Status
  priority: string
  requester: string
  assignee: string
  team: string
  created: string
  environment?: string
  category?: string
  service?: string
  summary: Array<{ label?: string; text: string }>
  /** 報案者送出的 What happened 是有順序的經過 → 編號清單 */
  summaryOrdered?: boolean
  linked?: string[]
  activity: Array<{ time: string; text: string }>
}

// 日期格式 YYYY/MM/DD hh:mm AM/PM(本專案慣例)
const TODAY = '2026/10/30'

/** 單子目前的樣子;`pos` = 這個身分的劇本進度(還沒開始 = 0),`M` = 這份劇本的里程碑 */
export function getTicket(id: string, pos: number, M: TicketMilestones, created?: TicketDraft | null): Ticket | undefined {
  const done = (step: number) => pos > step
  if (id === 'SD-2318') {
    // 申請人自己按 Submit 送出的單:Title 與 What happened 照草稿(使用者改過的內容);其他欄位由 Service Desk 判斷,不受草稿影響
    const fromDraft = created
      ? { title: created.title, summary: whatHappenedItems(created.whatHappened).map((text) => ({ text })), summaryOrdered: true }
      : null
    const status: Status = done(M.closed) ? 'Closed' : done(M.replied) ? 'Waiting for requester' : done(M.assigned) ? 'In progress' : 'New'
    return {
      id,
      title: fromDraft?.title ?? 'payments-api 在 staging 拉不到映像檔（ImagePullBackOff）',
      status,
      priority: 'P2',
      requester: 'Aaron',
      assignee: done(M.assigned) ? 'Bob' : 'Unassigned',
      team: 'K8s 平台團隊',
      category: 'Kubernetes & deployments',
      service: 'payments-api',
      created: `${TODAY} 10:42 AM`,
      environment: 'stg-cluster-02 / payment-stg',
      // 申請人那邊代理開單前的摘要(tagentScripts.tsx 第 6 步)逐字;申請人自己建的單照草稿
      summaryOrdered: fromDraft?.summaryOrdered,
      summary: fromDraft?.summary ?? [
        { label: '問題', text: 'payments-api 在 staging 拉不到映像檔（unauthorized），已重新同步 pull secret，無效。' },
        { label: '影響', text: 'Payments 團隊的 staging 部署被阻斷。' },
      ],
      linked: done(M.followUpOpened) ? ['SD-2320'] : undefined,
      activity: [
        { time: '10:42 AM', text: 'AI agent opened the ticket for Aaron' },
        ...(done(M.assigned) ? [{ time: '10:44 AM', text: 'Assigned to Bob · Aaron was notified' }] : []),
        ...(done(M.reenabled) ? [{ time: '10:47 AM', text: 'Bob re-enabled robot$payments-ci' }] : []),
        ...(done(M.replied) ? [{ time: '10:48 AM', text: 'Bob replied to Aaron · waiting for confirmation' }] : []),
        ...(done(M.closed) ? [{ time: '10:51 AM', text: 'Closed · Aaron confirmed the pod is running' }] : []),
      ],
    }
  }
  if (id === 'SD-2320' && done(M.followUpOpened)) {
    return {
      id,
      title: '金鑰輪替後檢查 robot account 狀態',
      status: 'New',
      priority: 'P3',
      requester: 'Bob',
      assignee: 'Unassigned',
      team: 'K8s 平台團隊',
      created: `${TODAY} 10:52 AM`,
      summary: [{ text: '把 registry robot account 加進金鑰輪替的檢查清單，避免輪替後帳號被停用、部署拉不到映像檔。' }],
      linked: ['SD-2318'],
      activity: [{ time: '10:52 AM', text: 'AI agent opened the ticket for Bob' }],
    }
  }
  if (id === 'SD-2311') {
    return {
      id,
      title: 'search-api namespace 資源配額調整',
      status: 'New',
      priority: 'P3',
      requester: 'Mei',
      assignee: 'Unassigned',
      team: 'K8s 平台團隊',
      created: '2026/10/29 03:18 PM',
      environment: 'stg-cluster-01 / search-stg',
      summary: [{ text: '下週壓力測試需要把 search-api 的 CPU 上限從 8 核調到 12 核。目前尖峰用量約 6.5 核。' }],
      activity: [{ time: '2026/10/29 03:18 PM', text: 'AI agent opened the ticket for Mei' }],
    }
  }
  if (id === 'SD-2305') {
    return {
      id,
      title: 'stg-cluster-01 節點磁碟用量 85%',
      status: 'New',
      priority: 'P3',
      requester: 'Monitoring alert',
      assignee: 'Unassigned',
      team: 'K8s 平台團隊',
      created: '2026/10/28 09:05 AM',
      environment: 'stg-cluster-01',
      summary: [{ text: 'stg-01-w3 節點的映像檔沒有被回收，佔用 62 GB。該節點群組關閉了 image GC。' }],
      activity: [{ time: '2026/10/28 09:05 AM', text: 'Opened from a monitoring alert' }],
    }
  }
  return undefined
}

/** 右側面板的單子內容(標題列 = 單號,這裡從單子標題開始;內距 = 文章預覽同值 loose) */
export function TicketPreview({ ticket }: { ticket: Ticket }) {
  return (
    <div className="flex flex-col gap-[var(--layout-space-loose)] p-[var(--layout-space-loose)]">
      <AsideHeaderActions deps={ticket.id}>
        <Tooltip>
          <TooltipTrigger asChild>
            {/* 同文章預覽的「Open in new tab」:假連結(同 TicketLink),接上 Service Desk 後開單子網址 */}
            <Button variant="text" size="sm" iconOnly startIcon={ExternalLink} aria-label="Open in Service Desk" title="" onClick={() => {}} />
          </TooltipTrigger>
          <TooltipContent>Open in Service Desk</TooltipContent>
        </Tooltip>
        <ButtonDivider />
      </AsideHeaderActions>
      <h2 className="text-h4 font-semibold">{ticket.title}</h2>
      <DescriptionList orientation="horizontal" divided>
        <DescriptionItem label="Status">
          <Tag size="sm" color={STATUS_COLOR[ticket.status]}>{ticket.status}</Tag>
        </DescriptionItem>
        <DescriptionItem label="Priority">{ticket.priority}</DescriptionItem>
        <DescriptionItem label="Requester">{ticket.requester}</DescriptionItem>
        <DescriptionItem label="Assignee">{ticket.assignee}</DescriptionItem>
        <DescriptionItem label="Team">{ticket.team}</DescriptionItem>
        {ticket.category && <DescriptionItem label="Category">{ticket.category}</DescriptionItem>}
        {ticket.service && <DescriptionItem label="Service">{ticket.service}</DescriptionItem>}
        {ticket.environment && <DescriptionItem label="Environment">{ticket.environment}</DescriptionItem>}
        <DescriptionItem label="Created">{ticket.created}</DescriptionItem>
        {ticket.linked && <DescriptionItem label="Linked">{ticket.linked.map((l) => `#${l}`).join(', ')}</DescriptionItem>}
      </DescriptionList>
      <h2 className="text-h4 font-semibold">Summary</h2>
      {(() => {
        const items = (
          <>
                {ticket.summary.map((s) => (
                  <li key={s.text}>{s.label ? <><strong>{s.label}：</strong>{s.text}</> : s.text}</li>
                ))}
          </>
        )
        // 報案者送出的經過有順序 → 編號(同 articles.tsx 的 ol 樣式);其他單子條列
        return ticket.summaryOrdered
          ? <ol className="flex list-decimal flex-col gap-1 ps-[var(--layout-space-loose)] text-body">{items}</ol>
          : <ul className="flex list-disc flex-col gap-1 ps-[var(--layout-space-loose)] text-body">{items}</ul>
      })()}
      <h2 className="text-h4 font-semibold">Activity</h2>
      {/* 依時間先後(與對話同方向,由上往下讀) */}
      <DescriptionList>
        {ticket.activity.map((a) => (
          <DescriptionItem key={a.text} label={a.time}>{a.text}</DescriptionItem>
        ))}
      </DescriptionList>
    </div>
  )
}
