// Artifacts(2026-11-04 user:「左側 panel 需要有一個 artifacts 的項目在 updates 下方,來承載這些起草的草稿產物,
// 可以先沿用之前的列表方式來呈現」;SOP 修改「先產出一個 artifact 的 markdown 展示在右側 panel,後續送出部分先不用」)。
//
// 對照 Claude:側欄有獨立的 Artifacts 入口、代理產出的東西在對話右側預覽(support.claude.com/en/articles/9487310)。
//
// ── 消費的 SSOT ──────────────────────────────────────────────────────────────
// - 列表 = DS DataTable(2026-10-30 版同一份:Name / Type / Created in / Last updated;data-table.spec.md「簡單展示也用 DataTable」)
//   Name 點了 → 右側預覽;Created in = 站內連結(LinkInput view)回到產生它的對話(2026-11-04 user 同意)
// - 預覽(Doc)= 知識庫文章預覽同一套字級 / 區塊(articles.tsx renderBlock:text-h4 標題、list utilities、bg-muted 指令區塊);
//   引用段落 = 代理草稿引用同款(左邊線 + 次要字色,oncallScript.tsx)。頂列 × 左邊 Download(.md),同週報那顆。
//   預覽不重複 `# 標題`(標題已在面板頂列,同文章預覽)。Download → DS Dialog 示意(見下方 DownloadDialog)。
// - 對話裡的草稿卡 = DS FileItem compact、surface="form"、無 status(同週報;file-item.spec.md「表單 / 訊息附件」靜態態)
import { createContext, useContext, useState, type ReactNode } from 'react'
import {
  Button,
  ButtonDivider,
  DataTable,
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldError,
  FieldLabel,
  FileItem,
  Input,
  LinkInput,
  RadioGroup,
  RadioGroupItem,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  toast,
  useFormValidation,
} from '@qijenchen/design-system'
import { Download } from 'lucide-react'
import { AsideHeaderActions } from './AsideHeaderActions'

export type ArtifactItem = {
  id: string
  /** 列表與面板頂列的名稱 */
  name: string
  /** 下載 / 草稿卡的檔名 */
  fileName: string
  type: 'Doc' | 'HTML'
  /** 產生它的對話;`script` = 劇本那一則 */
  conversationId: string
  updated: string
  /** Doc = markdown 內文;HTML = 週報(managerReport.tsx 畫) */
  markdown?: string
}

// ── markdown → 文章預覽同一套區塊 ─────────────────────────────────────────────
// 只認這幾種:# / ## / > / 1. / - / ``` / 段落(草稿只用到這些;不引入 markdown 套件)
type Block =
  | { type: 'h2' | 'p' | 'quote' | 'code'; text: string }
  | { type: 'ol' | 'ul'; items: string[] }

function parse(md: string): Block[] {
  const out: Block[] = []
  const lines = md.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]
    if (!l.trim() || l.startsWith('# ')) continue
    if (l.startsWith('```')) {
      const code: string[] = []
      while (++i < lines.length && !lines[i].startsWith('```')) code.push(lines[i])
      out.push({ type: 'code', text: code.join('\n') })
    } else if (l.startsWith('## ')) out.push({ type: 'h2', text: l.slice(3) })
    else if (l.startsWith('> ')) out.push({ type: 'quote', text: l.slice(2) })
    else if (/^\d+\. /.test(l) || l.startsWith('- ')) {
      const ordered = !l.startsWith('- ')
      const items: string[] = []
      for (; i < lines.length && (ordered ? /^\d+\. /.test(lines[i]) : lines[i].startsWith('- ')); i++) items.push(lines[i].replace(/^(\d+\.|-) /, ''))
      i--
      out.push({ type: ordered ? 'ol' : 'ul', items })
    } else out.push({ type: 'p', text: l })
  }
  return out
}

function renderBlock(b: Block, i: number) {
  switch (b.type) {
    case 'h2':
      return <h2 key={i} className="text-h4 font-semibold">{b.text}</h2>
    case 'p':
      return <p key={i} className="text-body">{b.text}</p>
    case 'quote':
      return <p key={i} className="border-l border-divider pl-3 text-body text-fg-secondary">{b.text}</p>
    case 'ol':
    case 'ul':
      return b.type === 'ol' ? (
        <ol key={i} className="flex list-decimal flex-col gap-1 ps-[var(--layout-space-loose)] text-body">{b.items.map((t) => <li key={t}>{t}</li>)}</ol>
      ) : (
        <ul key={i} className="flex list-disc flex-col gap-1 ps-[var(--layout-space-loose)] text-body">{b.items.map((t) => <li key={t}>{t}</li>)}</ul>
      )
    case 'code':
      return <pre key={i} className="overflow-x-auto rounded-md bg-muted p-[var(--layout-space-loose)] font-mono text-body">{b.text}</pre>
  }
}

// ── 下載對話框(2026-11-23 user:「按下 download 後跳出的 download modal 要照 DS > Dialog 的樣式…不一定要真的可以下載,
// 只需要做到跳出彈窗,讓 demo 時可以示意這邊是下載入口」)────────────────────────────────────────────
// 寫法照 DS Dialog「表單」範例(dialog.stories WithForm):DialogContent height="hug"、DialogHeader/Title、DialogBody 內欄位 gap loose、
// DialogFooter 取消(tertiary)+ 主要動作(primary);表單接 useFormValidation;送出成功 → Toast 再關閉;每次打開都 reset。
// 內容 = 檔名 + 格式:對照 Notion 匯出對話框(選匯出格式再按 Export);格式 3 個 → RadioGroup(radio-group.spec「2-5 個選項且全部可見」)。
// 示意用:不真的產生檔案(PDF / Word 也沒有轉檔),按 Download 只跳成功提示。
const FORMATS = [
  { value: 'md', label: 'Markdown (.md)' },
  { value: 'pdf', label: 'PDF (.pdf)' },
  { value: 'docx', label: 'Word (.docx)' },
] as const

function DownloadDialog({ open, onOpenChange, defaultName }: { open: boolean; onOpenChange: (open: boolean) => void; defaultName: string }) {
  const form = useFormValidation({
    initialValues: { name: defaultName, format: 'md' },
    validate: { name: (v) => (String(v).trim() ? undefined : 'Enter a file name') },
    onSubmit: (values) => {
      toast({ variant: 'success', title: `Downloaded ${values.name.trim()}.${values.format}` })
      onOpenChange(false)
    },
  })
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) form.reset()
        onOpenChange(next)
      }}
    >
      <DialogContent height="hug">
        <DialogHeader>
          <DialogTitle>Download draft</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="flex flex-col gap-[var(--layout-space-loose)]">
            <Field required invalid={!!form.errors.name}>
              <FieldLabel>File name</FieldLabel>
              <Input {...form.getInputProps('name')} />
              <FieldError>{form.errors.name}</FieldError>
            </Field>
            <Field>
              <FieldLabel>Format</FieldLabel>
              <RadioGroup value={form.values.format} onValueChange={(v) => form.setFieldValue('format', v)}>
                {FORMATS.map((f) => <RadioGroupItem key={f.value} value={f.value} label={f.label} />)}
              </RadioGroup>
            </Field>
          </div>
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="tertiary">Cancel</Button>
          </DialogClose>
          <Button variant="primary" loading={form.isSubmitting} onClick={() => void form.handleSubmit()}>Download</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** 右側面板的 Doc 預覽(標題在面板頂列;這裡從「類型 · 來源 · 更新時間」開始,位置同文章預覽的麵包屑列) */
export function ArtifactPreview({ artifact, createdIn }: { artifact: ArtifactItem; createdIn: string }) {
  const [downloadOpen, setDownloadOpen] = useState(false)
  return (
    <div className="flex flex-col gap-[var(--layout-space-loose)] p-[var(--layout-space-loose)]">
      <AsideHeaderActions deps={artifact.id}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="text"
              size="sm"
              iconOnly
              startIcon={Download}
              aria-label="Download"
              title=""
              onClick={() => setDownloadOpen(true)}
            />
          </TooltipTrigger>
          <TooltipContent>Download</TooltipContent>
        </Tooltip>
        <ButtonDivider />
      </AsideHeaderActions>
      <span className="text-body text-fg-secondary">{artifact.type} · Created in {createdIn} · Last updated {artifact.updated}</span>
      {parse(artifact.markdown ?? '').map(renderBlock)}
      <DownloadDialog open={downloadOpen} onOpenChange={setDownloadOpen} defaultName={artifact.fileName.replace(/\.md$/, '')} />
    </div>
  )
}

// ── 對話裡的草稿卡 ────────────────────────────────────────────────────────────
const ArtifactActionsContext = createContext<((id: string) => void) | null>(null)
export function ArtifactActionsProvider({ open, children }: { open: (id: string) => void; children: ReactNode }) {
  return <ArtifactActionsContext.Provider value={open}>{children}</ArtifactActionsContext.Provider>
}
export function ArtifactCard({ artifact }: { artifact: ArtifactItem }) {
  const open = useContext(ArtifactActionsContext)
  return (
    <div className="mt-2">
      <FileItem
        name={artifact.fileName}
        description={artifact.type === 'HTML' ? 'HTML' : 'Markdown'}
        onClick={open ? () => open(artifact.id) : undefined}
        actionAriaLabel={`Open ${artifact.fileName}`}
      />
    </div>
  )
}

// ── 列表(側欄 Artifacts)────────────────────────────────────────────────────
type Row = ArtifactItem & { createdIn: string; sourceId: string }

/** 站內連結由頁面攔截:`/conversations/<id>` → 切換對話;`/artifacts/<id>` → 右側預覽(2026-10-30 版同一套 SPA link interception) */
function interceptLinks(onOpenConversation: (id: string) => void, onOpenArtifact: (id: string) => void) {
  return (e: React.MouseEvent) => {
    const href = (e.target as Element).closest?.('a[href]')?.getAttribute('href')
    const conv = href?.match(/^\/conversations\/(.+)$/)
    const art = href?.match(/^\/artifacts\/(.+)$/)
    if (!conv && !art) return
    e.preventDefault()
    e.stopPropagation()
    if (conv) onOpenConversation(conv[1])
    else if (art) onOpenArtifact(art[1])
  }
}

export function ArtifactsView({ rows, onOpenConversation, onOpenArtifact }: {
  rows: Row[]
  onOpenConversation: (id: string) => void
  onOpenArtifact: (id: string) => void
}) {
  const columns = [
    { accessorKey: 'name', header: 'Name', cell: ({ row }: { row: { original: Row } }) => <LinkInput mode="view" value={`/artifacts/${row.original.id}`} label={row.original.name} /> },
    { accessorKey: 'type', header: 'Type', meta: { type: 'select' as const } },
    { accessorKey: 'createdIn', header: 'Created in', cell: ({ row }: { row: { original: Row } }) => <LinkInput mode="view" value={`/conversations/${row.original.sourceId}`} label={row.original.createdIn} /> },
    { accessorKey: 'updated', header: 'Last updated', meta: { type: 'string' as const } },
  ]
  return (
    <div className="flex h-full min-h-0 flex-col px-[var(--layout-space-loose)] py-[var(--layout-space-tight)]" onClickCapture={interceptLinks(onOpenConversation, onOpenArtifact)}>
      <DataTable columns={columns} data={rows} height="100%" getRowId={(a: Row) => a.id} aria-label="Artifacts" />
    </div>
  )
}

// ── 示範資料(AI 擬的示範內容;日期格式 YYYY/MM/DD hh:mm AM/PM)──────────────────
/** 報案者(2026-10-30 版同 3 筆) */
export const REQUESTER_ARTIFACTS: ArtifactItem[] = [
  {
    id: 'a-vpn', name: 'GlobalProtect 6.2.5 update steps', fileName: 'globalprotect-6.2.5-update-steps.md', type: 'Doc', conversationId: 'c-vpn', updated: '2026/10/29 05:32 PM',
    markdown: `# GlobalProtect 6.2.5 update steps

## Before you start
Save your work. The VPN disconnects for about a minute during the update.

## Steps
1. Open Self Service and search for GlobalProtect.
2. Select Update next to GlobalProtect 6.2.5.
3. When the update finishes, sign in to GlobalProtect again.
4. Keep the VPN connected for an hour to confirm it no longer drops.

## Still dropping?
Reply in the conversation and I’ll open a ticket for the Network team with your client logs.`,
  },
  {
    id: 'a-access', name: 'billing-service access request AR-5170', fileName: 'billing-service-access-request-AR-5170.md', type: 'Doc', conversationId: 'c-repo', updated: '2026/10/27 11:12 AM',
    markdown: `# billing-service access request AR-5170

- Repository: billing-service
- Access: Write
- Reason: Invoice export work
- Approvers: Priya, Marco (Billing team owners)

## Status
Sent to the approvers on 2026/10/27 11:12 AM. Access is granted as soon as one of them approves.`,
  },
  {
    id: 'a-wifi', name: 'Wi-Fi certificate renewal checklist', fileName: 'wifi-certificate-renewal-checklist.md', type: 'Doc', conversationId: 'c-wifi', updated: '2026/10/24 09:05 AM',
    markdown: `# Wi-Fi certificate renewal checklist

1. Connect the laptop to the office ethernet or the VPN.
2. Restart the laptop and sign in.
3. Wait a few minutes for the new Wi-Fi certificate to install.
4. Join Corp-WiFi again.

> If Corp-WiFi still refuses the laptop, the certificate didn’t renew. Tell me and I’ll open a ticket for the Network team.`,
  },
]

/** 值班者(Bob) */
export const ONCALL_ARTIFACTS: ArtifactItem[] = [
  {
    id: 'a-disk', name: 'stg-01-w3 image cleanup steps', fileName: 'stg-01-w3-image-cleanup-steps.md', type: 'Doc', conversationId: 'c-disk', updated: '2026/10/28 09:40 AM',
    markdown: `# stg-01-w3 image cleanup steps

> Draft for SD-2305. Image GC is off for this node pool, so unused images were never removed (62 GB).

## Steps
1. Cordon stg-01-w3 so no new pods land on it.
2. Remove images not used by any running container.
3. Turn image GC back on for the node pool.
4. Uncordon the node and confirm disk usage drops below 70%.

\`\`\`
kubectl cordon stg-01-w3
crictl rmi --prune
kubectl uncordon stg-01-w3
\`\`\``,
  },
  {
    id: 'a-quota', name: 'search-api quota change request', fileName: 'search-api-quota-change-request.md', type: 'Doc', conversationId: 'c-quota', updated: '2026/10/29 03:40 PM',
    markdown: `# search-api quota change request

- Namespace: search-stg on stg-cluster-01
- Change: CPU limit 8 → 12 cores
- Why: Load testing next week (SD-2311)
- Current peak: 6.5 cores over the last 14 days
- Rollback: Set the limit back to 8 cores after the load test

## Risk
Low. The node pool has 18 cores free at peak.`,
  },
]

/** 值班者劇本跑完後多的一筆:SOP 修改草稿(2026-11-04 user 選 A:整份修改後的 SOP,開頭說明改了什麼、為什麼) */
export const SOP_DRAFT_ARTIFACT: ArtifactItem = {
  id: 'a-sop-draft',
  name: 'Registry robot account 被停用：重新啟用（修改草稿）',
  fileName: 'registry-robot-account-reenable-draft.md',
  type: 'Doc',
  conversationId: 'script',
  updated: '2026/10/30 10:53 AM',
  markdown: `# Registry robot account 被停用：重新啟用（修改草稿）

> 這版改了什麼：第 1 步改為先查 registry 的金鑰輪替紀錄。原因：SD-2318 是金鑰輪替後 robot account 被停用造成的，現在的第 1 步沒有提到輪替紀錄，判斷原因多花了時間。

## 適用症狀
拉映像檔回應 unauthorized: authentication required，而且重新同步 pull secret 無效。

## 處理步驟（5 步驟，由值班者執行）
1. 先查 registry 的金鑰輪替紀錄，確認 robot account 是否在輪替後被停用，再到稽核日誌確認停用時間
2. 確認停用原因不是資安事件（例如金鑰外洩）；是的話停止，改走資安事件流程
3. 在 registry 管理介面重新啟用該 robot account
4. 確認使用它的 pull secret 仍對應同一組金鑰，並從受影響的 cluster 測試拉取映像檔
5. 在單子記錄處理結果與重新啟用時間

\`\`\`
registryctl rotation list --since 24h
registryctl robot get <robot-name>
registryctl robot enable <robot-name>
kubectl run pull-test --rm -it --image=<image> -n <namespace> -- true
\`\`\`

## 注意
重新啟用屬於變更動作，必須由值班者執行並留下紀錄。AI agent 只會協助查詢與確認結果。`,
}

/** 管理者(Kenji) */
export const MANAGER_ARTIFACTS: ArtifactItem[] = [
  {
    id: 'a-sla', name: 'October SLA breach summary', fileName: 'october-sla-breach-summary.md', type: 'Doc', conversationId: 'c-sla-oct', updated: '2026/10/29 04:20 PM',
    markdown: `# October SLA breach summary

> K8s Platform tickets created since 2026/10/01.

- Breached: 4 tickets, all quota requests waiting on the requester
- Not breached: every incident and every deployment-blocking ticket

## Suggested follow-up
Pause the SLA clock while a ticket waits on the requester, so these don’t count against the team.`,
  },
  {
    id: 'a-rotation', name: 'November on-call rotation', fileName: 'november-on-call-rotation.md', type: 'Doc', conversationId: 'c-rotation-k', updated: '2026/10/29 06:00 PM',
    markdown: `# November on-call rotation

- 2026/11/02–11/08: Bob, Wei
- 2026/11/09–11/15: Lena, Bob
- 2026/11/16–11/22: Wei, Lena
- 2026/11/23–11/29: Bob, Wei

> Registry key rotation is on 2026/11/27 02:00 AM. Bob and Wei are on call that night.`,
  },
]
