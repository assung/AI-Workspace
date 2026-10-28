import type { Meta, StoryObj } from '@storybook/react'
import App from './App'

// @story-baseline: node_modules/@qijenchen/design-system — AppShell/展示 `FourRegions`(Menu + Main)、Sidebar + TreeView、Breadcrumb
//
// tWorkspace — Docs 分頁(2026-10-28 keyscreen → 同日 user 確認後加入 prototype;NavRail 的 Docs 即此頁)。
const meta: Meta<typeof App> = {
  title: 'Apps/chat/Docs',
  component: App,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'tWorkspace 的 Docs 分頁:左側空間選擇器、Overview 與頁面樹;右側為空間概覽或頁面文章,頁面的頁首呈現麵包屑。',
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
  render: () => <App config={{ agent: true, initialTab: 'docs' }} />,
}

/** 頁面:My space › Q4 Tasting Program › Friday tasting run sheet —— 頁首麵包屑 + Confluence 式文章。 */
export const PageView: Story = {
  name: '頁面',
  render: () => <App config={{ agent: true, initialTab: 'docs', initialDocsRoute: { space: 'my', page: 'run-sheet' } }} />,
}
