// 管理者劇本的資料(2026-11-03 user:第四種劇本「管理者」;1 A = Kenji,K8s 平台團隊主管,只看這個團隊的單)。
// 期間:上週 = 2026/10/19(一)–10/25(日),前一週 = 10/12–10/18(user 同意「照你目前提的」)。
// 數字是示範資料(AI 擬定、user 同意):上週 42 張 / 結案 35 / 83.3% / 未結 7;前一週 36 / 31 / 86.1% / 5。
// 這支只放資料;對話裡的表格、報告、單子詳情都從這裡讀,數字只寫一次。

export const PERIOD = { label: '2026/10/19–10/25', from: '2026/10/19', to: '2026/10/25' }
export const PREV_PERIOD = { label: '2026/10/12–10/18', from: '2026/10/12', to: '2026/10/18' }
export const TEAM = 'K8s 平台團隊'

export type CategoryStat = { category: string; tickets: number; closed: number; prevTickets: number }

/** 依上週件數排序(多 → 少) */
export const CATEGORIES: CategoryStat[] = [
  { category: 'Registry 與映像檔', tickets: 12, closed: 9, prevTickets: 5 },
  { category: '部署與 Argo CD', tickets: 9, closed: 8, prevTickets: 10 },
  { category: '資源配額', tickets: 7, closed: 5, prevTickets: 6 },
  { category: '存取權限', tickets: 6, closed: 6, prevTickets: 7 },
  { category: 'Ingress 與網路', tickets: 5, closed: 4, prevTickets: 5 },
  { category: '節點與儲存', tickets: 3, closed: 3, prevTickets: 3 },
]

const sum = (f: (c: CategoryStat) => number) => CATEGORIES.reduce((n, c) => n + f(c), 0)
export const TOTALS = {
  tickets: sum((c) => c.tickets),
  closed: sum((c) => c.closed),
  prevTickets: sum((c) => c.prevTickets),
  /** 前一週的結案數(只有總數,不分類型) */
  prevClosed: 31,
}

export const pct = (n: number, d: number) => `${((n / d) * 100).toFixed(1)}%`
export const closeRate = (TOTALS.closed / TOTALS.tickets) * 100
export const prevCloseRate = (TOTALS.prevClosed / TOTALS.prevTickets) * 100
const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0')

/** 「跟前一週比」的表格列 */
export const COMPARISON = [
  { metric: '總報案數', current: `${TOTALS.tickets}`, prev: `${TOTALS.prevTickets}`, change: signed(TOTALS.tickets - TOTALS.prevTickets) },
  { metric: '已結案', current: `${TOTALS.closed}`, prev: `${TOTALS.prevClosed}`, change: signed(TOTALS.closed - TOTALS.prevClosed) },
  {
    metric: '結案率',
    current: pct(TOTALS.closed, TOTALS.tickets),
    prev: pct(TOTALS.prevClosed, TOTALS.prevTickets),
    change: `${closeRate - prevCloseRate < 0 ? '−' : '+'}${Math.abs(closeRate - prevCloseRate).toFixed(1)} 個百分點`,
  },
  {
    metric: '未結案',
    current: `${TOTALS.tickets - TOTALS.closed}`,
    prev: `${TOTALS.prevTickets - TOTALS.prevClosed}`,
    change: signed(TOTALS.tickets - TOTALS.closed - (TOTALS.prevTickets - TOTALS.prevClosed)),
  },
]

export type OpenTicket = {
  id: string
  title: string
  category: string
  assignee: string
  requester: string
  /** 開單時間(YYYY/MM/DD hh:mm AM/PM) */
  created: string
  /** 到今天(2026/10/30)已開幾天 */
  ageDays: number
  /** 指派時間 */
  assigned: string
  status: 'In progress' | 'Waiting for requester'
  /** 等申請人回覆的起點(status = Waiting for requester 才有) */
  waitingSince?: string
  summary: string
}

/** 上週開、到今天還沒結的 7 張(依開單時間,最久的在前) */
export const OPEN_TICKETS: OpenTicket[] = [
  { id: 'SD-2276', title: 'Harbor 複寫到 dr-registry 失敗', category: 'Registry 與映像檔', assignee: 'Bob', requester: 'Monitoring alert', created: '2026/10/19 09:12 AM', ageDays: 11, assigned: '2026/10/19 09:30 AM', status: 'In progress', summary: 'prod-registry 複寫到災備的 dr-registry 每晚失敗，最近一次成功是 10/18。災備站目前缺 3 天的映像檔。' },
  { id: 'SD-2279', title: 'data-pipeline namespace GPU 配額申請', category: '資源配額', assignee: 'Lena', requester: 'Daniel', created: '2026/10/20 02:40 PM', ageDays: 10, assigned: '2026/10/20 03:05 PM', status: 'Waiting for requester', waitingSince: '2026/10/21 10:20 AM', summary: '申請在 data-pipeline 加 4 張 GPU 給模型訓練用；已請申請人補上預估用量與使用期間。' },
  { id: 'SD-2281', title: '映像檔弱點掃描一直卡在 Pending', category: 'Registry 與映像檔', assignee: 'Wei', requester: 'Sofia', created: '2026/10/21 11:05 AM', ageDays: 9, assigned: '2026/10/21 11:20 AM', status: 'In progress', summary: 'Harbor 的弱點掃描工作排隊後不會開始，CI 等掃描結果逾時，影響 3 個團隊的發版。' },
  { id: 'SD-2284', title: 'Argo CD 同步 checkout-web 一直 OutOfSync', category: '部署與 Argo CD', assignee: 'Wei', requester: 'Ken', created: '2026/10/22 10:30 AM', ageDays: 8, assigned: '2026/10/22 10:45 AM', status: 'In progress', summary: '同步成功後幾分鐘又變回 OutOfSync，差異在 HPA 的 replicas 欄位。' },
  { id: 'SD-2288', title: 'orders-api 拉 base image 逾時', category: 'Registry 與映像檔', assignee: 'Bob', requester: 'Priya', created: '2026/10/23 04:18 PM', ageDays: 7, assigned: '2026/10/23 04:40 PM', status: 'In progress', summary: 'stg-cluster-01 拉 base image 時偶爾逾時（約 1 成），重試後才成功。' },
  { id: 'SD-2290', title: 'notification-svc 記憶體上限調整', category: '資源配額', assignee: 'Lena', requester: 'Marco', created: '2026/10/23 05:02 PM', ageDays: 7, assigned: '2026/10/24 09:10 AM', status: 'Waiting for requester', waitingSince: '2026/10/24 02:15 PM', summary: '申請把 notification-svc 的記憶體上限從 512 Mi 調到 1 Gi；已請申請人提供最近的 OOMKilled 紀錄。' },
  { id: 'SD-2293', title: 'internal-api ingress 間歇 504', category: 'Ingress 與網路', assignee: 'Bob', requester: 'Mei', created: '2026/10/24 10:47 AM', ageDays: 6, assigned: '2026/10/24 11:00 AM', status: 'In progress', summary: '尖峰時段 internal-api 約有 2% 的請求回 504，懷疑是上游逾時設定太短。' },
]

/** 報告的觀察(代理寫的;數字都從上面算出來) */
export const OBSERVATIONS = [
  `報案量比前一週多 ${TOTALS.tickets - TOTALS.prevTickets} 張，增加主要來自 Registry 與映像檔（${CATEGORIES[0].prevTickets} → ${CATEGORIES[0].tickets} 張）。`,
  `結案率 ${pct(TOTALS.closed, TOTALS.tickets)}，比前一週低 ${(prevCloseRate - closeRate).toFixed(1)} 個百分點；未結案的 ${TOTALS.tickets - TOTALS.closed} 張中，有 3 張是 Registry 與映像檔。`,
  '最久的 #SD-2276（Harbor 複寫失敗）已開 11 天，災備站缺了 3 天的映像檔，建議優先處理。',
]
