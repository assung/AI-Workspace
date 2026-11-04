// Demo 身分(2026-10-30 user 選 A:同一個 app / artifact,用網址 hash 切換):
//   沒有 hash = 申請人 Aaron;`#oncall` = 值班者 Bob「人找事」(開口問隊列);`#oncall-updates` = Bob「事找人」(Updates 主動通知新單);
//   `#manager` = 管理者 Kenji(K8s 平台團隊主管,問上週的數字 → HTML 週報;2026-11-03 user)。
// 每個身分各有:問候名字、首頁說明與建議、側欄示範對話、Updates 訊息、劇本與單子里程碑。
// Projects / Artifacts 拿掉(2026-10-30 user)。
import type { ReactNode } from 'react'
import { TicketLink, type TAgentConversation, type TAgentScript, type TAgentTurn, type TAgentUpdate } from './TAgent'
import { K8S_IMAGEPULL_SCRIPT } from './tagentScripts'
import { NEW_TICKET_UPDATE, ONCALL_MILESTONES, ONCALL_SCRIPT, ONCALL_UPDATES_MILESTONES, ONCALL_UPDATES_SCRIPT, type TicketMilestones } from './oncallScript'
import { OpenConversationButton } from './updates'
import { MANAGER_SCRIPT } from './managerScript'
import { WEEKLY_REPORT_ARTIFACT } from './managerReport'
import { MANAGER_ARTIFACTS, ONCALL_ARTIFACTS, REQUESTER_ARTIFACTS, SOP_DRAFT_ARTIFACT, type ArtifactItem } from './artifacts'

export type Persona = {
  id: 'requester' | 'oncall' | 'oncall-updates' | 'manager'
  /**
   * 側欄頂端產品名稱後的情境標籤(2026-11-03 user:「方便 demo 時展示不易搞混」;DS Tag,報案者綠、值班者藍)。
   * 文字用中文、值班者分兩種情境(2026-11-03 user:「值班者 (人找事)」/「值班者 (事找人)」)。
   */
  role: { label: string; color: 'green' | 'blue' | 'purple' }
  /** 首頁問候用的名字 */
  userName: string
  homeDescription: string
  /** 新對話首頁的建議(Chip assist;點了填入輸入盒) */
  suggestions: string[]
  seed: () => TAgentConversation[]
  /** Updates 一開始就有的訊息 */
  updatesSeed: () => TAgentTurn[]
  /** 打開 demo 後隔多久自動發到 Updates 的訊息(事找人的觸發點) */
  liveUpdates?: Array<TAgentUpdate & { afterMs: number }>
  script: TAgentScript
  /** 劇本各步對單子狀態的影響(右側面板的單子跟著變) */
  milestones: TicketMilestones
  /** 側欄 Artifacts 一開始就有的(2026-11-04 user) */
  artifacts: ArtifactItem[]
  /** 劇本跑完後代理產出的那一筆:收進 Artifacts、右側自動打開一次 */
  scriptArtifact?: ArtifactItem
}

const agent = (id: string, steps: string[], text: ReactNode, copyText: string): TAgentTurn => ({
  kind: 'agent',
  id,
  thinking: false,
  steps,
  copyText,
  body: <p className="mt-2">{text}</p>,
})
const user = (id: string, text: string): TAgentTurn => ({ kind: 'user', id, text, attachments: [] })
const said = (id: string, steps: string[], text: string) => agent(id, steps, text, text)
/** Updates 訊息:時間 + 內文 + 動作(Updates 的語言 = demo 劇本的語言,中文) */
const update = (id: string, time: string, text: ReactNode, copyText: string, action?: ReactNode): TAgentTurn => ({
  kind: 'agent',
  id,
  thinking: false,
  steps: [],
  copyText,
  time,
  body: (
    <>
      <p>{text}</p>
      {action}
    </>
  ),
})

// 日期格式 YYYY/MM/DD hh:mm AM/PM(本專案慣例)

// ── 申請人(Aaron;2026-10-30 user 同意把品茶示範換成 IT 主題)────────────────────
export const REQUESTER: Persona = {
  id: 'requester',
  role: { label: '報案者', color: 'green' },
  userName: 'Aaron',
  homeDescription: 'Tell me what’s broken. Paste an error or a link, and I’ll look into it or open a ticket for you.',
  suggestions: ['My deploy is stuck on staging', 'Request access to a repository', 'Check the status of my ticket'],
  script: K8S_IMAGEPULL_SCRIPT,
  // 申請人劇本(步驟索引從 0):8 = Bob 接手 → 指派;9 = 已處理 → 重新啟用 + 回覆;11 = 結案;沒有後續單
  // (2026-11-03 加了「代理反問要不要開單 / 使用者答好」兩步;2026-11-04 user 選 A 又拿掉、和整理草稿合成一步,索引往前 2)
  milestones: { assigned: 8, reenabled: 9, replied: 9, closed: 11, followUpOpened: Infinity },
  artifacts: REQUESTER_ARTIFACTS,
  updatesSeed: () => [
    update('u-ar', '2026/10/29 04:10 PM', 'Priya 核准了你的權限申請 AR-5170，你現在有 billing-service 的寫入權限。',
      'Priya 核准了你的權限申請 AR-5170，你現在有 billing-service 的寫入權限。', <OpenConversationButton conversationId="c-repo" />),
    update('u-gp', '09:00 AM', 'Self Service 已經有 GlobalProtect 6.2.5，更新後就能解決 VPN 斷線。',
      'Self Service 已經有 GlobalProtect 6.2.5，更新後就能解決 VPN 斷線。', <OpenConversationButton conversationId="c-vpn" />),
  ],
  seed: () => [
    {
      id: 'c-vpn',
      title: 'VPN drops every 30 minutes',
      pinned: true,
      turns: [
        user('v1', 'My VPN drops every 30 minutes since the macOS 15.4 update.'),
        said('v2', ['Checked your GlobalProtect client version', 'Searched IT known issues'],
          'This matches a known issue with GlobalProtect 6.2.3 on macOS 15.4. Updating to 6.2.5 from Self Service fixes it. Want me to open a ticket if it keeps dropping after the update?'),
      ],
    },
    {
      id: 'c-repo',
      title: 'Request access to the billing-service repo',
      turns: [
        user('r1', 'I need write access to the billing-service repo for the invoice export work.'),
        said('r2', ['Looked up the owners of billing-service', 'Created access request AR-5170'],
          'I sent access request AR-5170 to the Billing team owners (Priya and Marco). You’ll get write access as soon as one of them approves it, usually within a working day.'),
      ],
    },
    {
      id: 'c-okta',
      title: 'Reset Okta MFA on a new phone',
      turns: [
        user('o1', 'I got a new phone and Okta Verify no longer works.'),
        said('o2', ['Checked your Okta factors', 'Sent a reset link to your work email'],
          'I reset your Okta Verify factor and sent an enrollment link to your work email. Open it on your laptop and scan the QR code with the new phone.'),
      ],
    },
    {
      id: 'c-wifi',
      title: 'Laptop won’t join the 7F Wi-Fi',
      turns: [
        user('w1', 'My laptop won’t join Corp-WiFi on 7F, but my phone does.'),
        said('w2', ['Checked the device certificate for your laptop', 'Searched IT known issues'],
          'Your laptop’s Wi-Fi certificate expired yesterday. Restart the laptop while it’s on the office ethernet or VPN, and it will renew automatically. Then Corp-WiFi should connect.'),
      ],
    },
  ],
}

/** Bob 的 Updates:晨間摘要 + SLA 提醒(兩條值班情境共用) */
function ONCALL_UPDATES_SEED(): TAgentTurn[] {
  return [
    update('u-morning', '08:30 AM',
      <>早安，Bob。昨晚 stg-cluster-01 有 2 則告警，都已自動恢復。你的隊列還有 2 張單：<TicketLink id="SD-2311" />、<TicketLink id="SD-2305" />。</>,
      '早安，Bob。昨晚 stg-cluster-01 有 2 則告警，都已自動恢復。你的隊列還有 2 張單：#SD-2311、#SD-2305。'),
    update('u-sla', '09:15 AM',
      <>提醒：<TicketLink id="SD-2311" /> 今天 05:00 PM 到 SLA。</>,
      '提醒：#SD-2311 今天 05:00 PM 到 SLA。'),
  ]
}

// ── 值班者(Bob,K8s 平台團隊;2026-10-30 user:「以值班者角度的 user journey demo」)──────────
export const ONCALL: Persona = {
  id: 'oncall',
  role: { label: '值班者 (人找事)', color: 'blue' },
  userName: 'Bob',
  homeDescription: 'Ask about your queue, a ticket, or a cluster. I’ll pull the context together for you.',
  suggestions: ['Which tickets are close to their SLA?', 'Summarize last night’s alerts', 'Show tickets waiting on me'],
  script: ONCALL_SCRIPT,
  milestones: ONCALL_MILESTONES,
  artifacts: ONCALL_ARTIFACTS,
  scriptArtifact: SOP_DRAFT_ARTIFACT,
  updatesSeed: () => ONCALL_UPDATES_SEED(),
  seed: () => [
    {
      id: 'c-rotation',
      title: 'Registry key rotation schedule',
      pinned: true,
      turns: [
        user('k1', 'When is the next registry key rotation?'),
        said('k2', ['Checked the K8s Platform rotation calendar'],
          'Registry keys rotated last night at 02:00 AM. The next rotation is on 2026/11/27 02:00 AM. The runbook is in K8s Platform › Runbooks › Registry key rotation.'),
      ],
    },
    {
      id: 'c-disk',
      title: 'stg-cluster-01 disk usage climbing',
      turns: [
        user('d1', 'Why is disk usage on the stg-cluster-01 nodes climbing?'),
        said('d2', ['Checked node disk usage on stg-cluster-01', 'Checked image GC settings by node pool'],
          'Most of it is container images on stg-01-w3 that were never garbage-collected (62 GB). Image GC is turned off for that node pool. The alert is tracked as SD-2305 in your queue.'),
      ],
    },
    {
      id: 'c-quota',
      title: 'search-api quota request',
      turns: [
        user('q1', 'What exactly did the Search team ask for in their quota request?'),
        said('q2', ['Read SD-2311', 'Checked search-api CPU usage for the last 14 days'],
          'They want the CPU limit for search-api raised from 8 to 12 cores for load testing next week. Peak usage over the last 14 days was 6.5 cores.'),
      ],
    },
    {
      id: 'c-ingress',
      title: 'Ingress 502s on staging last week',
      turns: [
        user('i1', 'What caused the ingress 502s on staging last Thursday?'),
        said('i2', ['Read the incident timeline', 'Checked ingress-nginx restarts'],
          'An ingress-nginx config reload hit a bad annotation on the orders-api ingress, so two controller pods crash-looped for 11 minutes. The annotation was reverted and a lint check was added to the deploy pipeline.'),
      ],
    },
  ],
}

// ── 值班者「事找人」(2026-10-30 user:「一種情境是人找事,另一種情境是事找人」)────────────────────
// 同一個 Bob、同一組示範對話;差在劇本從 Updates 的新單通知開始(5 秒後自動出現)。
export const ONCALL_UPDATES: Persona = {
  ...ONCALL,
  id: 'oncall-updates',
  role: { label: '值班者 (事找人)', color: 'blue' },
  script: ONCALL_UPDATES_SCRIPT,
  milestones: ONCALL_UPDATES_MILESTONES,
  liveUpdates: [NEW_TICKET_UPDATE],
}

// ── 管理者(Kenji,K8s 平台團隊主管;2026-11-03 user 選 A:沿用 SOP 負責人 Kenji,只看這個團隊的單)──────────
// 標籤紫色:綠 / 藍已給報案者 / 值班者(DS Tag 色票,tag.spec.md)。
export const MANAGER: Persona = {
  id: 'manager',
  role: { label: '管理者', color: 'purple' },
  userName: 'Kenji',
  homeDescription: 'Ask about your team’s tickets, trends, or SLAs. I’ll pull the numbers together for you.',
  suggestions: ['How many tickets did we get last week?', 'Which tickets are past their SLA?', 'Who on the team has the most open tickets?'],
  script: MANAGER_SCRIPT,
  // 不影響 SD-2318(管理者劇本沒有這張單的進度)
  milestones: { assigned: Infinity, reenabled: Infinity, replied: Infinity, closed: Infinity, followUpOpened: Infinity },
  artifacts: MANAGER_ARTIFACTS,
  scriptArtifact: WEEKLY_REPORT_ARTIFACT,
  updatesSeed: () => [
    update('u-oncall', '2026/10/29 06:00 PM', '11 月的值班表排好了：第一週是 Bob 和 Wei。', '11 月的值班表排好了：第一週是 Bob 和 Wei。'),
    update('u-morning-k', '08:30 AM',
      <>早安，Kenji。團隊目前有 9 張未結案的單，其中 <TicketLink id="SD-2311" /> 今天 05:00 PM 到 SLA。</>,
      '早安，Kenji。團隊目前有 9 張未結案的單，其中 #SD-2311 今天 05:00 PM 到 SLA。'),
  ],
  seed: () => [
    {
      id: 'c-sla-oct',
      title: 'SLA breaches in October',
      pinned: true,
      turns: [
        user('s1', 'How many of our tickets breached SLA in October so far?'),
        said('s2', ['Checked K8s Platform tickets created since 2026/10/01', 'Compared resolution times with the SLA policy'],
          'Four tickets breached SLA this month, all P3 quota requests that waited on the requester. No P1 or P2 tickets breached.'),
      ],
    },
    {
      id: 'c-rotation-k',
      title: 'On-call rotation for November',
      turns: [
        user('n1', 'Who is on call in the first week of November?'),
        said('n2', ['Read the K8s Platform on-call schedule'],
          'Bob and Wei are on call from 2026/11/02 to 11/08. Lena covers the week after.'),
      ],
    },
    {
      id: 'c-ingress-k',
      title: 'Ingress 502s on staging last week',
      turns: [
        user('g1', 'Give me a one-line summary of the staging ingress 502s last Thursday.'),
        said('g2', ['Read the incident timeline'],
          'A bad annotation on the orders-api ingress crash-looped two ingress-nginx pods for 11 minutes; it was reverted and a lint check now blocks it in the deploy pipeline.'),
      ],
    },
  ],
}

export const personaFromHash = (hash: string): Persona =>
  hash === '#oncall' ? ONCALL : hash === '#oncall-updates' ? ONCALL_UPDATES : hash === '#manager' ? MANAGER : REQUESTER
