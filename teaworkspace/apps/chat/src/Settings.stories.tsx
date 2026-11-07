import type { Meta, StoryObj } from '@storybook/react'
import App from './App'

// @story-baseline: node_modules/@qijenchen/design-system — Dialog/展示、Switch/展示、Select/展示、PeoplePicker/展示、AccountMenu/展示
//
// tWorkspace — Settings 的 Notifications 分類(2026-11-07,WorkspaceSettings.tsx)。
// 依「Teams 通知決策流程圖」的關卡逐一對到控制項;切換即生效(無 Save / Cancel)。
const meta: Meta<typeof App> = {
  title: 'Apps/chat/Settings',
  component: App,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'tWorkspace 的通知設定:Focus(暫停通知、優先名單、會議中靜音、跟系統勿擾連動)/ Display(訊息預覽、音效)/ Native apps(Chats / Tasks / Docs / Drive 各種通知選 Banner and badge / Badge only / Off)。左下頭像選單也能暫停通知。',
      },
    },
  },
  tags: ['autodocs'],
}
export default meta
type Story = StoryObj<typeof App>

/** Notifications 首頁:Focus / Display / Native apps 三區。 */
export const Notifications: Story = {
  name: 'Notifications',
  render: () => <App config={{ agent: true, initialSettingsRoute: 'notifications' }} />,
}

/** Chats 子頁:每種聊天通知選擇送達方式;說明靜音聊天被直接 @ 仍會通知。 */
export const ChatsNotifications: Story = {
  name: 'Notifications › Chats',
  render: () => <App config={{ agent: true, initialSettingsRoute: 'notifications/chats' }} />,
}

/** 優先名單子頁:暫停通知時,這些人的橫幅仍會出現。 */
export const PriorityContacts: Story = {
  name: 'Notifications › Priority contacts',
  render: () => <App config={{ agent: true, initialSettingsRoute: 'notifications/priority' }} />,
}
