// 報案草稿(2026-11-03 user,兩次調整):
// - 第一次:「開單摘要蠻簡陋…讓使用者做最終確認、有機會手動修開單的內容,最後由他按下 create」;選 A = 右側面板草稿,按鈕在底部。
// - 第二次:「開單的部分比較像是產出 Title 及歷程描述,由報案者確認後送出」→ 只留 Title 與 What happened(列點、不標時間);
//   Priority / Category / 負責團隊等單據欄位不在報案者這邊處理,不顯示。按鈕 Create → Submit,面板標題 New ticket → Report an issue。
// - 第三次:What happened 改用編號(1. 2. 3.),順序本身就看得出來,欄位下方的說明文字因此拿掉(2026-11-03 user)。
//
// 對照 GitHub Copilot 建 issue:代理起草「suggested title, body …」,使用者「Edit any field … or ask Copilot to make changes
// with a follow-up prompt」,最後自己按 Create
// (docs.github.com/en/copilot/how-tos/copilot-on-github/copilot-for-github-tasks/use-copilot-to-create-or-update-issues)。
// 草稿開在右側面板 = 對話留在左邊,使用者可以邊看邊請代理改;送出後同一個面板變成單子詳情(tickets.tsx)。
// 代理整理完就自動打開草稿(同 Claude 建立 artifact 時開在對話旁邊),訊息裡的「Review report」可再打開。
//
// ── 消費的 SSOT ──────────────────────────────────────────────────────────────
// - 表單 = DS Field 家族(agent-panel.spec.md「一般表單輸入 → Field 家族」)+ FieldGroup(欄位間距 = layoutSpace 規則 3 parallel)
//   + useFormValidation intent="create"(form-validation.spec.md:建立類送出鈕不停用,按了才驗、錯了移焦點)
// - What happened = Textarea;每行「n. 」編號(純文字欄位,送出後單子的摘要照行拆成編號清單)
// - 底部動作列 = DS SheetFooter(SurfaceFooter 是 @internal;對外的 Footer 裡 Sheet 的語意最接近「側邊表單」),
//   放進 Right panel 底部靠 AsideFooter(暫時做法)。按鈕 md、靠右、Cancel tertiary + Submit primary(dialog.spec.md「Footer 按鈕」)。
import { createContext, useContext, useEffect, type ReactNode } from 'react'
import {
  Button,
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  Input,
  SheetFooter,
  Textarea,
  useFormValidation,
} from '@qijenchen/design-system'
import { FilePen } from 'lucide-react'
import { AsideFooter } from './AsideHeaderActions'

export type TicketDraft = {
  title: string
  whatHappened: string
}

// 代理預填(內容 = 對話裡已知的事,依發生順序編號、不標時間)
export const INITIAL_DRAFT: TicketDraft = {
  title: 'payments-api 在 staging 拉不到映像檔（ImagePullBackOff）',
  whatHappened: [
    '部署 payments-api 到 staging（stg-cluster-02 / payment-stg）後，pod 一直停在 ImagePullBackOff。',
    'kubectl describe pod 的 Events 顯示：Failed to pull image "registry.example.internal/payments/api:1.42.0": unauthorized: authentication required',
    '照知識庫文章〈ImagePullBackOff：registry pull secret 過期〉重新同步 pull secret，問題仍在。',
    'Payments 團隊的 staging 部署因此被阻斷。',
  ].map((l, i) => `${i + 1}. ${l}`).join('\n'),
}

/** What happened → 清單項目(去掉每行開頭的「1. 」「•」「-」,空行略過;使用者自己改過編號也照行算) */
export const whatHappenedItems = (text: string) =>
  text.split('\n').map((l) => l.replace(/^\s*(?:\d+[.)、]|•|-|\*)\s*/, '').trim()).filter(Boolean)

export function TicketDraftForm({ draft, onDraftChange, onCancel, onSubmit }: {
  draft: TicketDraft
  /** 每次修改都回報(面板關掉再開、按 × 都不丟改過的內容) */
  onDraftChange: (draft: TicketDraft) => void
  onCancel: () => void
  onSubmit: (draft: TicketDraft) => void
}) {
  const form = useFormValidation<TicketDraft>({
    initialValues: draft,
    intent: 'create',
    validate: {
      title: (v) => (String(v).trim() ? undefined : 'Enter a title'),
      whatHappened: (v) => (whatHappenedItems(String(v)).length ? undefined : 'Describe what happened'),
    },
    onSubmit: (values) => onSubmit({ title: values.title.trim(), whatHappened: values.whatHappened }),
  })
  const { values } = form
  useEffect(() => {
    onDraftChange(values)
    // 只在內容變時回報
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(values)])

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
          <Field required invalid={!!form.errors.whatHappened}>
            <FieldLabel>What happened</FieldLabel>
            <Textarea id="draft-what-happened" rows={9} {...form.getInputProps('whatHappened')} error={!!form.errors.whatHappened} />
            <FieldError>{form.errors.whatHappened}</FieldError>
          </Field>
        </FieldGroup>
      </form>
      <AsideFooter>
        <SheetFooter>
          <Button variant="tertiary" onClick={onCancel}>Cancel</Button>
          <Button variant="primary" loading={form.isSubmitting} onClick={() => void form.handleSubmit()}>Submit</Button>
        </SheetFooter>
      </AsideFooter>
    </>
  )
}

// ── 對話裡的「Review report」(代理訊息內的動作鈕,寫法同 Updates 的按鈕:Button tertiary sm,內文下方 mt-2)──
type DraftActions = { reviewTicket: () => void; created: boolean }
const DraftActionsContext = createContext<DraftActions | null>(null)
export function DraftActionsProvider({ value, children }: { value: DraftActions; children: ReactNode }) {
  return <DraftActionsContext.Provider value={value}>{children}</DraftActionsContext.Provider>
}
export function ReviewTicketButton() {
  const actions = useContext(DraftActionsContext)
  // 送出之後拿掉(下一則「已開單 #SD-2318」的單號連結接手)
  if (!actions || actions.created) return null
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      <Button variant="tertiary" size="sm" startIcon={FilePen} onClick={actions.reviewTicket}>Review report</Button>
    </div>
  )
}
