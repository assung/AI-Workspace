// 管理者劇本(2026-11-03 user):管理者一問一答問上週的報案數、結案數與占比、未結案數、問題類型排序,
// 再請代理整理成 HTML 報告拿去報告用。user 確認:1 A(Kenji,K8s 平台團隊)、2 數字照提案、3 加上跟前一週比較、
// 4 圖放在報告裡、5 報告開在右側面板 + 觀察也放。
// 台詞是 AI 起草的示範內容;數字全部從 teamStats.ts 算,台詞不另寫數字。
import { type TAgentScript } from './TAgent'
import { TicketLink } from './TAgent'
import { CategoryTable, ComparisonTable, OpenTicketsTable, ReportFileCard } from './managerReport'
import { CATEGORIES, PERIOD, PREV_PERIOD, TEAM, TOTALS, closeRate, pct, prevCloseRate } from './teamStats'

const open = TOTALS.tickets - TOTALS.closed
const top = CATEGORIES[0]
const oldest = 'SD-2276'

const S1 = `上週（${PERIOD.label}）${TEAM}總共收到 ${TOTALS.tickets} 張單：已結案 ${TOTALS.closed} 張，占 ${pct(TOTALS.closed, TOTALS.tickets)}；還有 ${open} 張沒結案。`
const S2 = `比前一週（${PREV_PERIOD.label}）多 ${TOTALS.tickets - TOTALS.prevTickets} 張，結案率低 ${(prevCloseRate - closeRate).toFixed(1)} 個百分點：`
const S3 = `依件數排序如下。${top.category}最多，比前一週多了 ${top.tickets - top.prevTickets} 張：`
const S4 = `依開單時間排序，最久的是 #${oldest}，已經開了 11 天：`
const S5 = '報告整理好了，右側可以預覽，也可以下載成 HTML 檔。內容有：與前一週的比較、問題類型分布圖、未結案清單，以及 3 點觀察。'

/** 報告那一步的索引(第 10 步;代理回完 → 右側自動打開報告,TAgentPage) */
export const REPORT_STEP = 9

export const MANAGER_SCRIPT: TAgentScript = {
  title: 'K8s 平台團隊上週的單',
  steps: [
    { who: 'user', text: '上週我們團隊總共收到幾張單？結案幾張、占多少？還有幾張沒結？' },
    {
      who: 'agent',
      steps: [`查詢 ${TEAM} ${PERIOD.label} 的單`, '計算結案數與結案率'],
      copyText: S1,
      body: <p className="mt-2">{S1}</p>,
    },
    { who: 'user', text: '跟前一週比呢？' },
    {
      who: 'agent',
      steps: ['查詢 2026/10/12–10/18 的單', '比對兩週的數字'],
      copyText: S2,
      body: (
        <>
          <p className="mt-2">{S2}</p>
          <div className="mt-2"><ComparisonTable /></div>
        </>
      ),
    },
    // 2026-11-04 user 改句:「這 42 張的報案類型依照件數排序」
    { who: 'user', text: `這 ${TOTALS.tickets} 張的報案類型依照件數排序` },
    {
      who: 'agent',
      steps: ['依問題類型分組', '依件數排序'],
      copyText: S3,
      body: (
        <>
          <p className="mt-2">{S3}</p>
          <div className="mt-2"><CategoryTable /></div>
        </>
      ),
    },
    { who: 'user', text: `還沒結的 ${open} 張是哪些？` },
    {
      who: 'agent',
      steps: ['篩選未結案的單', '依開單時間排序'],
      copyText: S4,
      body: (
        <>
          <p className="mt-2">依開單時間排序，最久的是 <TicketLink id={oldest} />，已經開了 11 天：</p>
          <div className="mt-2"><OpenTicketsTable /></div>
        </>
      ),
    },
    { who: 'user', text: '幫我把這些整理成一份 HTML 報告，我要拿去週會報告。' },
    {
      who: 'agent',
      steps: ['整理上週與前一週的數字', '畫問題類型分布圖', '寫觀察重點', '產生 HTML 報告'],
      copyText: S5,
      body: (
        <>
          <p className="mt-2">{S5}</p>
          <ReportFileCard />
        </>
      ),
    },
  ],
}
