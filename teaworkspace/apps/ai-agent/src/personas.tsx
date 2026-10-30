// Demo 身分(2026-10-30 user 選 A:同一個 app / artifact,網址 `#oncall` = 值班者 Bob,沒有 hash = 申請人)。
// 每個身分各有:問候名字、首頁說明與建議、側欄示範對話、Projects / Artifacts、劇本、能不能在右側面板看單子。
import type { ReactNode } from 'react'
import type { TAgentConversation, TAgentScript, TAgentTurn } from './TAgent'
import { K8S_IMAGEPULL_SCRIPT } from './tagentScripts'
import { ONCALL_SCRIPT } from './oncallScript'

/** `conversationIds` = 屬於這個專案的對話;Name 連到其中最近一則 */
export type Project = { id: string; name: string; description: string; conversationIds: string[]; updated: string }
export type Artifact = { id: string; name: string; type: string; conversationId: string; updated: string }

export type Persona = {
  id: 'requester' | 'oncall'
  /** 首頁問候用的名字 */
  userName: string
  homeDescription: string
  /** 新對話首頁的建議(Chip assist;點了填入輸入盒) */
  suggestions: string[]
  seed: () => TAgentConversation[]
  projects: Project[]
  artifacts: Artifact[]
  script: TAgentScript
  /** 單號點了在右側面板看單子(2026-10-30 user:值班者視角;申請人視角維持假連結) */
  ticketPanel: boolean
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

// 日期格式 YYYY/MM/DD hh:mm AM/PM(本專案慣例)

// ── 申請人(Aaron;2026-10-30 user 同意把品茶示範換成 IT 主題)────────────────────
export const REQUESTER: Persona = {
  id: 'requester',
  userName: 'Aaron',
  homeDescription: 'Tell me what’s broken. Paste an error or a link, and I’ll look into it or open a ticket for you.',
  suggestions: ['My deploy is stuck on staging', 'Request access to a repository', 'Check the status of my ticket'],
  script: K8S_IMAGEPULL_SCRIPT,
  ticketPanel: false,
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
  projects: [
    { id: 'p-laptop', name: 'New laptop setup', description: 'MFA, Wi-Fi certificate and VPN on the new MacBook', conversationIds: ['c-okta', 'c-wifi', 'c-vpn'], updated: '2026/10/29 05:40 PM' },
    { id: 'p-billing', name: 'Invoice export project', description: 'Repository access and staging environment for billing-service', conversationIds: ['c-repo'], updated: '2026/10/27 11:15 AM' },
  ],
  artifacts: [
    { id: 'a-vpn', name: 'GlobalProtect 6.2.5 update steps', type: 'Doc', conversationId: 'c-vpn', updated: '2026/10/29 05:32 PM' },
    { id: 'a-access', name: 'billing-service access request AR-5170', type: 'Request', conversationId: 'c-repo', updated: '2026/10/27 11:12 AM' },
    { id: 'a-wifi', name: 'Wi-Fi certificate renewal checklist', type: 'Doc', conversationId: 'c-wifi', updated: '2026/10/24 09:05 AM' },
  ],
}

// ── 值班者(Bob,K8s 平台團隊;2026-10-30 user:「以值班者角度的 user journey demo」)──────────
export const ONCALL: Persona = {
  id: 'oncall',
  userName: 'Bob',
  homeDescription: 'Ask about your queue, a ticket, or a cluster. I’ll pull the context together for you.',
  suggestions: ['Which tickets are close to their SLA?', 'Summarize last night’s alerts', 'Show tickets waiting on me'],
  script: ONCALL_SCRIPT,
  ticketPanel: true,
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
  projects: [
    { id: 'p-week44', name: 'On-call week 44', description: 'Queue, alerts and handover for this on-call week', conversationIds: ['c-disk', 'c-quota', 'c-ingress'], updated: '2026/10/30 09:12 AM' },
    { id: 'p-rotation', name: 'Registry key rotation', description: 'Rotation schedule, runbook and post-rotation checks', conversationIds: ['c-rotation'], updated: '2026/10/29 06:20 PM' },
  ],
  artifacts: [
    { id: 'a-handover', name: 'On-call handover notes, week 44', type: 'Doc', conversationId: 'c-disk', updated: '2026/10/30 09:10 AM' },
    { id: 'a-ingress', name: 'Ingress 502 incident timeline', type: 'Doc', conversationId: 'c-ingress', updated: '2026/10/24 04:35 PM' },
  ],
}

export const personaFromHash = (hash: string): Persona => (hash === '#oncall' ? ONCALL : REQUESTER)
