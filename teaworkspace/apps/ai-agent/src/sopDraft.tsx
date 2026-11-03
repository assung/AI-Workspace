// SOP 修改建議草稿(2026-11-03 user:「提修改 SOP 建議這個流程應該是 Agent 要給值班者看修改的內容,確認無誤後再按下送出,讓 Kenji 審核」)。
// 做法與報案草稿(ticketDraft.tsx)同一套:代理起草 → 右側面板自動打開 → 值班者確認或修改 → 按 Submit 才送出給 SOP 負責人審核。
// 代理不會直接改 SOP(human in the loop,oncallScript.tsx 檔頭)。
//
// ── 消費的 SSOT ──────────────────────────────────────────────────────────────
// - 送給誰 / 改哪份 = DS DescriptionList horizontal(唯讀的 metadata 列;同單子詳情);SOP 名稱是文章連結,點了在右側預覽
// - 修改內容 / 原因 = DS Field + Textarea(必填);驗證走 useFormValidation intent="create"
// - 底部 Cancel / Submit = DS SheetFooter,放在 Right panel 底部靠 AsideFooter(暫時做法,同報案草稿)
import { createContext, useContext, useEffect, type ReactNode } from 'react'
import {
  Button,
  DescriptionItem,
  DescriptionList,
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  SheetFooter,
  Textarea,
  useFormValidation,
} from '@qijenchen/design-system'
import { FilePen } from 'lucide-react'
import { AsideFooter } from './AsideHeaderActions'
import { ArticleLink } from './TAgent'

export type SopDraft = { change: string; reason: string }

// 代理預填(內容 = 這次 SD-2318 的處理經過;AI 起草的示範資料)
export const INITIAL_SOP_DRAFT: SopDraft = {
  change: '第 1 步改為：先查 registry 的金鑰輪替紀錄，確認 robot account 是否在輪替後被停用，再到稽核日誌確認停用時間。',
  reason: 'SD-2318 是金鑰輪替後 robot account 被停用造成的。現在的第 1 步沒有提到輪替紀錄，判斷原因多花了時間。',
}

export function SopDraftForm({ draft, onDraftChange, onCancel, onSubmit }: {
  draft: SopDraft
  onDraftChange: (draft: SopDraft) => void
  onCancel: () => void
  onSubmit: (draft: SopDraft) => void
}) {
  const form = useFormValidation<SopDraft>({
    initialValues: draft,
    intent: 'create',
    validate: {
      change: (v) => (String(v).trim() ? undefined : 'Describe the change'),
      reason: (v) => (String(v).trim() ? undefined : 'Explain why'),
    },
    onSubmit: (values) => onSubmit({ change: values.change.trim(), reason: values.reason.trim() }),
  })
  const { values } = form
  useEffect(() => {
    onDraftChange(values)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(values)])

  return (
    <>
      <form
        className="flex flex-col gap-[var(--layout-space-loose)] p-[var(--layout-space-loose)]"
        onSubmit={(e) => {
          e.preventDefault()
          void form.handleSubmit()
        }}
      >
        <DescriptionList orientation="horizontal">
          <DescriptionItem label="SOP">
            <ArticleLink articleId="kb-robot-reenable">Registry robot account 被停用：重新啟用</ArticleLink>
          </DescriptionItem>
          <DescriptionItem label="Reviewer">Takahashi Kenji 高橋健二</DescriptionItem>
        </DescriptionList>
        <FieldGroup>
          <Field required invalid={!!form.errors.change}>
            <FieldLabel>Suggested change</FieldLabel>
            <Textarea id="sop-change" rows={4} {...form.getInputProps('change')} error={!!form.errors.change} />
            <FieldError>{form.errors.change}</FieldError>
          </Field>
          <Field required invalid={!!form.errors.reason}>
            <FieldLabel>Reason</FieldLabel>
            <Textarea id="sop-reason" rows={3} {...form.getInputProps('reason')} error={!!form.errors.reason} />
            <FieldError>{form.errors.reason}</FieldError>
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

// ── 對話裡的「Review suggestion」(同「Review report」:Button tertiary sm,內文下方 mt-2;送出後拿掉)──
type SopDraftActions = { review: () => void; submitted: boolean }
const SopDraftActionsContext = createContext<SopDraftActions | null>(null)
export function SopDraftActionsProvider({ value, children }: { value: SopDraftActions; children: ReactNode }) {
  return <SopDraftActionsContext.Provider value={value}>{children}</SopDraftActionsContext.Provider>
}
export function ReviewSopButton() {
  const actions = useContext(SopDraftActionsContext)
  if (!actions || actions.submitted) return null
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      <Button variant="tertiary" size="sm" startIcon={FilePen} onClick={actions.review}>Review suggestion</Button>
    </div>
  )
}
