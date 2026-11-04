// IT Service Desk — 獨立的 AI agent 產品(2026-10-30 從 tWorkspace 拆出;handoff:Project 的 claude/ai-agent-standalone-handoff.md)。
// 整個 app 只有一頁(TAgentPage);這裡持有對話資料、目前位置、通知。
//
// 通知(2026-10-30 user 定):
// - 使用者在看別則對話時代理回完 → 記未讀 + DS Toast + 對話列紅點(沿用 tWorkspace 做法)。
//   Toast:標題 = 對話名、內文 = 回覆開頭 80 字、neutral、無 action(toast.spec.md 的 action 只給「復原 / 重試」這類後手;回到對話靠紅點)。
// - 瀏覽器分頁在背景 → 同樣記未讀;分頁標題加未讀數「(1) IT Service Desk」(Slack / Gmail 分頁標題同型)。不發瀏覽器系統通知
//   (要先跳權限詢問,會打斷 demo)。
// - 重新開啟 / 重新整理 → 停在上次的對話;按 New 才回首頁。上次的對話已不存在(示範資料重設、被刪除)→ 首頁。
//
// Demo 身分(2026-10-30 user 選 A):沒有 hash = 申請人 Aaron;`#oncall` = 值班者 Bob「人找事」;
// `#oncall-updates` = Bob「事找人」(打開 5 秒後 Updates 收到新單)。見 personas.tsx。
// 換 hash 就換一整套(對話、劇本、記住的位置各自一份);分享用 artifact 只傳得過純 `#name`,所以用 hash 不用 query。
import { useEffect, useRef, useState } from 'react'
import { Toaster, toast } from '@qijenchen/design-system'
import { TAGENT_LABEL, useTAgentEngine } from './TAgent'
import { TAgentPage, type TAgentRoute } from './TAgentPage'
import { personaFromHash, type Persona } from './personas'

const routeKey = (persona: Persona) => `it-service-desk:${persona.id}:route`

function readStoredRoute(key: string): TAgentRoute {
  try {
    const v = window.localStorage.getItem(key)
    // Projects / Artifacts 已拿掉(2026-10-30):以前記住的這兩個位置回首頁
    if (v === 'new' || v === 'artifacts' || v?.startsWith('conversation:')) return v as TAgentRoute
  } catch {
    // 私密視窗 / 被封鎖的儲存:從首頁開始
  }
  return 'new'
}

function usePageVisible() {
  const [visible, setVisible] = useState(() => document.visibilityState === 'visible')
  useEffect(() => {
    const onChange = () => setVisible(document.visibilityState === 'visible')
    document.addEventListener('visibilitychange', onChange)
    return () => document.removeEventListener('visibilitychange', onChange)
  }, [])
  return visible
}

export default function App() {
  const [persona, setPersona] = useState(() => personaFromHash(window.location.hash))
  useEffect(() => {
    const onHash = () => setPersona(personaFromHash(window.location.hash))
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  // key = 身分:換身分就重新掛載整套
  return <PersonaApp key={persona.id} persona={persona} />
}

function PersonaApp({ persona }: { persona: Persona }) {
  const ROUTE_KEY = routeKey(persona)
  // 有自動觸發的身分(事找人)每次打開都從首頁開始:重新整理 = 重跑 demo,若停回上次的 Updates,
  // 通知到的時候正看著 Updates → 照規則不亮紅點、不跳 Toast,觸發點就看不到了(2026-10-30 user 回報「過五秒沒有看到紅點」)。
  // 其他身分照舊停在上次的對話。
  const [route, setRoute] = useState<TAgentRoute>(() => (persona.liveUpdates?.length ? 'new' : readStoredRoute(ROUTE_KEY)))
  const pageVisible = usePageVisible()

  // 使用者此刻看著哪一則對話:開著的那則,而且分頁在前景
  const viewedConversationId = pageVisible && route.startsWith('conversation:') ? route.slice('conversation:'.length) : null
  const viewedRef = useRef(viewedConversationId)
  viewedRef.current = viewedConversationId

  const engine = useTAgentEngine({
    seed: persona.seed,
    updatesSeed: persona.updatesSeed,
    script: persona.script,
    isViewing: (id) => viewedRef.current === id,
    onBackgroundReply: (conversation, replyText) => {
      toast({
        title: conversation.title,
        description: replyText.length > 80 ? `${replyText.slice(0, 80)}…` : replyText,
      })
    },
  })

  // 事找人的觸發點:打開 demo 後自動發到 Updates(2026-10-30 user:「先五秒鐘自動出現」)
  const { postUpdate } = engine
  useEffect(() => {
    const timers = (persona.liveUpdates ?? []).map((u) => window.setTimeout(() => postUpdate(u), u.afterMs))
    return () => timers.forEach((t) => window.clearTimeout(t))
  }, [persona, postUpdate])

  // 看到了就算讀過(包括分頁回到前景)
  const { markRead } = engine
  useEffect(() => {
    if (viewedConversationId) markRead(viewedConversationId)
  }, [viewedConversationId, markRead])

  // 停在上次的位置:記住目前位置;記著的對話已不存在 → 首頁
  const routeExists = !route.startsWith('conversation:') || engine.conversations.some((c) => `conversation:${c.id}` === route)
  useEffect(() => {
    if (!routeExists) setRoute('new')
  }, [routeExists])
  useEffect(() => {
    try {
      window.localStorage.setItem(ROUTE_KEY, route)
    } catch {
      // 存不了就不記
    }
  }, [route, ROUTE_KEY])

  // 分頁標題的未讀數
  useEffect(() => {
    document.title = engine.unreadCount > 0 ? `(${engine.unreadCount}) ${TAGENT_LABEL}` : TAGENT_LABEL
  }, [engine.unreadCount])

  return (
    // 底色 / 文字色明確掛在根節點:DS base.css 的 body 樣式在 @layer base,被宿主頁(例如分享用 artifact 的外框重設)的
    // body 樣式蓋掉時,沒自帶文字色的內容(文章預覽)會在深色主題變成深底黑字。值 = DS base.css body 同一組 token。
    <div className="h-screen bg-canvas text-foreground">
      <TAgentPage engine={engine} route={route} onRouteChange={setRoute} persona={persona} />
      <Toaster containerAriaLabel="Notifications" />
    </div>
  )
}
