// tAgent demo 劇本(2026-10-29 user 提供):payments-api 部到 staging 一直 ImagePullBackOff → 照已知問題文章自助排除 → 無效 → 代理開單
// → K8s 平台團隊值班接手、處理 → 使用者確認 → 結案。
//
// 台詞逐字照 user 劇本;只改了錯字(unauthourized → unauthorized、refistry / regitstry → registry、負責團對 → 負責團隊),
// 並在中英文 / 數字之間補半形空格。思考步驟(AgentThinking)是劇本沒寫、為了演示代理「真的去查」而補的過程文字。
// 單號 #SD-2318 = TicketLink(假連結,2026-10-29 user)。
// 「文章」連結在右側面板預覽 K8s Platform › Known issues › ImagePullBackOff：registry pull secret 過期(articles.tsx `kb-imagepull`)。
// 從 apps/chat/src/tagentScripts.tsx 複製(2026-10-30 獨立產品);第 4 步思考改回 handoff §3 的寫法(獨立產品沒有 Docs 分頁,user 同意)。
import { ArticleLink, TicketLink, type TAgentScript } from './TAgent'
import { OpenConversationButton } from './updates'
import { ReviewTicketButton } from './ticketDraft'

// 進度「兩邊都放」(2026-10-30 user):第 9、10、12 步同時發一則到 Updates(時間 = 單子活動紀錄同一組,tickets.tsx),
// 附「Open conversation」回到這一則對話(`script` = 劇本那一則)。Updates 那一份只記紅點、不再跳 Toast(對話那一份已通知過)。
const mirror = (time: string, text: string, body: React.ReactNode) => ({
  time,
  copyText: text,
  body: (
    <>
      <p>{body}</p>
      <OpenConversationButton conversationId="script" />
    </>
  ),
})

/**
 * 進度更新(主動發)的間隔:讓講者有時間說明「值班已接手」再出下一則。
 * 2026-10-29 user:4 秒 → 8 秒(demo 時要來得及關面板 / 切走,才看得到通知與紅點)。
 */
const UPDATE_GAP_MS = 8000

export const K8S_IMAGEPULL_SCRIPT: TAgentScript = {
  title: 'payments-api ImagePullBackOff on staging',
  steps: [
    { who: 'user', text: 'payments-api 部到 staging 一直 ImagePullBackOff，http://argocd.example.internal/applications/payments-api-stg' },
    {
      who: 'agent',
      steps: ['開啟 Argo CD：payments-api-stg', '查看 stg-cluster-02 / payment-stg 的同步狀態'],
      copyText: '我看了這個連結，是 stg-cluster-02 上 payment-stg namespace 的部署。可以貼一下 kubectl describe pod 最後幾行 Events 嗎？',
      body: (
        <p className="mt-2">
          我看了這個連結，是 <strong>stg-cluster-02</strong> 上 <strong>payment-stg</strong> namespace 的部署。可以貼一下 kubectl describe pod 最後幾行 Events 嗎？
        </p>
      ),
    },
    { who: 'user', text: 'Failed to pull image "registry.example.internal/payments/api:1.42.0": unauthorized: authentication required' },
    {
      who: 'agent',
      steps: ['比對錯誤訊息', '搜尋 K8s Platform 的已知問題'],
      copyText:
        '這很像已知問題「registry pull secret 過期」。照這篇文章執行一次重新同步通常就能解決：ImagePullBackOff：registry pull secret 過期（3 步驟，約 2 分鐘）。有解決的話跟我說一聲；沒解決的話，我可以直接幫你開單。',
      body: (
        <>
          <p className="mt-2">這很像已知問題「registry pull secret 過期」。照這篇文章執行一次重新同步通常就能解決：</p>
          <p className="mt-2">
            文章：<ArticleLink articleId="kb-imagepull">ImagePullBackOff：registry pull secret 過期</ArticleLink>（3 步驟，約 2 分鐘）
          </p>
          <p className="mt-2">有解決的話跟我說一聲；沒解決的話，我可以直接幫你開單。</p>
        </>
      ),
    },
    // 2026-11-03 user:「幫我開單」改由代理接手 → 使用者只說「照做了，還是一樣。」
    // 2026-11-04 user 選 A:代理不再反問「要我幫你整理成一張單…嗎？」(連同使用者的「好。」一起拿掉),
    // 直接說會交給 K8s 平台團隊、摘要在右側;「看起來問題不在 pull secret。」不保留;Summary 用中文「摘要」
    { who: 'user', text: '照做了，還是一樣。' },
    {
      who: 'agent',
      steps: ['比對處理結果：重新同步後仍回應 unauthorized', '整理對話中的問題與已嘗試的步驟', '判斷負責團隊：K8s 平台團隊（執行環境）'],
      // 開單 = 產出 Title 與 What happened(列點),報案者確認後按 Submit;Priority 等欄位不在報案者這邊(ticketDraft.tsx)
      copyText: '我會交給 K8s 平台團隊處理，目前處理過程的摘要整理在右側，請確認標題和經過，沒問題就按 Submit。',
      body: (
        <>
          <p className="mt-2">我會交給 K8s 平台團隊處理，目前處理過程的摘要整理在右側，請確認標題和經過，沒問題就按 Submit。</p>
          <ReviewTicketButton />
        </>
      ),
    },
    // 使用者按草稿面板的 Submit(不是打字)
    { who: 'user', text: '', viaAction: 'create-ticket' },
    {
      who: 'agent',
      steps: ['在 Service Desk 建立單號 SD-2318', '通知 K8s 平台團隊值班'],
      copyText: '已開單 #SD-2318。K8s 平台團隊的值班會接手，進度會更新在這個 thread。',
      body: <p className="mt-2">已開單 <TicketLink id="SD-2318" />。K8s 平台團隊的值班會接手，進度會更新在這個 thread。</p>,
    },
    {
      who: 'agent',
      afterMs: UPDATE_GAP_MS,
      steps: [],
      copyText: '#SD-2318 已由 K8s 平台團隊的 Bob 接手，正在處理。',
      update: mirror('10:44 AM', '#SD-2318 已由 K8s 平台團隊的 Bob 接手，正在處理。', <><TicketLink id="SD-2318" /> 已由 K8s 平台團隊的 Bob 接手，正在處理。</>),
      body: <p><TicketLink id="SD-2318" /> 已由 K8s 平台團隊的 Bob 接手，正在處理。</p>,
    },
    {
      who: 'agent',
      afterMs: UPDATE_GAP_MS,
      steps: [],
      copyText: '#SD-2318 已處理。原因是 registry 的 robot account 在昨晚金鑰輪替後被停用，已重新啟用。請重新部署試試看，問題真的解決了嗎？',
      update: mirror('10:48 AM', '#SD-2318 已處理，請重新部署試試看。', <><TicketLink id="SD-2318" /> 已處理，請重新部署試試看。</>),
      body: (
        <p>
          <TicketLink id="SD-2318" /> 已處理。原因是 registry 的 robot account 在昨晚金鑰輪替後被停用，已重新啟用。請重新部署試試看，問題真的解決了嗎？
        </p>
      ),
    },
    { who: 'user', text: '好了，pod 起來了' },
    {
      who: 'agent',
      steps: ['結案 SD-2318'],
      copyText: '太好了，#SD-2318 已結案。',
      update: mirror('10:51 AM', '#SD-2318 已結案。', <><TicketLink id="SD-2318" /> 已結案。</>),
      body: <p className="mt-2">太好了，<TicketLink id="SD-2318" /> 已結案。</p>,
    },
  ],
}
