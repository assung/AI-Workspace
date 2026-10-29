import type { Meta, StoryObj } from '@storybook/react'
import App from './App'

// @story-baseline: node_modules/@qijenchen/design-system — AppShell/展示 `FourRegions`(四區版面:Menu + Main + Right panel + AI agent)
//
// tWorkspace — tAgent(智慧代理)prototype。`config.agent` 開啟後,版面改用 DS AppShell 四區(app-shell.spec.md「版面規則」,DS beta.148):
// - NavRail(全域 app rail)在 AppShell 外;Menu = ChatList(DS Sidebar,offcanvas)、Main = Conversation、
//   Right panel = Thread(DS AppShellAside)、AI agent = tAgent(DS AgentPanelDock)。
// - 沒有固定斷點:依 Right → AI agent → Menu 的順序,只看各區最小寬,放得下就並排;放不下時 Thread 仍並排、
//   tAgent 變右側浮層、ChatList 暫藏(按頁首最左的開關叫出左側浮層)。再不夠才整個殼水平捲動。
// - 唯一的連帶關閉:使用者主動開 Thread 而放不下時,關閉 tAgent;只是視窗變窄不關任何面板。
// - tAgent = NavRail 的 tAgent 分頁 → 專屬整頁(TAgentPage.tsx):左側面板 New / Projects / Artifacts / Pinned / Recents,右側對話。
// - Chat 分頁的側邊面板(右緣入口鈕 / FAB)2026-10-23 起先不開放(user:「chat 部分請先幫我把 FAB 移除,目前先不開放 Chat 可以同時運用 ai agent」)。
//   程式保留在 `config.chatAgentPanel`(預設 false);下方三則 test-only story 打開它,只給回歸測試用,不出現在側欄與文件頁。
const meta: Meta<typeof App> = {
  title: 'Apps/chat/tAgent',
  component: App,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'tWorkspace 的智慧代理 tAgent:點左側 NavRail 的 tAgent 進入專屬整頁 —— 左側 New / Projects / Artifacts / Pinned / Recents,右側對話。Chat 分頁目前不提供代理側邊面板。版面照 DS AppShell 四區規則;一次性的確認或表單仍用 Dialog,回覆單則訊息的討論串用 Thread。',
      },
    },
  },
  tags: ['autodocs'],
}
export default meta
type Story = StoryObj<typeof App>

/**
 * tAgent 首頁(NavRail 的 tAgent 分頁):新對話首頁 —— 問候、輸入盒、建議;左側面板 New / Projects / Artifacts / Pinned / Recents。
 * 整頁不帶預設範圍(沒有左側內容頁),用 + 自行指定。
 */
export const AgentHome: Story = {
  name: 'tAgent 首頁(新對話)',
  render: () => <App config={{ agent: true, initialTab: 'agent' }} />,
}

/**
 * Demo 劇本(tagentScripts.tsx):payments-api 部到 staging ImagePullBackOff → 已知問題文章 → 無效 → 開單 SD-2318 → 值班接手 / 處理 → 結案。
 * 輸入盒預先填好使用者的下一句,按 Enter 推進;「Bob 接手」「已處理」兩則是代理主動發的進度更新,隔幾秒自動出現。
 * 劇本在 tWorkspace 預設開啟,tAgent 首頁(上一則)同樣從這裡開始;這一則只是讓演示入口在側欄好找。
 */
export const ScriptDemo: Story = {
  name: 'Demo 劇本:ImagePullBackOff 開單',
  render: () => <App config={{ agent: true, initialTab: 'agent' }} />,
}

/** test-only:劇本關閉時的一般行為(自由提問 → 通用回覆),回歸測試用。 */
export const AgentHomeNoScript: Story = {
  name: 'tAgent 首頁(劇本關閉,回歸用)',
  tags: ['test-only'],
  render: () => <App config={{ agent: true, initialTab: 'agent', agentScript: false }} />,
}

/** tAgent 整頁開著一則對話(從 Pinned 點進來):訊息與輸入盒同一欄置中;頁首可釘選、改名、刪除。 */
export const AgentConversationPage: Story = {
  name: 'tAgent 整頁對話',
  render: () => <App config={{ agent: true, initialTab: 'agent', initialAgentRoute: 'conversation:c-dongding' }} />,
}

/** Chat 分頁:淺灰左側 chrome,沒有 tAgent 入口鈕(2026-10-23 起 Chat 不開放側邊代理)。 */
export const Default: Story = {
  name: 'Chat 分頁',
  render: () => <App config={{ agent: true }} />,
}

// ── 以下 test-only:Chat 分頁側邊面板(config.chatAgentPanel)的回歸,暫不開放給使用者 ─────────
// story-rules.md「Technical probe visibility」:只服務自動化的 story 標 test-only(不進側欄與文件頁,仍在 index / direct URL)

/** Chat 分頁 + 側邊面板入口鈕(關閉)。 */
export const PanelEntryProbe: Story = {
  name: 'Chat 分頁側邊面板入口(回歸用)',
  tags: ['test-only'],
  render: () => <App config={{ agent: true, chatAgentPanel: true }} />,
}

/**
 * Chat 分頁的側邊面板開啟:「Dong Ding batch #3 catch-up」對話 —— 代理讀了兩個聊天室與 Tasks,回覆附來源連結,
 * 並以決策卡詢問要不要建立保留任務、怎麼回覆 Shinichi。
 */
export const PanelOpen: Story = {
  name: 'Chat 分頁的側邊面板(回歸用)',
  tags: ['test-only'],
  render: () => <App config={{ agent: true, chatAgentPanel: true, initialAgentOpen: true }} />,
}

/**
 * Thread 與 tAgent 同時開:兩者都放得下時並排,ChatList 依序最後排、放不下就暫藏。
 * 以 Main 600 + Thread 最小 320 + tAgent 最小 360 計,AppShell 寬 ≥ 1280 兩者才並排(再加 ChatList 240 要 1520);
 * 更窄時 tAgent 變右側浮層。
 */
export const ThreadAndAgent: Story = {
  name: 'Thread 與 tAgent 並存(回歸用)',
  tags: ['test-only'],
  render: () => <App config={{ agent: true, chatAgentPanel: true, initialAgentOpen: true, initialThreadId: 'm1' }} />,
}
