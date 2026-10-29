// tAgent demo 劇本(2026-10-29 user 提供):payments-api 部到 staging 一直 ImagePullBackOff → 照已知問題文章自助排除 → 無效 → 代理開單
// → K8s 平台團隊值班接手、處理 → 使用者確認 → 結案。
//
// 台詞逐字照 user 劇本;只改了錯字(unauthourized → unauthorized、refistry / regitstry → registry、負責團對 → 負責團隊),
// 並在中英文 / 數字之間補半形空格。思考步驟(AgentThinking)是劇本沒寫、為了演示代理「真的去查」而補的過程文字。
// 「文章」連結打開 Docs › K8s Platform › Known issues › ImagePullBackOff：registry pull secret 過期(DocsPage.tsx `kb-imagepull`)。
import { DocLink, type TAgentScript } from './TAgent'

/** 進度更新(主動發)的間隔:讓講者有時間說明「值班已接手」再出下一則 */
const UPDATE_GAP_MS = 4000

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
      steps: ['比對錯誤訊息：unauthorized: authentication required', '搜尋 Docs › K8s Platform 的已知問題'],
      copyText:
        '這很像已知問題「registry pull secret 過期」。照這篇文章執行一次重新同步通常就能解決：ImagePullBackOff：registry pull secret 過期（3 步驟，約 2 分鐘）。有解決的話跟我說一聲；沒解決的話，我可以直接幫你開單。',
      body: (
        <>
          <p className="mt-2">這很像已知問題「registry pull secret 過期」。照這篇文章執行一次重新同步通常就能解決：</p>
          <p className="mt-2">
            文章：<DocLink space="k8s-platform" page="kb-imagepull">ImagePullBackOff：registry pull secret 過期</DocLink>（3 步驟，約 2 分鐘）
          </p>
          <p className="mt-2">有解決的話跟我說一聲；沒解決的話，我可以直接幫你開單。</p>
        </>
      ),
    },
    { who: 'user', text: '照做了，還是一樣。幫我開單。' },
    {
      who: 'agent',
      steps: ['整理對話中的問題與已嘗試的步驟', '判斷負責團隊：K8s 平台團隊（執行環境）'],
      copyText:
        '好，我先摘要給你確認：問題：payments-api 在 staging 拉不到映像檔（unauthorized），已重新同步 pull secret，無效。影響：Payments 團隊的 staging 部署被阻斷。我們判斷：這是 K8s 執行環境的故障，由 K8s 平台團隊處理。內容正確嗎？如果負責團隊不對，直接回覆「不對」就好。',
      body: (
        <>
          <p className="mt-2">好，我先摘要給你確認：</p>
          <ul className="mt-2 flex list-disc flex-col gap-1 pl-5">
            <li><strong>問題：</strong>payments-api 在 staging 拉不到映像檔（unauthorized），已重新同步 pull secret，無效。</li>
            <li><strong>影響：</strong>Payments 團隊的 staging 部署被阻斷。</li>
            <li><strong>我們判斷：</strong>這是 K8s 執行環境的故障，由 K8s 平台團隊處理。</li>
          </ul>
          <p className="mt-2">內容正確嗎？如果負責團隊不對，直接回覆「不對」就好。</p>
        </>
      ),
    },
    { who: 'user', text: '對，開吧。' },
    {
      who: 'agent',
      steps: ['在 Service Desk 建立單號 SD-2318', '通知 K8s 平台團隊值班'],
      copyText: '已開單 #SD-2318。K8s 平台團隊的值班會接手，進度會更新在這個 thread。',
      body: <p className="mt-2">已開單 <strong>#SD-2318</strong>。K8s 平台團隊的值班會接手，進度會更新在這個 thread。</p>,
    },
    {
      who: 'agent',
      afterMs: UPDATE_GAP_MS,
      steps: [],
      copyText: '#SD-2318 已由 K8s 平台團隊的 Bob 接手，正在處理。',
      body: <p><strong>#SD-2318</strong> 已由 K8s 平台團隊的 Bob 接手，正在處理。</p>,
    },
    {
      who: 'agent',
      afterMs: UPDATE_GAP_MS,
      steps: [],
      copyText: '#SD-2318 已處理。原因是 registry 的 robot account 在昨晚金鑰輪替後被停用，已重新啟用。請重新部署試試看，問題真的解決了嗎？',
      body: (
        <p>
          <strong>#SD-2318</strong> 已處理。原因是 registry 的 robot account 在昨晚金鑰輪替後被停用，已重新啟用。請重新部署試試看，問題真的解決了嗎？
        </p>
      ),
    },
    { who: 'user', text: '好了，pod 起來了' },
    {
      who: 'agent',
      steps: ['結案 SD-2318'],
      copyText: '太好了，#SD-2318 已結案。',
      body: <p className="mt-2">太好了，<strong>#SD-2318</strong> 已結案。</p>,
    },
  ],
}
