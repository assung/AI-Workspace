// 值班者(Bob,K8s 平台團隊)視角的 demo 劇本(2026-10-30 user:「以值班者角度的 user journey demo,由 K8s 團隊的 Bob 的視角展開,
// Bob 在值班時,透過詢問 AI agent 目前待處理的單有哪些,來解這題 payments-api 問題」)。
// 台詞 = AI 起草、user 2026-10-30 確認的劇本;收尾的後續單(第 12–13 步)是 user 同意加的一段。
// 與申請人劇本(tagentScripts.tsx)接得上:第 4 步「通知申請人」= 申請人那邊的「Bob 接手」;第 8 步草稿 = 申請人那邊第 10 步原文。
// 隊列裡的另兩張單、帳號名、時間、namespace 是示範資料。
// 2026-10-30 user:兩條都留 ——「人找事」= ONCALL_SCRIPT(#oncall,Bob 開口問隊列);
// 「事找人」= ONCALL_UPDATES_SCRIPT(#oncall-updates,Updates 主動通知新單 → Work on this ticket 開出帶前情的新對話)。
// 兩條從「先確認一下，還有其他服務用這個帳號嗎？」之後共用同一段(TAIL)。
import type { ReactNode } from 'react'
import { TicketLink, type TAgentScript, type TAgentScriptStep } from './TAgent'
import { OpenConversationButton, UpdateTime, WorkOnTicketButton } from './updates'

/** 主動發的結案通知的間隔(同申請人劇本 UPDATE_GAP_MS 8 秒:讓講者有時間切走,看得到通知與紅點) */
const UPDATE_GAP_MS = 8000

/** 申請人那邊第 10 步原文(這裡是 Bob 送出前的草稿) */
const REQUESTER_UPDATE = '已處理。原因是 registry 的 robot account 在昨晚金鑰輪替後被停用，已重新啟用。請重新部署試試看，問題真的解決了嗎？'

/** 兩條共用的後段(確認帳號 → 重新啟用 → 回覆申請人 → 結案 → 後續單) */
const TAIL: TAgentScriptStep[] = [
    { who: 'user', text: '先確認一下，還有其他服務用這個帳號嗎？' },
    {
      who: 'agent',
      steps: ['查詢使用 robot$payments-ci 的 pull secret'],
      copyText: '只有 payment-stg 和 payment-dev 兩個 namespace 在用。payment-dev 今天還沒有部署，所以還沒出錯。',
      body: <p className="mt-2">只有 payment-stg 和 payment-dev 兩個 namespace 在用。payment-dev 今天還沒有部署，所以還沒出錯。</p>,
    },
    { who: 'user', text: '好，重新啟用。' },
    {
      who: 'agent',
      steps: ['重新啟用 robot$payments-ci', '在 stg-cluster-02 測試拉取 payments/api:1.42.0'],
      copyText: `已重新啟用，並從 stg-cluster-02 測試拉取成功。要我通知申請人重新部署嗎？草稿：「#SD-2318 ${REQUESTER_UPDATE}」`,
      body: (
        <>
          <p className="mt-2">已重新啟用，並從 stg-cluster-02 測試拉取成功。要我通知申請人重新部署嗎？草稿：</p>
          {/* 引用的草稿:左邊線 + 次要字色(apps/chat 決策流程的草稿呈現同款) */}
          <p className="mt-2 border-l border-divider pl-3 text-fg-secondary">
            <TicketLink id="SD-2318" /> {REQUESTER_UPDATE}
          </p>
        </>
      ),
    },
    { who: 'user', text: '送出。' },
    {
      who: 'agent',
      steps: ['更新 SD-2318', '回覆申請人'],
      copyText: '已送出，#SD-2318 改為「待申請人確認」。申請人確認後會自動結案。',
      body: <p className="mt-2">已送出，<TicketLink id="SD-2318" /> 改為「待申請人確認」。申請人確認後會自動結案。</p>,
    },
    {
      who: 'agent',
      afterMs: UPDATE_GAP_MS,
      steps: [],
      // 進度「兩邊都放」:Updates 也發一則(只記紅點,不再跳 Toast)
      update: {
        copyText: '#SD-2318 申請人確認 pod 已經起來，已結案。',
        body: (
          <>
            <UpdateTime>10:51 AM</UpdateTime>
            <p className="mt-1"><TicketLink id="SD-2318" /> 申請人確認 pod 已經起來，已結案。</p>
            <OpenConversationButton conversationId="script" />
          </>
        ),
      },
      copyText:
        '#SD-2318 申請人確認 pod 已經起來，已結案。這次是金鑰輪替後 robot account 被停用造成的，要不要開一張後續單，把 robot account 加進金鑰輪替的檢查清單，避免再發生？',
      body: (
        <p>
          <TicketLink id="SD-2318" /> 申請人確認 pod 已經起來，已結案。這次是金鑰輪替後 robot account 被停用造成的，要不要開一張後續單，把 robot account 加進金鑰輪替的檢查清單，避免再發生？
        </p>
      ),
    },
    { who: 'user', text: '好，開吧。' },
    {
      who: 'agent',
      steps: ['在 Service Desk 建立後續單 SD-2320', '連結到 SD-2318'],
      copyText: '已開後續單 #SD-2320「金鑰輪替後檢查 robot account 狀態」，指派給 K8s 平台團隊，並連結到 #SD-2318。',
      body: (
        <p className="mt-2">
          已開後續單 <TicketLink id="SD-2320" />「金鑰輪替後檢查 robot account 狀態」，指派給 K8s 平台團隊，並連結到 <TicketLink id="SD-2318" />。
        </p>
      ),
    },
]

export const ONCALL_SCRIPT: TAgentScript = {
  title: 'My on-call queue',
  steps: [
    { who: 'user', text: '我現在有哪些待處理的單？' },
    {
      who: 'agent',
      steps: ['查詢 K8s 平台團隊的待處理單', '依優先順序與 SLA 排序'],
      copyText:
        '你目前有 3 張待處理的單：#SD-2318 payments-api 在 staging 拉不到映像檔 · P2 · 2 分鐘前，阻斷 Payments 團隊部署；#SD-2311 search-api namespace 資源配額調整 · P3 · 昨天；#SD-2305 stg-cluster-01 節點磁碟用量 85% · P3 · 2 天前。建議先處理 #SD-2318，它正在阻斷部署。要接這張嗎？',
      body: (
        <>
          <p className="mt-2">你目前有 3 張待處理的單：</p>
          {/* 條列(2026-10-30 user:「先用條列」;DS agent-panel.stories 代理回覆內條列同款) */}
          <ul className="mt-2 flex list-disc flex-col gap-1 pl-5">
            <li><TicketLink id="SD-2318" /> payments-api 在 staging 拉不到映像檔 · P2 · 2 分鐘前，阻斷 Payments 團隊部署</li>
            <li><TicketLink id="SD-2311" /> search-api namespace 資源配額調整 · P3 · 昨天</li>
            <li><TicketLink id="SD-2305" /> stg-cluster-01 節點磁碟用量 85% · P3 · 2 天前</li>
          </ul>
          <p className="mt-2">建議先處理 <TicketLink id="SD-2318" />，它正在阻斷部署。要接這張嗎？</p>
        </>
      ),
    },
    { who: 'user', text: '好，我接 SD-2318。' },
    {
      who: 'agent',
      steps: ['指派 SD-2318 給 Bob', '通知申請人', '讀取申請人與 AI agent 的對話紀錄', '查詢 registry 稽核日誌'],
      copyText:
        '已指派給你，也通知申請人你接手了。目前掌握的狀況：症狀：stg-cluster-02 / payment-stg 拉 payments/api:1.42.0 時回應 unauthorized。已嘗試：申請人照文章重新同步了 pull secret，無效。我查到的：registry 稽核日誌顯示，robot account robot$payments-ci 在昨晚 02:14 金鑰輪替後被停用。推測原因是這個帳號被停用。要我直接重新啟用嗎？',
      body: (
        <>
          <p className="mt-2">已指派給你，也通知申請人你接手了。目前掌握的狀況：</p>
          <ul className="mt-2 flex list-disc flex-col gap-1 pl-5">
            <li><strong>症狀：</strong>stg-cluster-02 / payment-stg 拉 payments/api:1.42.0 時回應 unauthorized。</li>
            <li><strong>已嘗試：</strong>申請人照文章重新同步了 pull secret，無效。</li>
            <li><strong>我查到的：</strong>registry 稽核日誌顯示，robot account robot$payments-ci 在昨晚 02:14 金鑰輪替後被停用。</li>
          </ul>
          <p className="mt-2">推測原因是這個帳號被停用。要我直接重新啟用嗎？</p>
        </>
      ),
    },
    ...TAIL,
  ],
}

/** 劇本各步完成後,單子的狀態跟著變(tickets.tsx 讀;pos = engine.scriptPos,「第 n 步完成」⇔ pos > n) */
export type TicketMilestones = { assigned: number; reenabled: number; replied: number; closed: number; followUpOpened: number }
export const ONCALL_MILESTONES: TicketMilestones = { assigned: 3, reenabled: 7, replied: 9, closed: 10, followUpOpened: 12 }

// ── 事找人(#oncall-updates)──────────────────────────────────────────────────
/** Updates 開出來的對話:第一步是代理把前情整理好、問要不要接(前情 = 人找事版第 4 步的狀況整理逐字) */
const BRIEFING: ReactNode = (
  <ul className="mt-2 flex list-disc flex-col gap-1 pl-5">
    <li><strong>症狀：</strong>stg-cluster-02 / payment-stg 拉 payments/api:1.42.0 時回應 unauthorized。</li>
    <li><strong>已嘗試：</strong>申請人照文章重新同步了 pull secret，無效。</li>
    <li><strong>我查到的：</strong>registry 稽核日誌顯示，robot account robot$payments-ci 在昨晚 02:14 金鑰輪替後被停用。</li>
  </ul>
)
export const ONCALL_UPDATES_SCRIPT: TAgentScript = {
  title: 'SD-2318 payments-api ImagePullBackOff',
  steps: [
    {
      who: 'agent',
      steps: ['讀取 SD-2318', '讀取申請人與 AI agent 的對話紀錄', '查詢 registry 稽核日誌'],
      copyText:
        '這是 #SD-2318 目前掌握的狀況：症狀：stg-cluster-02 / payment-stg 拉 payments/api:1.42.0 時回應 unauthorized。已嘗試：申請人照文章重新同步了 pull secret，無效。我查到的：registry 稽核日誌顯示，robot account robot$payments-ci 在昨晚 02:14 金鑰輪替後被停用。推測原因是這個帳號被停用。要接這張單嗎？我會指派給你，並通知申請人。',
      body: (
        <>
          <p className="mt-2">這是 <TicketLink id="SD-2318" /> 目前掌握的狀況：</p>
          {BRIEFING}
          <p className="mt-2">推測原因是這個帳號被停用。要接這張單嗎？我會指派給你，並通知申請人。</p>
        </>
      ),
    },
    { who: 'user', text: '好，我接。' },
    {
      who: 'agent',
      steps: ['指派 SD-2318 給 Bob', '通知申請人'],
      copyText: '已指派給你，也通知申請人你接手了。要我直接重新啟用 robot$payments-ci 嗎？',
      body: <p className="mt-2">已指派給你，也通知申請人你接手了。要我直接重新啟用 robot$payments-ci 嗎？</p>,
    },
    ...TAIL,
  ],
}
export const ONCALL_UPDATES_MILESTONES: TicketMilestones = { assigned: 2, reenabled: 6, replied: 8, closed: 9, followUpOpened: 11 }

/** 事找人的觸發點:打開 demo 5 秒後 Updates 收到新單(2026-10-30 user:「先五秒鐘自動出現」);時間 = 單子建立時間 */
export const NEW_TICKET_UPDATE = {
  afterMs: 5000,
  copyText:
    '新的 P2 單 #SD-2318 指派給 K8s 平台團隊：payments-api 在 staging 拉不到映像檔（ImagePullBackOff），Payments 團隊的 staging 部署被阻斷。申請人已照知識庫文章重新同步 pull secret，無效。',
  body: (
    <>
      <UpdateTime>10:42 AM</UpdateTime>
      <p className="mt-1">
        新的 P2 單 <TicketLink id="SD-2318" /> 指派給 K8s 平台團隊：payments-api 在 staging 拉不到映像檔（ImagePullBackOff），Payments 團隊的 staging 部署被阻斷。申請人已照知識庫文章重新同步 pull secret，無效。
      </p>
      <WorkOnTicketButton />
    </>
  ),
}
