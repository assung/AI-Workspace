// 下載檔案(週報 .html、草稿 .md 共用)。
// 分享用的 demo 放在 claude.ai artifact 的框裡:框不允許頁面自己下載(2026-11-04 user 回報「按了下載後沒有反應」),
// 要透過平台的 downloads 功能存檔(會先跳確認;publish 時要帶 `capabilities: {downloads: true}`)。
// `window.claude` 只有在 artifact 框裡才有;其他地方(本機、Netlify)沒有 → 照一般網頁用 <a download>。
type ArtifactDownloads = { save: (req: { filename: string; data: string }) => Promise<unknown> }
const artifactRuntime = () => (window as unknown as { claude?: { use?: (name: string) => Promise<unknown> } }).claude

/** 在 claude.ai artifact 框裡(框也不允許開新分頁 → 呼叫端據此藏掉「Open in new tab」) */
export const inArtifactViewer = () => typeof artifactRuntime()?.use === 'function'

export async function saveFile(filename: string, data: string, mime: string) {
  if (inArtifactViewer()) {
    const downloads = (await artifactRuntime()!.use!('downloads')) as ArtifactDownloads | null
    if (downloads) {
      // 使用者在確認框按取消 = 正常結果,不另外提示
      await downloads.save({ filename, data }).catch(() => {})
      return
    }
  }
  const url = URL.createObjectURL(new Blob([data], { type: mime }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
