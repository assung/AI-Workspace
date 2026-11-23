// 下載對話框(2026-11-23 user:「按下 download 後跳出的 download modal 要照 DS > Dialog 的樣式…不一定要真的可以下載,
// 只需要做到跳出彈窗,讓 demo 時可以示意這邊是下載入口」;同日:週報的 Download 也一起改、File name 用 read only 樣式)。
//
// 寫法照 DS Dialog「表單」範例(dialog.stories WithForm):DialogContent height="hug"、DialogHeader/Title、DialogBody 內欄位 gap loose、
// DialogFooter 取消(tertiary)+ 主要動作(primary);送出 → Toast 再關閉;每次打開回到預設格式。
// - File name = Input mode="readonly"(field-controls.spec 表單三態:「表單中不可編輯但可見的欄位」= neutral-2 底、無框);
//   值 = 檔名 + 目前選的副檔名,切換格式時跟著變,讓使用者確認最後會拿到哪個檔。
// - 格式 2–3 個 → RadioGroup(radio-group.spec「2-5 個選項且全部可見」)。對照 Notion 匯出對話框(選格式再按 Export)。
// 示意用:預設不產生檔案,按 Download 只跳成功提示;呼叫端可傳 onDownload 接真的下載(週報 HTML 保留 2026-11-04 修好的真下載)。
import { useState } from 'react'
import {
  Button,
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldLabel,
  Input,
  RadioGroup,
  RadioGroupItem,
  toast,
} from '@qijenchen/design-system'

export type DownloadFormat = { value: string; label: string }

export const DOC_FORMATS: DownloadFormat[] = [
  { value: 'md', label: 'Markdown (.md)' },
  { value: 'pdf', label: 'PDF (.pdf)' },
  { value: 'docx', label: 'Word (.docx)' },
]

export const REPORT_FORMATS: DownloadFormat[] = [
  { value: 'html', label: 'HTML (.html)' },
  { value: 'pdf', label: 'PDF (.pdf)' },
]

export function DownloadDialog({ open, onOpenChange, title, baseName, formats, onDownload }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  /** 不含副檔名 */
  baseName: string
  formats: DownloadFormat[]
  onDownload?: (format: string, fileName: string) => void | Promise<void>
}) {
  const [format, setFormat] = useState(formats[0].value)
  const [busy, setBusy] = useState(false)
  const fileName = `${baseName}.${format}`
  const submit = async () => {
    setBusy(true)
    try {
      await onDownload?.(format, fileName)
      toast({ variant: 'success', title: `Downloaded ${fileName}` })
      onOpenChange(false)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setFormat(formats[0].value)
        onOpenChange(next)
      }}
    >
      <DialogContent
        height="hug"
        onOpenAutoFocus={(e) => {
          // 預設會把焦點給第一個可聚焦元素 = 唯讀檔名 → 邊框轉主色,看起來像能改。改給目前選中的格式
          // (W3C APG Dialog:第一個可聚焦元素不適合時,初始焦點放在最合理的互動元素上)
          const checked = (e.currentTarget as HTMLElement | null)?.querySelector<HTMLElement>('[role="radio"][aria-checked="true"]')
          if (checked) {
            e.preventDefault()
            checked.focus()
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="flex flex-col gap-[var(--layout-space-loose)]">
            <Field>
              <FieldLabel>File name</FieldLabel>
              <Input mode="readonly" value={fileName} readOnly />
            </Field>
            <Field>
              <FieldLabel>Format</FieldLabel>
              <RadioGroup value={format} onValueChange={setFormat}>
                {formats.map((f) => <RadioGroupItem key={f.value} value={f.value} label={f.label} />)}
              </RadioGroup>
            </Field>
          </div>
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="tertiary">Cancel</Button>
          </DialogClose>
          <Button variant="primary" loading={busy} onClick={() => void submit()}>Download</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
