// 值班者(Bob,K8s 平台團隊)視角的 demo 劇本(2026-10-30 user:「以值班者角度的 user journey demo,由 K8s 團隊的 Bob 的視角展開,
// Bob 在值班時,透過詢問 AI agent 目前待處理的單有哪些,來解這題 payments-api 問題」)。
// 台詞 = AI 起草、user 2026-10-30 確認的劇本。收尾的「開後續單」2026-11-03 user 拿掉(避免 demo 太複雜),結案就是最後一步。
// 與申請人劇本(tagentScripts.tsx)接得上:第 4 步「通知申請人」= 申請人那邊的「Bob 接手」;第 8 步草稿 = 申請人那邊第 10 步原文。
// 隊列裡的另兩張單、帳號名、時間、namespace 是示範資料。
// 2026-10-30 user:兩條都留 ——「人找事」= ONCALL_SCRIPT(#oncall,Bob 開口問隊列);
// 「事找人」= ONCALL_UPDATES_SCRIPT(#oncall-updates,Updates 主動通知新單 → Work on this ticket 開出帶前情的新對話)。
// 兩條從「先確認一下，還有其他服務用這個帳號嗎？」之後共用同一段(TAIL)。
//
// Human in the loop(2026-11-03 user:「公司的規定需要人為做決策,不能讓 agent 直接處理重開金鑰這種執行動作,
// 而是應該把可以處理的方式 SOP 提供給值班者參考…讓值班者手動執行重新啟用」):
// - 代理只做唯讀的事(查詢、比對、讀日誌、確認結果);重新啟用由 Bob 照 SOP 手動做。
// - SOP 在右側面板開(articles.tsx `kb-robot-reenable`,同申請人那邊的知識庫文章)。
// - 通知申請人仍是代理起草、Bob 按「送出」才發。
// - 「開後續單」user 2026-11-03 拿掉(避免太複雜);「詢問 SOP 是否要調整」先拿掉、同日 user 要求補回:
//   結案後代理反問要不要優化 SOP,Bob 同意 → 代理起草修改建議、右側面板給 Bob 看,Bob 確認後按 Submit 才送給 SOP 負責人審核
//   (2026-11-03 user:「Agent 要給值班者看修改的內容,確認無誤後再按下送出,讓 Kenji 審核」;sopDraft.tsx)。
// - 狀況整理那則訊息下方有「Message Aaron」(contact.tsx;外開聊天平台,先做假連結)。
import type { ReactNode } from 'react'
import { ArticleLink, TicketLink, type TAgentScript, type TAgentScriptStep } from './TAgent'
import { OpenConversationButton, WorkOnTicketButton } from './updates'
import { MessageRequesterButton } from './contact'
import { ReviewSopButton } from './sopDraft'

/** 主動發的結案通知的間隔(同申請人劇本 UPDATE_GAP_MS 8 秒:讓講者有時間切走,看得到通知與紅點) */
const UPDATE_GAP_MS = 8000

/** 申請人那邊第 10 步原文(這裡是 Bob 送出前的草稿) */
const REQUESTER_UPDATE = '已處理。原因是 registry 的 robot account 在昨晚金鑰輪替後被停用，已重新啟用。請重新部署試試看，問題真的解決了嗎？'

/** 兩條指派之後同一句:提供 SOP,請 Bob 手動重新啟用 */
const SOP_HANDOFF_TEXT =
  '推測原因是這個帳號被停用。依規定，重新啟用要由值班者執行，處理方式在這份 SOP：Registry robot account 被停用：重新啟用（5 步驟）。你照著做完跟我說，我幫你確認結果。'
const SOP_HANDOFF: ReactNode = (
  <p className="mt-2">
    推測原因是這個帳號被停用。依規定，重新啟用要由值班者執行，處理方式在這份 SOP：
    <ArticleLink articleId="kb-robot-reenable">Registry robot account 被停用：重新啟用</ArticleLink>（5 步驟）。你照著做完跟我說，我幫你確認結果。
  </p>
)

/** 兩條共用的後段(確認影響範圍 → Bob 手動重新啟用 → 代理唯讀確認 → 回覆申請人 → 結案) */
const TAIL: TAgentScriptStep[] = [
    { who: 'user', text: '先確認一下，還有其他服務用這個帳號嗎？' },
    {
      who: 'agent',
      steps: ['查詢使用 robot$payments-ci 的 pull secret'],
      copyText: '只有 payment-stg 和 payment-dev 兩個 namespace 在用。payment-dev 今天還沒有部署，所以還沒出錯。重新啟用後兩邊都會恢復，不影響其他服務。',
      body: <p className="mt-2">只有 payment-stg 和 payment-dev 兩個 namespace 在用。payment-dev 今天還沒有部署，所以還沒出錯。重新啟用後兩邊都會恢復，不影響其他服務。</p>,
    },
    // Bob 照 SOP 手動執行完回報(human in the loop)
    { who: 'user', text: '我照 SOP 重新啟用了。' },
    {
      who: 'agent',
      // 唯讀確認:讀帳號狀態、讀拉取紀錄(不自己去拉)
      steps: ['檢查 robot$payments-ci 的狀態', '讀取 stg-cluster-02 的映像檔拉取紀錄'],
      copyText: `我確認了：robot$payments-ci 現在是啟用狀態，stg-cluster-02 剛剛拉取 payments/api:1.42.0 也成功了，問題看起來已經解決。你這邊確認沒問題的話，要我通知申請人重新部署嗎？草稿：「#SD-2318 ${REQUESTER_UPDATE}」`,
      body: (
        <>
          <p className="mt-2">我確認了：robot$payments-ci 現在是啟用狀態，stg-cluster-02 剛剛拉取 payments/api:1.42.0 也成功了，問題看起來已經解決。你這邊確認沒問題的話，要我通知申請人重新部署嗎？草稿：</p>
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
        time: '10:51 AM',
        copyText: '#SD-2318 申請人確認 pod 已經起來，已結案。',
        body: (
          <>
            <p><TicketLink id="SD-2318" /> 申請人確認 pod 已經起來，已結案。</p>
            <OpenConversationButton conversationId="script" />
          </>
        ),
      },
      copyText:
        '#SD-2318 申請人確認 pod 已經起來，已結案。這次照 SOP 處理時，有沒有需要調整的地方？例如在第 1 步加上「先查 registry 的金鑰輪替紀錄」，下次能更快判斷原因。',
      body: (
        <>
          <p>
            <TicketLink id="SD-2318" /> 申請人確認 pod 已經起來，已結案。
          </p>
          <p className="mt-2">這次照 SOP 處理時，有沒有需要調整的地方？例如在第 1 步加上「先查 registry 的金鑰輪替紀錄」，下次能更快判斷原因。</p>
        </>
      ),
    },
    { who: 'user', text: '好，幫我提 SOP 修改建議。' },
    {
      who: 'agent',
      steps: ['整理這次的處理經過', '起草 SOP 修改建議'],
      copyText: '我起草好修改建議了，請在右側確認內容；需要的話可以直接修改，沒問題就按 Submit，我會送給 SOP 負責人 Kenji 審核。',
      body: (
        <>
          <p className="mt-2">我起草好修改建議了，請在右側確認內容；需要的話可以直接修改，沒問題就按 Submit，我會送給 SOP 負責人 Kenji 審核。</p>
          <ReviewSopButton />
        </>
      ),
    },
    // Bob 按 SOP 建議面板的 Submit(不是打字)
    { who: 'user', text: '', viaAction: 'submit-sop' },
    {
      who: 'agent',
      steps: ['把修改建議送給 Kenji 審核'],
      copyText: '已把修改建議送給 SOP 負責人 Kenji 審核，審核通過後就會更新到〈Registry robot account 被停用：重新啟用〉。',
      body: (
        <p className="mt-2">
          已把修改建議送給 SOP 負責人 Kenji 審核，審核通過後就會更新到〈
          <ArticleLink articleId="kb-robot-reenable">Registry robot account 被停用：重新啟用</ArticleLink>〉。
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
        '已指派給你，也通知申請人你接手了。目前掌握的狀況：症狀：stg-cluster-02 / payment-stg 拉 payments/api:1.42.0 時回應 unauthorized。已嘗試：申請人照文章重新同步了 pull secret，無效。我查到的：registry 稽核日誌顯示，robot account robot$payments-ci 在昨晚 02:14 金鑰輪替後被停用。' + SOP_HANDOFF_TEXT,
      body: (
        <>
          <p className="mt-2">已指派給你，也通知申請人你接手了。目前掌握的狀況：</p>
          <ul className="mt-2 flex list-disc flex-col gap-1 pl-5">
            <li><strong>症狀：</strong>stg-cluster-02 / payment-stg 拉 payments/api:1.42.0 時回應 unauthorized。</li>
            <li><strong>已嘗試：</strong>申請人照文章重新同步了 pull secret，無效。</li>
            <li><strong>我查到的：</strong>registry 稽核日誌顯示，robot account robot$payments-ci 在昨晚 02:14 金鑰輪替後被停用。</li>
          </ul>
          {SOP_HANDOFF}
          <MessageRequesterButton name="Aaron" />
        </>
      ),
    },
    ...TAIL,
  ],
}

/** 劇本各步完成後,單子的狀態跟著變(tickets.tsx 讀;pos = engine.scriptPos,「第 n 步完成」⇔ pos > n) */
export type TicketMilestones = { assigned: number; reenabled: number; replied: number; closed: number; followUpOpened: number }
// 後續單已拿掉(2026-11-03)→ followUpOpened = Infinity(永遠不成立)
export const ONCALL_MILESTONES: TicketMilestones = { assigned: 3, reenabled: 7, replied: 9, closed: 10, followUpOpened: Infinity }

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
          <MessageRequesterButton name="Aaron" />
        </>
      ),
    },
    { who: 'user', text: '好，我接。' },
    {
      who: 'agent',
      steps: ['指派 SD-2318 給 Bob', '通知申請人'],
      copyText: '已指派給你，也通知申請人你接手了。' + SOP_HANDOFF_TEXT,
      body: (
        <>
          <p className="mt-2">已指派給你，也通知申請人你接手了。</p>
          {SOP_HANDOFF}
        </>
      ),
    },
    ...TAIL,
  ],
}
export const ONCALL_UPDATES_MILESTONES: TicketMilestones = { assigned: 2, reenabled: 6, replied: 8, closed: 9, followUpOpened: Infinity }

/** 事找人的觸發點:打開 demo 5 秒後 Updates 收到新單(2026-10-30 user:「先五秒鐘自動出現」);時間 = 單子建立時間 */
export const NEW_TICKET_UPDATE = {
  afterMs: 5000,
  time: '10:42 AM',
  copyText:
    '新的 P2 單 #SD-2318 指派給 K8s 平台團隊：payments-api 在 staging 拉不到映像檔（ImagePullBackOff），Payments 團隊的 staging 部署被阻斷。申請人已照知識庫文章重新同步 pull secret，無效。',
  body: (
    <>
      <p>
        新的 P2 單 <TicketLink id="SD-2318" /> 指派給 K8s 平台團隊：payments-api 在 staging 拉不到映像檔（ImagePullBackOff），Payments 團隊的 staging 部署被阻斷。申請人已照知識庫文章重新同步 pull secret，無效。
      </p>
      <WorkOnTicketButton />
    </>
  ),
}
