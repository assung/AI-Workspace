// 開單草稿(2026-11-03 user:「開單摘要蠻簡陋,單子的詳細資訊略嫌不足,例如 Priority 等欄位都沒有顯示…讓使用者做最終確認、
// 有機會手動修開單的內容,最後由他按下 create」;選 A = 右側面板草稿,按鈕在底部)。
//
// 對照 GitHub Copilot 建 issue:代理起草「suggested title, body, and metadata (labels, assignees, issue type)」,
// 使用者「Edit any field … or ask Copilot to make changes with a follow-up prompt」,最後自己按 Create
// (docs.github.com/en/copilot/how-tos/copilot-on-github/copilot-for-github-tasks/use-copilot-to-create-or-update-issues)。
// 草稿開在右側面板 = 對話留在左邊,使用者可以邊看邊請代理改;Create 後同一個面板變成單子詳情(tickets.tsx)。
// 代理整理完就自動打開草稿(同 Claude 建立 artifact 時開在對話旁邊),訊息裡的「Review ticket」可再打開。
//
// ── 消費的 SSOT ──────────────────────────────────────────────────────────────
// - 表單 = DS Field 家族(agent-panel.spec.md「一般表單輸入 → Field 家族」)+ FieldGroup(欄位間距 = layoutSpace 規則 3 parallel)
//   + useFormValidation intent="create"(form-validation.spec.md:建立類 Create 不停用,按了才驗、錯了移焦點)
// - 欄位:Input / Select / Textarea;Priority 的建議理由 = FieldDescription;附件 = FileItem surface="form"、不帶 status(file-item.spec.md:form 裡「已存在的附件」清掉 status = 靜態,無進度條、無 icon;唯讀,不給移除)
// - 底部動作列 = DS SheetFooter(SurfaceFooter 是 @internal;對外的 Footer 裡 Sheet 的語意最接近「側邊、多欄位表單」),
//   放進 Right panel 底部靠 AsideFooter(暫時做法)。按鈕 md、靠右、Cancel tertiary + Create primary(dialog.spec.md「Footer 按鈕」)。
import { createContext, useContext, useEffect, type ReactNode } from 'react'
import {
  Button,
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FileItem,
  Input,
  Select,
  SheetFooter,
  Textarea,
  useFormValidation,
} from '@qijenchen/design-system'
import { FilePen } from 'lucide-react'
import { AsideFooter } from './AsideHeaderActions'

export type TicketDraft = {
  title: string
  priority: string
  category: string
  team: string
  service: string
  environment: string
  description: string
}

// 代理預填(內容 = 對話裡已知的事;Description 每行「標籤：內容」,建好後單子的 Summary 照行拆)
export const INITIAL_DRAFT: TicketDraft = {
  title: 'payments-api 在 staging 拉不到映像檔（ImagePullBackOff）',
  priority: 'P2',
  category: 'kubernetes',
  team: 'K8s 平台團隊',
  service: 'payments-api',
  environment: 'stg-cluster-02 / payment-stg',
  description: [
    '問題：payments-api 在 staging 拉不到映像檔（unauthorized）。',
    '已嘗試：照知識庫文章重新同步 pull secret，無效。',
    '影響：Payments 團隊的 staging 部署被阻斷。',
    '錯誤訊息：Failed to pull image "registry.example.internal/payments/api:1.42.0": unauthorized: authentication required',
  ].join('\n'),
}

const PRIORITY_OPTIONS = [
  { value: 'P1', label: 'P1 · Critical', description: 'Production is down or data is at risk' },
  { value: 'P2', label: 'P2 · High', description: 'Blocks a team’s work, no workaround' },
  { value: 'P3', label: 'P3 · Medium', description: 'Partly blocked, a workaround exists' },
  { value: 'P4', label: 'P4 · Low', description: 'Question or minor issue' },
]
const CATEGORY_OPTIONS = [
  { value: 'kubernetes', label: 'Kubernetes & deployments' },
  { value: 'access', label: 'Access & accounts' },
  { value: 'network', label: 'Network & VPN' },
  { value: 'hardware', label: 'Laptop & hardware' },
  { value: 'other', label: 'Other' },
]
const TEAM_OPTIONS = ['K8s 平台團隊', 'Registry 團隊', 'Network 團隊', 'IT Helpdesk'].map((t) => ({ value: t, label: t }))

/** 自動附上的附件(唯讀) */
const ATTACHMENTS = [
  { name: 'Conversation with IT Service Desk', description: '6 messages' },
  { name: 'kubectl-describe-pod-events.txt', description: '1.2 KB' },
]

export const categoryLabel = (value: string) => CATEGORY_OPTIONS.find((o) => o.value === value)?.label ?? value

export function TicketDraftForm({ draft, onDraftChange, onCancel, onCreate }: {
  draft: TicketDraft
  /** 每次修改都回報(面板關掉再開、按 × 都不丟改過的內容) */
  onDraftChange: (draft: TicketDraft) => void
  onCancel: () => void
  onCreate: (draft: TicketDraft) => void
}) {
  const form = useFormValidation<TicketDraft>({
    initialValues: draft,
    intent: 'create',
    validate: {
      title: (v) => (String(v).trim() ? undefined : 'Enter a title'),
      priority: (v) => (v ? undefined : 'Choose a priority'),
      team: (v) => (v ? undefined : 'Choose a team'),
    },
    onSubmit: (values) => onCreate({ ...values, title: values.title.trim() }),
  })
  const { values } = form
  useEffect(() => {
    onDraftChange(values)
    // 只在內容變時回報
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(values)])

  const select = (name: 'priority' | 'category' | 'team', options: { value: string; label: string; description?: string }[]) => (
    <Select
      id={`draft-${name}`}
      options={options}
      value={values[name]}
      onChange={(v) => form.setFieldValue(name, v)}
      error={!!form.errors[name]}
    />
  )

  return (
    <>
      <form
        className="p-[var(--layout-space-loose)]"
        onSubmit={(e) => {
          e.preventDefault()
          void form.handleSubmit()
        }}
      >
        <FieldGroup>
          <Field required invalid={!!form.errors.title}>
            <FieldLabel>Title</FieldLabel>
            <Input id="draft-title" {...form.getInputProps('title')} error={!!form.errors.title} />
            <FieldError>{form.errors.title}</FieldError>
          </Field>
          <Field required invalid={!!form.errors.priority}>
            <FieldLabel>Priority</FieldLabel>
            {select('priority', PRIORITY_OPTIONS)}
            {/* 代理選 P2 的理由(使用者改了就不再顯示 —— 理由只對代理的建議成立) */}
            {values.priority === INITIAL_DRAFT.priority && (
              <FieldDescription>Suggested by IT Service Desk: it blocks the Payments team’s staging deploys, and production isn’t affected.</FieldDescription>
            )}
            <FieldError>{form.errors.priority}</FieldError>
          </Field>
          <Field>
            <FieldLabel>Category</FieldLabel>
            {select('category', CATEGORY_OPTIONS)}
          </Field>
          <Field required invalid={!!form.errors.team}>
            <FieldLabel>Assigned team</FieldLabel>
            {select('team', TEAM_OPTIONS)}
            <FieldError>{form.errors.team}</FieldError>
          </Field>
          <Field>
            <FieldLabel>Affected service</FieldLabel>
            <Input id="draft-service" {...form.getInputProps('service')} />
          </Field>
          <Field>
            <FieldLabel>Environment</FieldLabel>
            <Input id="draft-environment" {...form.getInputProps('environment')} />
          </Field>
          <Field>
            <FieldLabel>Description</FieldLabel>
            <Textarea id="draft-description" rows={7} {...form.getInputProps('description')} />
          </Field>
          <Field>
            <FieldLabel>Attachments</FieldLabel>
            {/* 列間 4px = file-item.spec.md「form compact 4px」 */}
            <div className="flex flex-col gap-1">
              {ATTACHMENTS.map((a) => (
                <FileItem key={a.name} name={a.name} description={a.description} surface="form" />
              ))}
            </div>
          </Field>
        </FieldGroup>
      </form>
      <AsideFooter>
        <SheetFooter>
          <Button variant="tertiary" onClick={onCancel}>Cancel</Button>
          <Button variant="primary" loading={form.isSubmitting} onClick={() => void form.handleSubmit()}>Create</Button>
        </SheetFooter>
      </AsideFooter>
    </>
  )
}

// ── 對話裡的「Review ticket」(代理訊息內的動作鈕,寫法同 Updates 的按鈕:Button tertiary sm,內文下方 mt-2)──
type DraftActions = { reviewTicket: () => void; created: boolean }
const DraftActionsContext = createContext<DraftActions | null>(null)
export function DraftActionsProvider({ value, children }: { value: DraftActions; children: ReactNode }) {
  return <DraftActionsContext.Provider value={value}>{children}</DraftActionsContext.Provider>
}
export function ReviewTicketButton() {
  const actions = useContext(DraftActionsContext)
  // 建好之後拿掉(下一則「已開單 #SD-2318」的單號連結接手)
  if (!actions || actions.created) return null
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      <Button variant="tertiary" size="sm" startIcon={FilePen} onClick={actions.reviewTicket}>Review ticket</Button>
    </div>
  )
}
