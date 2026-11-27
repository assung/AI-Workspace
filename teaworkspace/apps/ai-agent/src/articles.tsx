// 知識庫文章(右側面板預覽)。
// 內容 = apps/chat/src/DocsPage.tsx `kb-imagepull`(逐字;最後一句「請在 AI agent 開單」→「請在 IT Service Desk 開單」,2026-10-30 user 同意)。
// 開頭的「適用症狀」藍色 info Alert 拿掉(2026-10-30 user:「避免誤會」)。
// 區塊樣式 = DocsPage renderBlock 同一組(text-h4 標題、bg-muted 指令區塊、list utilities)。
//
// 預覽面板(2026-10-30 user:「開在 right panel,走跟 Claude 右邊面板預覽一樣的方式」):
// 對照 Claude artifact —— 開在對話右側、X 關閉後對話填滿;操作鈕在面板頂列
// (codecademy.com/article/how-to-use-claude-artifacts-create-share-and-remix-ai-content)。
// 「Open in new tab」放頂列 × 左邊(2026-10-30 user;排法照 AgentPanelHeader 的「新對話 +」)。DS AppShellAside 尚無 actions 位置,
// 先用 AsideHeaderActions 在產品端示意(暫時做法,見該檔),之後再跟 DS 提調整。
import { Avatar, Button, ButtonDivider, Tooltip, TooltipTrigger, TooltipContent } from '@qijenchen/design-system'
import { ExternalLink } from 'lucide-react'
import { AsideHeaderActions } from './AsideHeaderActions'
import kenjiAvatar from './assets/avatars/kenji.jpg'

type Block =
  | { type: 'h2'; text: string }
  | { type: 'p'; text: string }
  | { type: 'ol'; items: string[] }
  | { type: 'code'; text: string }

export type Article = {
  id: string
  title: string
  /** 知識庫位置(麵包屑) */
  path: string[]
  owner: { name: string; avatarUrl: string }
  updated: string
  /** 外部知識庫網址(假連結,同 TicketLink;之後 user 再說要連到哪) */
  href: string
  body: Block[]
}

// 日期格式 YYYY/MM/DD hh:mm AM/PM(本專案慣例)
export const ARTICLES: Record<string, Article> = {
  'kb-imagepull': {
    id: 'kb-imagepull',
    title: 'ImagePullBackOff：registry pull secret 過期',
    path: ['K8s Platform', 'Known issues'],
    owner: { name: 'Takahashi Kenji 高橋健二', avatarUrl: kenjiAvatar },
    updated: '2026/10/20 10:12 AM',
    href: 'https://kb.example.internal/k8s-platform/kb-imagepull',
    body: [
      { type: 'h2', text: '原因' },
      { type: 'p', text: 'namespace 裡的 registry pull secret 由 External Secrets 同步。來源金鑰輪替後，舊的 secret 會過期，節點拉映像檔時就會被 registry 拒絕。' },
      { type: 'h2', text: '排除步驟（3 步驟，約 2 分鐘）' },
      { type: 'ol', items: ['確認 pull secret 的同步狀態與最後更新時間', '強制重新同步 pull secret', '重新啟動 deployment，讓 pod 用新的 secret 拉映像檔'] },
      { type: 'code', text: 'kubectl get externalsecret regcred -n <namespace>\nkubectl annotate externalsecret regcred force-sync=$(date +%s) --overwrite -n <namespace>\nkubectl rollout restart deploy/<deployment> -n <namespace>' },
      { type: 'h2', text: '還是失敗？' },
      { type: 'p', text: '代表問題不在 secret 本身（例如 registry 帳號被停用）。請在 IT Service Desk 開單，附上 namespace 與 Events 的錯誤訊息，K8s 平台團隊值班會接手。' },
    ],
  },
  // 值班者用的 SOP(2026-11-03 user:human in the loop —— 代理提供 SOP、值班者手動重新啟用)。內容是 AI 起草的示範資料。
  'kb-robot-reenable': {
    id: 'kb-robot-reenable',
    title: 'Registry robot account 被停用：重新啟用',
    path: ['K8s Platform', 'Runbooks'],
    owner: { name: 'Takahashi Kenji 高橋健二', avatarUrl: kenjiAvatar },
    updated: '2026/10/22 03:40 PM',
    href: 'https://kb.example.internal/k8s-platform/kb-robot-reenable',
    body: [
      { type: 'h2', text: '適用症狀' },
      { type: 'p', text: '拉映像檔回應 unauthorized: authentication required，而且重新同步 pull secret 無效。' },
      { type: 'h2', text: '處理步驟（5 步驟，由值班者執行）' },
      {
        type: 'ol',
        items: [
          '在 registry 稽核日誌確認 robot account 的狀態與停用時間',
          '確認停用原因不是資安事件（例如金鑰外洩）；是的話停止，改走資安事件流程',
          '在 registry 管理介面重新啟用該 robot account',
          '確認使用它的 pull secret 仍對應同一組金鑰，並從受影響的 cluster 測試拉取映像檔',
          '在單子記錄處理結果與重新啟用時間',
        ],
      },
      { type: 'code', text: 'registryctl robot get <robot-name>\nregistryctl robot enable <robot-name>\nkubectl run pull-test --rm -it --image=<image> -n <namespace> -- true' },
      { type: 'h2', text: '注意' },
      { type: 'p', text: '重新啟用屬於變更動作，必須由值班者執行並留下紀錄。AI agent 只會協助查詢與確認結果。' },
    ],
  },
}

function renderBlock(b: Block, i: number) {
  switch (b.type) {
    case 'h2':
      return <h2 key={i} className="text-h4 font-semibold">{b.text}</h2>
    case 'p':
      return <p key={i} className="text-body">{b.text}</p>
    case 'ol':
      return (
        <ol key={i} className="flex list-decimal flex-col gap-1 ps-[var(--layout-space-loose)] text-body">
          {b.items.map((t) => <li key={t}>{t}</li>)}
        </ol>
      )
    case 'code':
      return (
        <pre key={i} className="overflow-x-auto rounded-md bg-muted p-[var(--layout-space-loose)] font-mono text-body">
          {b.text}
        </pre>
      )
  }
}

/** 右側面板的文章內容(標題在 AppShellAside 頂列,這裡從麵包屑開始;內距 = DocsPage article 同值 loose) */
export function ArticlePreview({ article }: { article: Article }) {
  return (
    <div className="flex flex-col gap-[var(--layout-space-loose)] p-[var(--layout-space-loose)]">
      <AsideHeaderActions deps={article.id}>
        <Tooltip>
          <TooltipTrigger asChild>
            {/* 圖示鈕 + tooltip:同頁首 Pin 鈕寫法(title="" 讓 tooltip 取代原生提示);
                假連結(同 TicketLink):接上真的知識庫後改成 window.open(article.href, '_blank', 'noopener') */}
            <Button variant="text" size="sm" iconOnly startIcon={ExternalLink} aria-label="Open in new tab" title="" onClick={() => {}} />
          </TooltipTrigger>
          <TooltipContent>Open in new tab</TooltipContent>
        </Tooltip>
        <ButtonDivider />
      </AsideHeaderActions>
      <div className="flex flex-col gap-[var(--layout-space-tight)]">
        <span className="text-body text-fg-secondary">{article.path.join(' › ')}</span>
        <div className="flex items-center gap-2 text-body text-fg-secondary">
          <Avatar src={article.owner.avatarUrl} alt={article.owner.name} size={24} />
          <span className="min-w-0 flex-1 truncate">Owned by {article.owner.name} · Last updated {article.updated}</span>
        </div>
      </div>
      {article.body.map(renderBlock)}
    </div>
  )
}
