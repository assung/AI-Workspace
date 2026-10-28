import type { Meta, StoryObj } from '@storybook/react'
import App from './App'

// @story-baseline: node_modules/@qijenchen/design-system — AppShell/展示 `FourRegions`(Menu + Main)、Sidebar + TreeView、Breadcrumb
//
// tWorkspace — Docs 分頁 keyscreen(2026-10-28,user:「左側 Docs,下方 selector(預設 My space)、Overview、隔線、Content 頁面樹;
// 右側頁面頁,header 同 Drive 麵包屑,下方文章內容,類似 Confluence」)。只有本檔的 story 打開 `config.docsPage`;主 prototype 的 Docs 仍是佔位頁。
const meta: Meta<typeof App> = {
  title: 'Apps/chat/Docs (keyscreen)',
  component: App,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'tWorkspace 的 Docs 分頁(keyscreen,尚未加入 prototype):左側空間選擇器、Overview 與頁面樹;右側為空間概覽或頁面文章,頁面的頁首呈現麵包屑。',
      },
    },
  },
  tags: ['autodocs'],
}
export default meta
type Story = StoryObj<typeof App>

/** 首頁:My space 的 Overview —— 空間資訊、最近更新的頁。 */
export const Overview: Story = {
  name: 'Overview(首頁)',
  render: () => <App config={{ agent: true, initialTab: 'docs', docsPage: true }} />,
}

/** 頁面:My space › Q4 Tasting Program › Friday tasting run sheet —— 頁首麵包屑 + Confluence 式文章。 */
export const PageView: Story = {
  name: '頁面',
  render: () => <App config={{ agent: true, initialTab: 'docs', docsPage: true, initialDocsRoute: { space: 'my', page: 'run-sheet' } }} />,
}
