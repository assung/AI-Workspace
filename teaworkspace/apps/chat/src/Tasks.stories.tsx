import type { Meta, StoryObj } from '@storybook/react'
import App from './App'

// @story-baseline: node_modules/@qijenchen/design-system — AppShell/展示 `FourRegions`(Menu + Main)、DataTable 狀態欄 `display="tag"`
//
// tWorkspace — Tasks 分頁(2026-10-28 keyscreen → 同日 user 確認後加入 prototype;NavRail 的 Tasks 即此頁)。
// 版面、側欄、頁首與 tAgent 頁同一套(TasksPage.tsx 檔頭)。
const meta: Meta<typeof App> = {
  title: 'Apps/chat/Tasks',
  component: App,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'tWorkspace 的 Tasks 分頁:左側 My tasks 與 Projects,右側任務列表。My tasks 依 Upcoming / Overdue / Completed 分頁;專案頁列出整個專案的任務並顯示負責人。',
      },
    },
  },
  tags: ['autodocs'],
}
export default meta
type Story = StoryObj<typeof App>

/** 預設首頁:My tasks(Upcoming)。指派給我、未完成、今天以後到期的任務,依到期日排序。 */
export const MyTasks: Story = {
  name: 'My tasks',
  render: () => <App config={{ agent: true, initialTab: 'tasks' }} />,
}

/** 專案頁:Q4 Tasting Program 的所有任務(含其他成員),多一欄 Assignee。 */
export const ProjectTasks: Story = {
  name: '專案任務列表',
  render: () => <App config={{ agent: true, initialTab: 'tasks', initialTasksRoute: 'project:tasting' }} />,
}
