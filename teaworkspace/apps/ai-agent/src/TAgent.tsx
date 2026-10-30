// IT Service Desk 的智慧代理:對話資料(engine)+ 對話頁共用的訊息 / 輸入元件。
// 從 apps/chat/src/TAgent.tsx 複製(2026-10-30 user:AI agent 拆成獨立產品,tWorkspace 那份不動)。
// 拿掉的部分:側邊面板(TAgentDock)、NavRail 圖示、聊天室連結(SourceLink)、決策卡示範流程 —— 獨立產品沒有這些 surface。
// 程式識別字沿用 TAgent*,方便與 tWorkspace 那份對照。
//
// ── 消費的 SSOT ──────────────────────────────────────────────────────────────
// - DS AgentPanel 家族(agent-panel.spec.md):AgentConversation(log + 自動捲動 + 最後一則工具列常駐)、AgentMessage、
//   AgentThinking、AgentToolbar、AgentPromptInput(附件 Tag + 送出 ↔ 停止)。
// - 本檔不寫任何自訂視覺(色 / 字 / 間距)—— 只有清單縮排用 Tailwind list utilities 承載代理內文。

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { UpdateBubble } from './updates'
import {
  AgentMessage,
  AgentThinking,
  AgentToolbar,
  AgentPromptInput,
  type AgentPromptAttachment,
} from '@qijenchen/design-system'

// 產品名稱(2026-10-30 user:「產品名稱先用 IT Service Desk」)
export const TAGENT_LABEL = 'IT Service Desk'

// ── Conversation model ────────────────────────────────────────────────────────
type AgentTurn = {
  kind: 'agent'
  id: string
  thinking: boolean
  steps: string[]
  currentStep?: string
  body?: ReactNode
  copyText?: string
  stopped?: boolean
  /** Updates 訊息的時間(泡泡上方「名稱 + 時間」那一列) */
  time?: string
}

type Turn =
  | { kind: 'user'; id: string; text: string; attachments: AgentPromptAttachment[] }
  | AgentTurn

export type TAgentTurn = Turn

export type TAgentConversation = {
  id: string
  title: string
  /** 釘選(側欄的 Pinned 群組) */
  pinned?: boolean
  turns: Turn[]
}

const NEW_CONVERSATION_TITLE = 'New conversation'

// ── 代理內文的連結 ────────────────────────────────────────────────────────────
/**
 * 知識庫文章連結(劇本「文章:ImagePullBackOff…」)。由對話頁提供動作:在右側面板預覽
 * (2026-10-30 user:「開在 right panel,走跟 Claude 右邊面板預覽一樣的方式」)。
 */
export type TAgentOpenArticle = (articleId: string) => void
const TAgentOpenArticleContext = createContext<TAgentOpenArticle>(() => {})
export function TAgentOpenArticleProvider({ openArticle, children }: { openArticle: TAgentOpenArticle; children: ReactNode }) {
  return <TAgentOpenArticleContext.Provider value={openArticle}>{children}</TAgentOpenArticleContext.Provider>
}
export function ArticleLink({ articleId, children }: { articleId: string; children: ReactNode }) {
  const openArticle = useContext(TAgentOpenArticleContext)
  return (
    <a
      href={`/kb/${articleId}`}
      onClick={(e) => {
        e.preventDefault()
        openArticle(articleId)
      }}
    >
      {children}
    </a>
  )
}

/**
 * 工單號連結(劇本「已開單 #SD-2318」)。
 * 2026-10-29 user:「單號以連結樣式呈現,先做成假連結」;2026-10-30 user:值班者(Bob)視角點單號 → 右側面板看單子。
 * 頁面有提供 TAgentOpenTicketProvider 才打開;沒有 = 假連結(申請人視角維持原樣)。
 */
export type TAgentOpenTicket = (ticketId: string) => void
const TAgentOpenTicketContext = createContext<TAgentOpenTicket | null>(null)
export function TAgentOpenTicketProvider({ openTicket, children }: { openTicket: TAgentOpenTicket | null; children: ReactNode }) {
  return <TAgentOpenTicketContext.Provider value={openTicket}>{children}</TAgentOpenTicketContext.Provider>
}
export function TicketLink({ id }: { id: string }) {
  const openTicket = useContext(TAgentOpenTicketContext)
  return (
    <a
      href={`#ticket-${id}`}
      // 單號不拆行(「#SD-」「2305」被拆開就認不出是單號)
      className="whitespace-nowrap"
      onClick={(e) => {
        e.preventDefault()
        openTicket?.(id)
      }}
    >
      #{id}
    </a>
  )
}

// ── 劇本(demo 用,2026-10-29 user:「prototype 在 demo 時照我寫好的對話劇本演示」)──────────────
// 使用者的每一句預先填進輸入盒(按 Enter 送出;改了字也照樣推進);代理的回覆依序播放,
// 連續的代理回合自動接續,`afterMs` = 主動發的進度更新(前一則結束後隔多久出現)。
// 劇本只在「新對話」起頭時啟動一次(或從 Updates 的「Work on this ticket」開出來時,第一步是代理);跑完後回到一般行為。
// `update` = 這一步完成時也發一則到 Updates(2026-10-30 user:進度通知「兩邊都放」—— 對話裡一則、Updates 一則)。
export type TAgentUpdate = { time: string; body: ReactNode; copyText: string }
export type TAgentScriptStep =
  | { who: 'user'; text: string }
  | { who: 'agent'; steps: string[]; body: ReactNode; copyText: string; afterMs?: number; update?: TAgentUpdate }
export type TAgentScript = { title: string; steps: TAgentScriptStep[] }

/**
 * Updates(2026-10-30 user:「類似 GPT agent 的 Your dot 功能,裡面會有提醒事項的訊息流」,入口名稱 Updates)。
 * 對照 ChatGPT「Your Dot」:側欄 New chat 下方的入口、一條持續的對話、代理主動開口、可分出帶前情的新對話
 * (zapier.com/blog/chatgpt-dots;technicallycurious.substack.com/p/meet-your-new-work-bestie-chatgpt)。
 * 這裡做成一則特殊對話(id 固定),不列在 Pinned / Recents;未讀紅點、Toast 沿用一般對話那一套。
 */
export const UPDATES_ID = 'updates'
export const UPDATES_TITLE = 'Updates'

// 使用者泡泡斷字(DS 泡泡沒有;長網址、長附件 chip 會溢出泡泡右緣 —— apps/chat 同一組,STRUCTURE.md §4.5 待 DS 補)
const USER_BUBBLE_WRAP = '[&>div]:min-w-0 [&>div]:[overflow-wrap:anywhere] [&>div>div>*]:max-w-full [&>div>div>*>span]:min-w-0 [&>div>div>*>span]:truncate'

let idSeq = 0
const nextId = (p: string) => `${p}-${Date.now().toString(36)}-${(idSeq++).toString(36)}`

const titleFrom = (text: string) => (text.length > 48 ? `${text.slice(0, 48)}…` : text)

// ── Engine ────────────────────────────────────────────────────────────────────
export type TAgentEngine = ReturnType<typeof useTAgentEngine>

export function useTAgentEngine({ seed, updatesSeed, script, isViewing, onBackgroundReply }: {
  /** 側欄一開始就有的示範對話(依身分不同,personas.tsx) */
  seed: () => TAgentConversation[]
  /** Updates 一開始就有的訊息(依身分不同) */
  updatesSeed: () => TAgentTurn[]
  /** demo 劇本(見 TAgentScript);省略 = 一般行為 */
  script?: TAgentScript
  /** 使用者此刻是否正看著這則對話(對話頁開著它,且瀏覽器分頁在前景) */
  isViewing?: (convId: string) => boolean
  /** 代理在使用者沒看著的對話裡回完一則:該則記為未讀(紅點 + 分頁標題),並通知頁面發 Toast。 */
  onBackgroundReply?: (conversation: { id: string; title: string }, replyText: string) => void
}) {
  const [conversations, setConversations] = useState<TAgentConversation[]>(() => [
    { id: UPDATES_ID, title: UPDATES_TITLE, turns: updatesSeed() },
    ...seed(),
  ])
  const conversationsRef = useRef(conversations)
  conversationsRef.current = conversations
  const isViewingRef = useRef(isViewing)
  isViewingRef.current = isViewing
  const onBackgroundReplyRef = useRef(onBackgroundReply)
  onBackgroundReplyRef.current = onBackgroundReply
  const [unreadIds, setUnreadIds] = useState<ReadonlySet<string>>(() => new Set())
  const [busyConvId, setBusyConvId] = useState<string | null>(null)
  const timers = useRef<number[]>([])
  const busyTurnRef = useRef<{ convId: string; turnId: string } | null>(null)
  // 劇本進度:跑在哪一則對話、下一步是第幾步(render 用 state,事件處理讀 ref 避免舊值)
  const [scriptConvId, setScriptConvId] = useState<string | null>(null)
  const [scriptPos, setScriptPos] = useState(0)
  const scriptRef = useRef({ convId: null as string | null, pos: 0 })
  const setScript = useCallback((convId: string | null, pos: number) => {
    scriptRef.current = { convId, pos }
    setScriptConvId(convId)
    setScriptPos(pos)
  }, [])

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), [])

  const patchConversation = useCallback((convId: string, fn: (c: TAgentConversation) => TAgentConversation) => {
    setConversations((prev) => prev.map((c) => (c.id === convId ? fn(c) : c)))
  }, [])
  const patchTurn = useCallback((convId: string, turnId: string, fn: (t: AgentTurn) => Turn) => {
    patchConversation(convId, (c) => ({
      ...c,
      turns: c.turns.map((t) => (t.id === turnId && t.kind === 'agent' ? fn(t) : t)),
    }))
  }, [patchConversation])

  /** 模擬代理回合:步驟逐條串流(思考塊微光)→ 完成後放入內文。 */
  const runAgent = useCallback((convId: string, steps: string[], finish: () => { body: ReactNode; copyText: string }, onDone?: () => void) => {
    const turnId = nextId('a')
    busyTurnRef.current = { convId, turnId }
    setBusyConvId(convId)
    patchConversation(convId, (c) => ({
      ...c,
      turns: [...c.turns, { kind: 'agent', id: turnId, thinking: true, steps: [], currentStep: steps[0] }],
    }))
    steps.forEach((_, i) => {
      timers.current.push(
        window.setTimeout(() => {
          patchTurn(convId, turnId, (t) => ({ ...t, steps: steps.slice(0, i + 1), currentStep: steps[i + 1] }))
        }, 900 * (i + 1)),
      )
    })
    timers.current.push(
      window.setTimeout(() => {
        const { body, copyText } = finish()
        patchTurn(convId, turnId, (t) => ({ ...t, thinking: false, currentStep: undefined, body, copyText }))
        busyTurnRef.current = null
        setBusyConvId(null)
        if (isViewingRef.current && !isViewingRef.current(convId)) {
          setUnreadIds((prev) => new Set(prev).add(convId))
          const conv = conversationsRef.current.find((c) => c.id === convId)
          onBackgroundReplyRef.current?.({ id: convId, title: conv?.title ?? NEW_CONVERSATION_TITLE }, copyText)
        }
        onDone?.()
      }, 900 * steps.length + 400),
    )
  }, [patchConversation, patchTurn])

  /**
   * 發一則到 Updates(代理主動開口,沒有思考過程)。使用者沒看著 Updates → 記未讀(紅點 + 分頁標題);
   * `silent` = 同一件事已經在別的對話通知過(進度「兩邊都放」的 Updates 那一份),只記紅點、不再跳 Toast。
   */
  const postUpdate = useCallback((update: TAgentUpdate, { silent = false } = {}) => {
    const turn: AgentTurn = { kind: 'agent', id: nextId('n'), thinking: false, steps: [], body: update.body, copyText: update.copyText, time: update.time }
    patchConversation(UPDATES_ID, (c) => ({ ...c, turns: [...c.turns, turn] }))
    if (isViewingRef.current && !isViewingRef.current(UPDATES_ID)) {
      setUnreadIds((prev) => new Set(prev).add(UPDATES_ID))
      if (!silent) onBackgroundReplyRef.current?.({ id: UPDATES_ID, title: UPDATES_TITLE }, update.copyText)
    }
  }, [patchConversation])

  /** 從劇本第 pos 步開始播代理回合,直到下一句使用者的話(或劇本結束) */
  const playScriptFrom = useCallback((convId: string, pos: number) => {
    const step = script?.steps[pos]
    setScript(convId, pos)
    if (!step || step.who === 'user') return
    const start = () => runAgent(convId, step.steps, () => ({ body: step.body, copyText: step.copyText }), () => {
      if (step.update) postUpdate(step.update, { silent: true })
      playScriptFrom(convId, pos + 1)
    })
    if (step.afterMs) timers.current.push(window.setTimeout(start, step.afterMs))
    else start()
  }, [script, runAgent, setScript, postUpdate])

  /**
   * 從 Updates 的「Work on this ticket」開一則帶前情的新對話(對照 Your Dot「分出帶前情的新對話」):
   * 劇本第一步是代理的整理,開出來就開始播。劇本已經開始過 → 回傳那一則,不重開。
   */
  const startScripted = useCallback(() => {
    if (!script) return null
    if (scriptRef.current.convId) return scriptRef.current.convId
    const id = nextId('c')
    setConversations((prev) => [prev[0], { id, title: script.title, turns: [] }, ...prev.slice(1)])
    playScriptFrom(id, 0)
    return id
  }, [script, playScriptFrom])

  const stop = useCallback(() => {
    timers.current.forEach((t) => window.clearTimeout(t))
    timers.current = []
    const b = busyTurnRef.current
    if (b) {
      patchTurn(b.convId, b.turnId, (t) => ({
        ...t,
        thinking: false,
        currentStep: undefined,
        stopped: true,
        body: <p className="mt-2 text-fg-secondary">Response stopped.</p>,
        copyText: '',
      }))
    }
    busyTurnRef.current = null
    setBusyConvId(null)
  }, [patchTurn])

  /**
   * 送出一句話。`convId` 省略 = 開新對話(首頁);回傳實際寫入的對話 id。
   * 有動靜的對話移到最前面(Recents 依最近活動排序)。
   */
  const send = useCallback((convId: string | null, text: string, attachments: AgentPromptAttachment[]) => {
    const id = convId ?? nextId('c')
    const userTurn: Turn = { kind: 'user', id: nextId('u'), text, attachments }
    // 劇本:下一步是使用者的話,而且是「新對話起頭」或「劇本那一則對話」→ 照劇本推進
    const sc = scriptRef.current
    const isFresh = convId === null || !conversationsRef.current.find((c) => c.id === convId)?.turns.length
    const scripted = !!script && script.steps[sc.pos]?.who === 'user'
      && (sc.convId === null ? isFresh && sc.pos === 0 : convId === sc.convId)
    setConversations((prev) => {
      const existing = prev.find((c) => c.id === id)
      const base: TAgentConversation = existing ?? { id, title: NEW_CONVERSATION_TITLE, turns: [] }
      const updated: TAgentConversation = {
        ...base,
        title: base.turns.length === 0 ? (scripted && script ? script.title : titleFrom(text)) : base.title,
        turns: [...base.turns, userTurn],
      }
      // Updates 固定在最前面(不參與最近活動排序)
      const rest = prev.filter((c) => c.id !== id && c.id !== UPDATES_ID)
      const updates = prev.find((c) => c.id === UPDATES_ID)
      return updates ? [updates, updated, ...rest] : [updated, ...rest]
    })
    if (scripted) {
      playScriptFrom(id, sc.pos + 1)
      return id
    }
    // 劇本以外的一般回覆
    runAgent(
      id,
      ['Searched IT known issues'],
      () => {
        const reply = `I couldn’t find a known issue that matches “${text}” yet. Paste the error message or a link, and I’ll look into it or open a ticket for you.`
        return { copyText: reply, body: <p className="mt-2">{reply}</p> }
      },
    )
    return id
  }, [runAgent, script, playScriptFrom])

  const rename = useCallback((id: string, title: string) => patchConversation(id, (c) => ({ ...c, title })), [patchConversation])
  const togglePin = useCallback((id: string) => patchConversation(id, (c) => ({ ...c, pinned: !c.pinned })), [patchConversation])
  const remove = useCallback((id: string) => setConversations((prev) => prev.filter((c) => c.id !== id)), [])
  const markRead = useCallback((id: string) => {
    setUnreadIds((prev) => {
      if (!prev.has(id)) return prev
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }, [])

  const listed = useMemo(() => conversations.filter((c) => c.turns.length > 0 && c.id !== UPDATES_ID), [conversations])
  const updates = conversations.find((c) => c.id === UPDATES_ID)!
  return {
    conversations,
    /** 有內容的對話(側欄 Pinned / Recents 只列這些;不含 Updates) */
    listed,
    updates,
    postUpdate,
    startScripted,
    busyConvId,
    busy: busyConvId !== null,
    /** 劇本的下一句使用者台詞(輪到使用者時才有),輸入盒預先填入;以及劇本跑在哪一則對話 */
    scriptPrefill: script && script.steps[scriptPos]?.who === 'user' ? (script.steps[scriptPos] as { text: string }).text : null,
    scriptConvId,
    /** 劇本下一步的位置(右側面板的單子狀態跟著它走) */
    scriptPos,
    /** 未讀對話 */
    unreadIds,
    /** 未讀數(已刪除的不算;分頁標題用) */
    unreadCount: useMemo(() => listed.filter((c) => unreadIds.has(c.id)).length + (unreadIds.has(UPDATES_ID) ? 1 : 0), [listed, unreadIds]),
    markRead,
    send,
    stop,
    rename,
    togglePin,
    remove,
  }
}

// ── 渲染 ──────────────────────────────────────────────────────────────────────
/**
 * 對話內容(AgentConversation 的直接子節點必須是 AgentMessage —— 它靠直接子節點判定「最後一則代理訊息的工具列常駐」,
 * 所以這裡回傳元素陣列,不包一層元件)。
 */
export function renderTurns(conversation: TAgentConversation) {
  const isUpdates = conversation.id === UPDATES_ID
  return conversation.turns.map((t) => {
    if (t.kind === 'user')
      return (
        <AgentMessage key={t.id} role="user" className={USER_BUBBLE_WRAP} attachments={t.attachments}>
          {t.text}
        </AgentMessage>
      )
    // Updates:代理主動發的通知用 Chat 對方泡泡(2026-10-30 user:「update 的訊息串樣式能套用 chat bubble 的樣式,比較方便判讀」),
    // 外層仍是 AgentMessage(AgentConversation 靠直接子節點排版);通知不放複製 / 讚 / 倒讚工具列(Chat 泡泡也沒有)。
    if (isUpdates)
      return (
        <AgentMessage key={t.id} role="agent">
          <UpdateBubble name={TAGENT_LABEL} time={t.time}>{t.body}</UpdateBubble>
        </AgentMessage>
      )
    return (
      <AgentMessage
        key={t.id}
        role="agent"
        toolbar={
          t.thinking || t.stopped ? undefined : (
            <AgentToolbar
              onCopy={() => void navigator.clipboard?.writeText(t.copyText ?? '').catch(() => {})}
              onLike={() => {}}
              onDislike={() => {}}
            />
          )
        }
      >
        {/* 沒有任何步驟的回合(劇本裡代理主動發的進度更新)不顯示思考塊,只在回覆中閃一下微光 */}
        {(t.thinking || t.steps.length > 0) && <AgentThinking thinking={t.thinking} steps={t.steps} currentStep={t.currentStep} />}
        {t.body}
      </AgentMessage>
    )
  })
}

const DEMO_FILES = ['kubectl-describe-pod.txt', 'argocd-sync.log', 'error-screenshot.png']

/** 輸入盒;`+` 加示範檔案。 */
export function TAgentPrompt({
  engine,
  draft,
  onDraftChange,
  onSend,
  placeholder = `Ask ${TAGENT_LABEL}…`,
}: {
  engine: TAgentEngine
  draft: string
  onDraftChange: (value: string) => void
  onSend: (text: string, attachments: AgentPromptAttachment[]) => void
  placeholder?: string
}) {
  const [attachments, setAttachments] = useState<AgentPromptAttachment[]>([])
  return (
    <AgentPromptInput
      value={draft}
      onValueChange={onDraftChange}
      onSubmit={() => {
        const text = draft.trim()
        if (!text || engine.busy) return
        onSend(text, attachments)
        setAttachments([])
      }}
      busy={engine.busy}
      onStop={engine.stop}
      placeholder={placeholder}
      attachments={attachments}
      onRemoveAttachment={(a) => setAttachments((prev) => prev.filter((x) => x.id !== a.id))}
      onAddAttachment={() => {
        setAttachments((prev) => {
          const label = DEMO_FILES[prev.length % DEMO_FILES.length]
          return prev.some((x) => x.label === label) ? prev : [...prev, { id: nextId('f'), label }]
        })
      }}
    />
  )
}
