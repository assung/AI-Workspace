// tAgent — tWorkspace 的智慧代理:對話資料(engine)+ 側邊面板(TAgentDock)+ 兩個 surface 共用的訊息 / 輸入元件。
// tAgent 整頁(NavRail 的 tAgent 分頁)在 TAgentPage.tsx。
//
// ── 消費的 SSOT ──────────────────────────────────────────────────────────────
// - DS AgentPanel 家族(agent-panel.spec.md):AgentPanelDock(面板 ↔ 入口鈕互斥 + logoState 同步)、
//   AgentPanel(並排 / 右側浮層,形態由 AppShell 決定;可拖寬,DS 預設 360 / 400 / 640)、AgentPanelHeader(歷史浮層 / 新對話 / 關閉)、
//   AgentConversation(log + 自動捲動 + 最後一則工具列常駐)、AgentMessage、AgentThinking、AgentToolbar、
//   AgentPromptInput(附件 Tag + 送出 ↔ 停止)、AgentDecisionCard / AgentDecisionSummary。
// - 空狀態 = DS Empty + AgentLogo attract 48(spec「附:空狀態」)。
// - 側邊面板的版面 = DS AppShell 的 AI agent 區(`agent` slot;app-shell.spec.md「版面規則」,DS beta.148):並排 / 右側浮層 /
//   寬度紀錄 / §4 連帶關閉全由 AppShell 現算(DS app-shell.stories.tsx `IssueAssistant` 同款)。
// - 本檔不寫任何自訂視覺(色 / 字 / 間距)—— 只有清單縮排用 Tailwind list utilities 承載代理內文。
//
// 對話資料只有一份(2026-10-23):`useTAgentEngine`(App 持有),側邊面板與 tAgent 整頁讀寫同一份;各 surface 只自管「目前看哪一則」與草稿。
// 側邊面板的範圍(2026-10-22 定,2026-10-23 user 重申「叫出時預設對左側內容頁互動,除非使用者指定互動範圍」):
// 輸入盒預帶「目前聊天室」為可移除附件(context chip),切換聊天室時跟著換(使用者在該聊天室移除後不再自動帶入)。
// 整頁沒有「左側內容頁」→ 預設不帶 context chip,範圍 = 整個 workspace;使用者用 + 自行加附件指定範圍。

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  AgentPanelDock,
  AgentPanel,
  AgentPanelHeader,
  AgentConversation,
  AgentMessage,
  AgentThinking,
  AgentToolbar,
  AgentPromptInput,
  AgentDecisionCard,
  AgentDecisionSummary,
  AgentLogo,
  Empty,
  useAppShell,
  type AgentLogoState,
  type AgentConversationSummary,
  type AgentPromptAttachment,
  type AgentDecisionQuestion,
} from '@qijenchen/design-system'

// ── Public contract with App.tsx ──────────────────────────────────────────────
export type TAgentRoomRef = { id: string; title: string }

// 介面名稱(2026-10-29 user:「tAgent 改名為 AI agent」;程式識別字仍用 TAgent*)
export const TAGENT_LABEL = 'AI agent'

// ── Conversation model ────────────────────────────────────────────────────────
type Link = { roomId: string; messageId: string; label: string }

type AgentTurn = {
  kind: 'agent'
  id: string
  thinking: boolean
  steps: string[]
  currentStep?: string
  body?: ReactNode
  copyText?: string
  stopped?: boolean
}

type Turn =
  | { kind: 'user'; id: string; text: string; attachments: AgentPromptAttachment[] }
  | AgentTurn
  | { kind: 'summary'; id: string; entries: Array<{ question: string; answer: string }> }

export type TAgentConversation = {
  id: string
  title: string
  /** 歷史浮層分組(AgentPanelHeader `group`) */
  group: string
  /** 釘選(整頁側欄的 Pinned 群組;2026-10-23) */
  pinned?: boolean
  turns: Turn[]
  decision?: AgentDecisionQuestion[]
}

const GROUP_TODAY = 'Today'
const GROUP_WEEK = 'Previous 7 days'
const NEW_CONVERSATION_TITLE = 'New conversation'

// Real business data — 對齊 App.tsx INITIAL_ROOMS(Kudo Shinichi DM m4/m6/m7、Tea Tasting g4)。
const ROOM_SHINICHI: TAgentRoomRef = { id: 'shinichi', title: 'Kudo Shinichi 工藤新一' }
const ROOM_TEA: TAgentRoomRef = { id: 'tea-team', title: 'Tea Tasting 品茶小組' }

const FOLLOW_UP_QUESTIONS: AgentDecisionQuestion[] = [
  {
    id: 'task',
    label: 'Create a task for the 20 kg reservation?',
    options: [
      { value: 'create', label: 'Create task', description: 'Assigned to you, due Friday before the tasting' },
      { value: 'skip', label: 'Not now', description: 'Keep it as a note in this conversation' },
    ],
  },
  {
    id: 'reply',
    label: 'How should I follow up with Shinichi?',
    options: [
      { value: 'draft', label: 'Draft only', description: 'Show the message here so you can review it first' },
      { value: 'send', label: 'Send now', description: 'Post it in your DM with Shinichi' },
    ],
  },
]

const FOLLOW_UP_DRAFT =
  "Hi Shinichi — I've reserved 20 kg of Dong Ding batch #3. For Friday, let's keep the tasting internal and share the final pick with the retail buyers next week. OK with you?"

/**
 * 代理內文的「導向 Main / 別的頁面」動作由 surface 決定(2026-10-23):
 * 側邊面板 = 切聊天室 + flash 訊息 + `navigateFromAgent()`(浮層時讓位);整頁 = 切到 Chat 分頁再定位。
 * 內文(含 seed 對話)只寫 `<SourceLink>`,渲染在哪個 surface 就用那個 surface 的動作。
 */
export type TAgentNavigate = (roomId: string, messageId: string) => void
const TAgentNavigateContext = createContext<TAgentNavigate>(() => {})

function SourceLink({ link }: { link: Link }) {
  const navigate = useContext(TAgentNavigateContext)
  return (
    <a
      href={`#${link.roomId}/${link.messageId}`}
      onClick={(e) => {
        e.preventDefault()
        navigate(link.roomId, link.messageId)
      }}
    >
      {link.label}
    </a>
  )
}

/**
 * 代理內文打開 Docs 的某一頁(由 surface 提供,同 SourceLink 的導航)。
 * 整頁 = 切到 Docs 分頁開該頁,並把這則對話帶進 Docs 頁的側邊面板(`fromConversationId`,2026-10-29 user:
 * 「導到 doc 看 SOP 時 agent panel 打開並帶入對話,看完可以在 doc 頁繼續對話」);側邊面板 = 在 Docs 頁內換頁。
 */
export type TAgentOpenDoc = (space: string, page: string, fromConversationId?: string) => void
const TAgentOpenDocContext = createContext<TAgentOpenDoc>(() => {})
export function TAgentOpenDocProvider({ openDoc, children }: { openDoc: TAgentOpenDoc; children: ReactNode }) {
  return <TAgentOpenDocContext.Provider value={openDoc}>{children}</TAgentOpenDocContext.Provider>
}
export function DocLink({ space, page, children }: { space: string; page: string; children: ReactNode }) {
  const openDoc = useContext(TAgentOpenDocContext)
  return (
    <a
      href={`/docs/${space}/${page}`}
      onClick={(e) => {
        e.preventDefault()
        openDoc(space, page)
      }}
    >
      {children}
    </a>
  )
}

/**
 * 工單號連結(劇本「已開單 #SD-2318」;2026-10-29 user:「單號以連結樣式呈現,先做成假連結,之後要連到哪再跟你說」)。
 * 目前點了不導航;接上 Service Desk 後把 href 換成工單網址。
 */
export function TicketLink({ id }: { id: string }) {
  return (
    <a href={`#ticket-${id}`} onClick={(e) => e.preventDefault()}>
      #{id}
    </a>
  )
}

// ── 劇本(demo 用,2026-10-29 user:「prototype 在 demo 時照我寫好的對話劇本演示」)──────────────
// 使用者的每一句預先填進輸入盒(按 Enter 送出;改了字也照樣推進);代理的回覆依序播放,
// 連續的代理回合自動接續,`afterMs` = 主動發的進度更新(前一則結束後隔多久出現)。
// 劇本只在「新對話」起頭時啟動一次;跑完(或另開對話)後回到一般行為。
export type TAgentScriptStep =
  | { who: 'user'; text: string }
  | { who: 'agent'; steps: string[]; body: ReactNode; copyText: string; afterMs?: number }
export type TAgentScript = { title: string; steps: TAgentScriptStep[] }

function seedConversations(): TAgentConversation[] {
  return [
    {
      id: 'c-dongding',
      title: 'Dong Ding batch #3 catch-up',
      group: GROUP_TODAY,
      pinned: true,
      turns: [
        {
          kind: 'user',
          id: 'u1',
          text: 'Catch me up on the Dong Ding batch. What is still waiting on me?',
          attachments: [{ id: `room:${ROOM_SHINICHI.id}`, label: ROOM_SHINICHI.title }],
        },
        {
          kind: 'agent',
          id: 'a1',
          thinking: false,
          steps: [
            `Read 7 messages in ${ROOM_SHINICHI.title}`,
            `Read 5 messages in ${ROOM_TEA.title}`,
            'Checked Tasks — no task for the 20 kg reservation',
          ],
          copyText:
            'Batch #3 from the Lugu Co-op is the standout. You said you would block 20 kg, but there is no task for it yet. Kenji fixed the 95°C water temperature drift. Your question about inviting the retail buyers to Friday is still open.',
          body: (
            <>
              <p className="mt-2">Here is where things stand:</p>
              <ul className="mt-2 flex list-disc flex-col gap-1 pl-5">
                <li>
                  Batch #3 from the Lugu Co-op is the standout — lighter body this spring, but the moisture readings and leaf unfurl look right (
                  <SourceLink link={{ roomId: ROOM_SHINICHI.id, messageId: 'm6', label: 'Shinichi, 9:23 AM' }} />
                  ).
                </li>
                <li>
                  You said you would block 20 kg of #3, but there is no task for it yet (
                  <SourceLink link={{ roomId: ROOM_SHINICHI.id, messageId: 'm7', label: 'you, 9:25 AM' }} />
                  ).
                </li>
                <li>
                  Kenji fixed the 95°C water temperature drift, so Friday's tasting runs at spec (
                  <SourceLink link={{ roomId: ROOM_TEA.id, messageId: 'g4', label: 'Tea Tasting, 8:52 AM' }} />
                  ).
                </li>
              </ul>
              <p className="mt-2">
                Still open: whether to invite the retail buyers to Friday's tasting. I can set up the reservation and follow up with Shinichi.
              </p>
            </>
          ),
        },
      ],
      decision: FOLLOW_UP_QUESTIONS,
    },
    {
      id: 'c-buyers',
      title: 'Retail buyer list for Q3',
      group: GROUP_TODAY,
      turns: [
        { kind: 'user', id: 'u1', text: 'Which retail buyers joined a tasting this quarter?', attachments: [] },
        {
          kind: 'agent',
          id: 'a1',
          thinking: false,
          steps: ['Searched Chat for "buyer" since 07/01', 'Checked the Q3 tasting calendar'],
          copyText: 'Three buyers joined a tasting this quarter: Leaf & Kettle, Hsinchu Tea House, and Morning Steep.',
          body: (
            <p className="mt-2">
              Three buyers joined a tasting this quarter: Leaf &amp; Kettle (07/18), Hsinchu Tea House (08/09), and Morning Steep (09/12). None of them is on Friday's list yet.
            </p>
          ),
        },
      ],
    },
    {
      id: 'c-roast',
      title: 'Roast profile notes from Lugu Co-op',
      group: GROUP_WEEK,
      turns: [
        { kind: 'user', id: 'u1', text: 'Summarize the roast notes for the spring Dong Ding batches.', attachments: [] },
        {
          kind: 'agent',
          id: 'a1',
          thinking: false,
          steps: [`Read 7 messages in ${ROOM_SHINICHI.title}`],
          copyText: 'Spring batches are lighter in body after a dry March; batch #3 has the most even roast.',
          body: <p className="mt-2">Spring batches are lighter in body after a dry March. Batch #3 has the most even roast and the best color — golden amber with no green tint.</p>,
        },
      ],
    },
    {
      id: 'c-staging',
      title: 'Staging deploy checklist',
      group: GROUP_WEEK,
      turns: [
        { kind: 'user', id: 'u1', text: 'Is the staging deploy done?', attachments: [] },
        {
          kind: 'agent',
          id: 'a1',
          thinking: false,
          steps: ['Read 2 messages in Product Team 產品團隊'],
          copyText: 'Yes. Kenji reported the deploy is green and shipped to staging at 11:02 AM.',
          body: <p className="mt-2">Yes. Kenji reported the deploy is green and shipped it to staging at 11:02 AM.</p>,
        },
      ],
    },
  ]
}

const USER_BUBBLE_WRAP = '[&>div]:min-w-0 [&>div]:[overflow-wrap:anywhere] [&>div>div>*]:max-w-full [&>div>div>*>span]:min-w-0 [&>div>div>*>span]:truncate'

let idSeq = 0
const nextId = (p: string) => `${p}-${Date.now().toString(36)}-${(idSeq++).toString(36)}`

const optionLabel = (q: AgentDecisionQuestion, value: string) =>
  q.options.find((o) => o.value === value)?.label ?? value

const titleFrom = (text: string) => (text.length > 48 ? `${text.slice(0, 48)}…` : text)

// ── Engine(App 持有,兩個 surface 共用)────────────────────────────────────────
export type TAgentEngine = ReturnType<typeof useTAgentEngine>

export function useTAgentEngine({ onSendToRoom, script, isViewing, onBackgroundReply }: {
  /** 代理代使用者送出訊息(決策卡選「Send now」);回傳新訊息 id 供「view message」連結使用。 */
  onSendToRoom: (roomId: string, text: string) => string
  /** demo 劇本(見 TAgentScript);省略 = 一般行為 */
  script?: TAgentScript
  /** 使用者此刻是否正看著這則對話(整頁開著它,或側邊面板開著且顯示它);App 提供 */
  isViewing?: (convId: string) => boolean
  /**
   * 代理在使用者沒看著的對話裡回完一則(關了面板 / 離開 AI agent 頁時劇本仍在處理):該則記為未讀(紅點),並通知 App 發 Toast。
   * 2026-10-29 user:「使用者可能會關掉 Agent panel 或跳離 AI Agent 頁面,需要通知機制與紅點,讓使用者知道該任務已處理完成」
   */
  onBackgroundReply?: (conversation: { id: string; title: string }, replyText: string) => void
}) {
  const [conversations, setConversations] = useState<TAgentConversation[]>(seedConversations)
  const conversationsRef = useRef(conversations)
  conversationsRef.current = conversations
  const isViewingRef = useRef(isViewing)
  isViewingRef.current = isViewing
  const onBackgroundReplyRef = useRef(onBackgroundReply)
  onBackgroundReplyRef.current = onBackgroundReply
  // 有新回覆、使用者還沒打開看的對話(NavRail AI agent 圖示與對話列的紅點)
  const [unreadIds, setUnreadIds] = useState<ReadonlySet<string>>(() => new Set())
  const [busyConvId, setBusyConvId] = useState<string | null>(null)
  const [unseenReply, setUnseenReply] = useState(false)
  const timers = useRef<number[]>([])
  const busyTurnRef = useRef<{ convId: string; turnId: string } | null>(null)
  const sendToRoomRef = useRef(onSendToRoom)
  sendToRoomRef.current = onSendToRoom
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
        setUnseenReply(true)
        if (isViewingRef.current && !isViewingRef.current(convId)) {
          setUnreadIds((prev) => new Set(prev).add(convId))
          const conv = conversationsRef.current.find((c) => c.id === convId)
          onBackgroundReplyRef.current?.({ id: convId, title: conv?.title ?? NEW_CONVERSATION_TITLE }, copyText)
        }
        onDone?.()
      }, 900 * steps.length + 400),
    )
  }, [patchConversation, patchTurn])

  /** 從劇本第 pos 步開始播代理回合,直到下一句使用者的話(或劇本結束) */
  const playScriptFrom = useCallback((convId: string, pos: number) => {
    const step = script?.steps[pos]
    setScript(convId, pos)
    if (!step || step.who === 'user') return
    const start = () => runAgent(convId, step.steps, () => ({ body: step.body, copyText: step.copyText }), () => playScriptFrom(convId, pos + 1))
    if (step.afterMs) timers.current.push(window.setTimeout(start, step.afterMs))
    else start()
  }, [script, runAgent, setScript])

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

  /** 建一則空對話(側邊面板的「新對話」;空對話不進任何清單)。 */
  const createEmpty = useCallback(() => {
    const id = nextId('c')
    setConversations((prev) => [{ id, title: NEW_CONVERSATION_TITLE, group: GROUP_TODAY, turns: [] }, ...prev])
    return id
  }, [])

  /**
   * 送出一句話。`convId` 省略 = 開新對話(整頁的 New);回傳實際寫入的對話 id。
   * 有動靜的對話移到最前面(Recents / 歷史浮層依最近活動排序)。
   */
  const send = useCallback((convId: string | null, text: string, attachments: AgentPromptAttachment[]) => {
    const id = convId ?? nextId('c')
    const userTurn: Turn = { kind: 'user', id: nextId('u'), text, attachments }
    // 劇本:下一步是使用者的話,而且是「新對話起頭」(整頁 New = 沒有 id;側邊面板的新對話 = 還沒有內容)
    // 或「劇本那一則對話」→ 照劇本推進
    const sc = scriptRef.current
    const isFresh = convId === null || !conversationsRef.current.find((c) => c.id === convId)?.turns.length
    const scripted = !!script && script.steps[sc.pos]?.who === 'user'
      && (sc.convId === null ? isFresh && sc.pos === 0 : convId === sc.convId)
    setConversations((prev) => {
      const existing = prev.find((c) => c.id === id)
      const base: TAgentConversation = existing ?? { id, title: NEW_CONVERSATION_TITLE, group: GROUP_TODAY, turns: [] }
      const updated: TAgentConversation = {
        ...base,
        title: base.turns.length === 0 ? (scripted && script ? script.title : titleFrom(text)) : base.title,
        group: GROUP_TODAY,
        decision: undefined,
        turns: [...base.turns, userTurn],
      }
      return [updated, ...prev.filter((c) => c.id !== id)]
    })
    if (scripted) {
      playScriptFrom(id, sc.pos + 1)
      return id
    }
    const scope = attachments.map((a) => a.label)
    runAgent(
      id,
      [...scope.map((s) => `Searched ${s}`), 'Checked Chat, Tasks and Docs'],
      () => ({
        copyText: `I checked ${scope.length ? scope.join(', ') + ', ' : ''}your Chat, Tasks and Docs.`,
        body: (
          <p className="mt-2">
            I checked {scope.length ? `${scope.join(', ')}, ` : ''}your Chat, Tasks, and Docs, but nothing answers “{text}” directly yet. I can summarize a chat, list your open action items, or draft a reply — which would help?
          </p>
        ),
      }),
    )
    return id
  }, [runAgent, script, playScriptFrom])

  const resolveDecision = useCallback((convId: string, answers: Record<string, string>) => {
    const [qTask, qReply] = FOLLOW_UP_QUESTIONS
    const createTask = answers.task !== 'skip'
    const sendNow = answers.reply === 'send'
    patchConversation(convId, (c) => ({
      ...c,
      decision: undefined,
      turns: [
        ...c.turns,
        {
          kind: 'summary',
          id: nextId('s'),
          entries: [
            { question: qTask.label, answer: optionLabel(qTask, answers.task ?? 'create') },
            { question: qReply.label, answer: optionLabel(qReply, answers.reply ?? 'draft') },
          ],
        },
      ],
    }))
    runAgent(
      convId,
      [
        ...(createTask ? ['Created task “Reserve 20 kg Dong Ding #3” in Tasks'] : []),
        sendNow ? `Sent follow-up to ${ROOM_SHINICHI.title}` : 'Drafted follow-up for Shinichi',
      ],
      () => {
        if (sendNow) {
          const messageId = sendToRoomRef.current(ROOM_SHINICHI.id, FOLLOW_UP_DRAFT)
          return {
            copyText: FOLLOW_UP_DRAFT,
            body: (
              <p className="mt-2">
                {createTask ? 'Task created, due Friday. ' : ''}I sent your follow-up to Shinichi (
                <SourceLink link={{ roomId: ROOM_SHINICHI.id, messageId, label: 'view message' }} />
                ).
              </p>
            ),
          }
        }
        return {
          copyText: FOLLOW_UP_DRAFT,
          body: (
            <>
              <p className="mt-2">{createTask ? 'Task created, due Friday. ' : ''}Here is a draft for Shinichi — copy it when you are ready:</p>
              <p className="mt-2 border-l border-divider pl-3 text-fg-secondary">{FOLLOW_UP_DRAFT}</p>
            </>
          ),
        }
      },
    )
  }, [patchConversation, runAgent])

  const rename = useCallback((id: string, title: string) => patchConversation(id, (c) => ({ ...c, title })), [patchConversation])
  const togglePin = useCallback((id: string) => patchConversation(id, (c) => ({ ...c, pinned: !c.pinned })), [patchConversation])
  const remove = useCallback((id: string) => setConversations((prev) => prev.filter((c) => c.id !== id)), [])
  const clearUnseen = useCallback(() => setUnseenReply(false), [])
  const markRead = useCallback((id: string) => {
    setUnreadIds((prev) => {
      if (!prev.has(id)) return prev
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }, [])

  return {
    conversations,
    /** 有內容的對話(清單、歷史浮層只列這些) */
    listed: useMemo(() => conversations.filter((c) => c.turns.length > 0), [conversations]),
    busyConvId,
    busy: busyConvId !== null,
    /** 劇本的下一句使用者台詞(輪到使用者時才有),輸入盒預先填入;以及劇本跑在哪一則對話 */
    scriptPrefill: script && script.steps[scriptPos]?.who === 'user' ? (script.steps[scriptPos] as { text: string }).text : null,
    scriptConvId,
    unseenReply,
    clearUnseen,
    /** 未讀對話(已刪除的不算) */
    unreadIds,
    hasUnread: useMemo(() => conversations.some((c) => unreadIds.has(c.id)), [conversations, unreadIds]),
    markRead,
    send,
    stop,
    resolveDecision,
    createEmpty,
    rename,
    togglePin,
    remove,
  }
}

// ── 兩個 surface 共用的渲染 ──────────────────────────────────────────────────
/**
 * 對話內容(AgentConversation 的直接子節點必須是 AgentMessage —— 它靠直接子節點判定「最後一則代理訊息的工具列常駐」,
 * 所以這裡回傳元素陣列,不包一層元件)。
 */
export function renderTurns(conversation: TAgentConversation, onOpenRoom: (roomId: string) => void) {
  return conversation.turns.map((t) => {
    if (t.kind === 'user')
      return (
        <AgentMessage
          key={t.id}
          role="user"
          // DS 使用者泡泡沒有斷字:長網址(劇本的 Argo CD 連結)、長附件 chip 在側邊面板寬度下溢出泡泡右緣 → 允許任意處斷行、
          // chip 不超過泡泡寬(DS 待補,STRUCTURE.md §4.5)
          className={USER_BUBBLE_WRAP}
          attachments={t.attachments}
          onAttachmentClick={(a) => {
            if (a.id.startsWith('room:')) onOpenRoom(a.id.slice(5))
          }}
        >
          {t.text}
        </AgentMessage>
      )
    if (t.kind === 'summary')
      return (
        <AgentMessage key={t.id} role="agent">
          Continuing with your choices:
          <AgentDecisionSummary className="mt-2" entries={t.entries} />
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

/** 代理內文的導航動作(SourceLink 讀這個)。 */
export function TAgentNavigateProvider({ navigate, children }: { navigate: TAgentNavigate; children: ReactNode }) {
  return <TAgentNavigateContext.Provider value={navigate}>{children}</TAgentNavigateContext.Provider>
}

const DEMO_FILES = ['Friday tasting scoring sheet.xlsx', 'Lugu Co-op lab report.pdf', 'Q3 buyer list.docx']

/**
 * 輸入盒 + 決策卡(決策卡絕對定位覆蓋輸入盒 —— DS agent-panel.stories.tsx DecisionCardOpen 同款,`relative` 包住兩者)。
 * `contextChip` = 預設帶入的範圍(側邊面板 = 目前聊天室;整頁 = 無),可移除;`+` 加示範檔案。
 */
export function TAgentPrompt({
  engine,
  conversation,
  draft,
  onDraftChange,
  onSend,
  contextChip,
  onRemoveContext,
  placeholder = `Ask ${TAGENT_LABEL}…`,
}: {
  engine: TAgentEngine
  /** 目前對話(省略 = 還沒有對話,例如整頁的 New) */
  conversation?: TAgentConversation
  draft: string
  onDraftChange: (value: string) => void
  onSend: (text: string, attachments: AgentPromptAttachment[]) => void
  contextChip?: AgentPromptAttachment | null
  onRemoveContext?: () => void
  placeholder?: string
}) {
  const [extra, setExtra] = useState<AgentPromptAttachment[]>([])
  const attachments = contextChip ? [contextChip, ...extra] : extra
  return (
    <div className="relative">
      <AgentPromptInput
        value={draft}
        onValueChange={onDraftChange}
        onSubmit={() => {
          const text = draft.trim()
          if (!text || engine.busy) return
          onSend(text, attachments)
          setExtra([])
        }}
        busy={engine.busy}
        onStop={engine.stop}
        placeholder={placeholder}
        attachments={attachments}
        onRemoveAttachment={(a) => {
          if (a.id === contextChip?.id) onRemoveContext?.()
          else setExtra((prev) => prev.filter((x) => x.id !== a.id))
        }}
        onAddAttachment={() => {
          setExtra((prev) => {
            const label = DEMO_FILES[prev.length % DEMO_FILES.length]
            return prev.some((x) => x.label === label) ? prev : [...prev, { id: nextId('f'), label }]
          })
        }}
      />
      {conversation?.decision && !engine.busy && (
        <AgentDecisionCard
          questions={conversation.decision}
          onSubmit={(answers) => engine.resolveDecision(conversation.id, answers)}
          onSkip={(answers) => engine.resolveDecision(conversation.id, answers)}
        />
      )}
    </div>
  )
}

// ── 側邊面板(各內容頁的 AppShell AI agent 區:Tasks / Docs / Drive;Chat 暫不開放)──────────────────
/** 入口鈕初始位置:`home` = DS 預設右下角圓鈕;`above-input` = 貼右緣、在底部輸入區上方(Chat 用) */
export type TAgentDockPlacement = 'home' | 'above-input'

export function TAgentDock({
  open,
  onOpenChange,
  engine,
  context,
  onViewMessage,
  onOpenDoc,
  activeId,
  onActiveIdChange,
  placement = 'home',
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  engine: TAgentEngine
  /** 左側內容頁目前的位置(聊天室 / 任務清單 / 文件頁 / 資料夾)= 預設互動範圍,以 context chip 帶入;null = 不帶 */
  context: TAgentRoomRef | null
  /** 切到該聊天室並 flash 該則訊息(messageId 空 = 只切聊天室) */
  onViewMessage: (roomId: string, messageId: string) => void
  /** 代理內文的 Docs 連結 */
  onOpenDoc?: TAgentOpenDoc
  /** 面板目前看的對話(App 持有:點 NavRail AI agent 時整頁接著開這一則,2026-10-23 user) */
  activeId: string
  onActiveIdChange: (id: string) => void
  placement?: TAgentDockPlacement
}) {
  const { navigateFromAgent } = useAppShell()

  // Chat:入口鈕預設「貼邊」(2026-10-22 user 選):DS 為「被遮擋」設計的 28px 貼右緣形態,放在輸入框上方
  // (家 = 右下角會蓋到 Thread 的 Send reply、與主輸入框 0 間距)。y = 距 AppShell 頂;188 = 28 鈕 + 160 預留給底部輸入區。
  // Tasks / Docs / Drive 底部沒有輸入區 → DS 預設「家」(右下角圓鈕,agent-panel-fab.spec.md)。使用者可拖動;位置由 AgentPanelDock 保管。
  const [defaultPlacement] = useState(() =>
    placement === 'above-input'
      ? { kind: 'dock' as const, y: Math.max(0, (typeof window === 'undefined' ? 900 : window.innerHeight) - 188) }
      : undefined,
  )

  // 從代理導向 Main(app-shell.spec.md「版面規則」§4 末條):產品導航 + navigateFromAgent 同一個事件 ——
  // AI agent 是浮層 → 收起讓位、焦點回 Main;並排 → 不動。
  const navigate: TAgentNavigate = (roomId, messageId) => {
    onViewMessage(roomId, messageId)
    navigateFromAgent()
  }

  const setActiveId = onActiveIdChange
  const [draft, setDraft] = useState('')
  const [contextRemovedFor, setContextRemovedFor] = useState<string | null>(null)

  useEffect(() => {
    if (open) engine.clearUnseen()
  }, [open, engine.clearUnseen])

  const active = engine.conversations.find((c) => c.id === activeId)
  // 目前這則被刪掉(例如在整頁刪的)→ 切到最近一則;全空 → 開一則空對話(spec「附:歷史浮層」刪當前對話契約)
  useEffect(() => {
    if (active) return
    const next = engine.listed[0]
    setActiveId(next ? next.id : engine.createEmpty())
  }, [active, engine.listed, engine.createEmpty])

  const conversationEmpty = !active || active.turns.length === 0
  const contextChip: AgentPromptAttachment | null =
    !context || contextRemovedFor === context.id ? null : { id: context.id, label: context.title }

  // 劇本:輪到使用者時把台詞填進輸入盒(同整頁 TAgentPage)—— 劇本還沒開始 = 空對話;已開始 = 劇本那一則
  const prefillHere = engine.scriptPrefill !== null
    && (engine.scriptConvId === null ? conversationEmpty : active?.id === engine.scriptConvId)
  useEffect(() => {
    if (prefillHere && engine.scriptPrefill) setDraft(engine.scriptPrefill)
  }, [prefillHere, engine.scriptPrefill, activeId])
  const logoState: AgentLogoState = engine.busy ? 'think' : engine.unseenReply && !open ? 'attract' : 'still'

  const summaries: AgentConversationSummary[] = engine.listed.map((c) => ({
    id: c.id,
    title: c.title,
    group: c.group,
    thinking: engine.busyConvId === c.id,
  }))

  return (
    <AgentPanelDock
      open={open}
      onOpenChange={onOpenChange}
      logoState={logoState}
      defaultPlacement={defaultPlacement}
      aria-label={`Open ${TAGENT_LABEL}`}
      labels={{
        tooltip: `Ask ${TAGENT_LABEL}, or drag me aside`,
        tooltipDock: `Open ${TAGENT_LABEL}`,
        dock: 'Shrink button',
        home: 'Restore button',
      }}
    >
      {({ close, logoState: headerLogo }) => (
        <AgentPanel onClose={close} aria-label={TAGENT_LABEL} contentType="tagent">
          <AgentPanelHeader
            title={conversationEmpty ? NEW_CONVERSATION_TITLE : active.title}
            logoState={headerLogo}
            conversations={summaries}
            activeConversationId={active?.id}
            conversationEmpty={conversationEmpty}
            historySearchPlaceholder="Search conversations"
            historyEmptyText="No conversations"
            onSelectConversation={(id) => setActiveId(id)}
            onRenameConversation={engine.rename}
            onDeleteConversation={engine.remove}
            onNewConversation={() => {
              if (conversationEmpty) return
              setActiveId(engine.createEmpty())
              setDraft('')
            }}
            onClose={close}
          />
          <TAgentNavigateProvider navigate={navigate}>
            {conversationEmpty || !active ? (
              <div className="flex min-h-0 flex-1 items-center justify-center">
                <Empty
                  icon={<AgentLogo state="attract" size={48} label={TAGENT_LABEL} />}
                  title="What can I help with?"
                  description="Ask about your chats, tasks, and docs. The page you have open is attached as context."
                />
              </div>
            ) : (
              <TAgentOpenDocProvider openDoc={onOpenDoc ?? (() => {})}>
                <AgentConversation>{renderTurns(active, (roomId) => navigate(roomId, ''))}</AgentConversation>
              </TAgentOpenDocProvider>
            )}
          </TAgentNavigateProvider>
          <TAgentPrompt
            engine={engine}
            conversation={active}
            draft={draft}
            onDraftChange={setDraft}
            onSend={(text, attachments) => {
              setActiveId(engine.send(active?.id ?? null, text, attachments))
              setDraft('')
            }}
            contextChip={contextChip}
            onRemoveContext={() => context && setContextRemovedFor(context.id)}
          />
        </AgentPanel>
      )}
    </AgentPanelDock>
  )
}

/** NavRail 用的 tAgent 圖示:同一造型的 AgentLogo(spec「所有尺寸同一造型」,產品尺寸 16–48),尺寸由 DS Button 的 icon tier 決定。 */
export function TAgentRailIcon({ size = 16 }: { size?: number | string }) {
  return <AgentLogo size={Number(size)} state="still" />
}
