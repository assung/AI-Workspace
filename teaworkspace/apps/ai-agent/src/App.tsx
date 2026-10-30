// IT Service Desk — 獨立的 AI agent 產品(2026-10-30 從 tWorkspace 拆出;handoff:Project 的 claude/ai-agent-standalone-handoff.md)。
// 整個 app 只有一頁(TAgentPage);這裡持有對話資料、目前位置、通知。
//
// 通知(2026-10-30 user 定):
// - 使用者在看別則對話時代理回完 → 記未讀 + DS Toast + 對話列紅點(沿用 tWorkspace 做法)。
//   Toast:標題 = 對話名、內文 = 回覆開頭 80 字、neutral、無 action(toast.spec.md 的 action 只給「復原 / 重試」這類後手;回到對話靠紅點)。
// - 瀏覽器分頁在背景 → 同樣記未讀;分頁標題加未讀數「(1) IT Service Desk」(Slack / Gmail 分頁標題同型)。不發瀏覽器系統通知
//   (要先跳權限詢問,會打斷 demo)。
// - 重新開啟 / 重新整理 → 停在上次的對話;按 New 才回首頁。上次的對話已不存在(示範資料重設、被刪除)→ 首頁。
import { useEffect, useRef, useState } from 'react'
import { Toaster, toast } from '@qijenchen/design-system'
import { TAGENT_LABEL, useTAgentEngine } from './TAgent'
import { TAgentPage, type TAgentRoute } from './TAgentPage'
import { K8S_IMAGEPULL_SCRIPT } from './tagentScripts'

/** 首頁問候用的名字(沿用 tWorkspace ME_GREETING_NAME) */
const USER_NAME = 'Aaron'

const ROUTE_KEY = 'it-service-desk:route'

function readStoredRoute(): TAgentRoute {
  try {
    const v = window.localStorage.getItem(ROUTE_KEY)
    if (v === 'new' || v === 'projects' || v === 'artifacts' || v?.startsWith('conversation:')) return v as TAgentRoute
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
  const [route, setRoute] = useState<TAgentRoute>(readStoredRoute)
  const pageVisible = usePageVisible()

  // 使用者此刻看著哪一則對話:開著的那則,而且分頁在前景
  const viewedConversationId = pageVisible && route.startsWith('conversation:') ? route.slice('conversation:'.length) : null
  const viewedRef = useRef(viewedConversationId)
  viewedRef.current = viewedConversationId

  const engine = useTAgentEngine({
    script: K8S_IMAGEPULL_SCRIPT,
    isViewing: (id) => viewedRef.current === id,
    onBackgroundReply: (conversation, replyText) => {
      toast({
        title: conversation.title,
        description: replyText.length > 80 ? `${replyText.slice(0, 80)}…` : replyText,
      })
    },
  })

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
  }, [route])

  // 分頁標題的未讀數
  useEffect(() => {
    document.title = engine.unreadCount > 0 ? `(${engine.unreadCount}) ${TAGENT_LABEL}` : TAGENT_LABEL
  }, [engine.unreadCount])

  return (
    <div className="h-screen">
      <TAgentPage engine={engine} route={route} onRouteChange={setRoute} userName={USER_NAME} />
      <Toaster containerAriaLabel="Notifications" />
    </div>
  )
}
