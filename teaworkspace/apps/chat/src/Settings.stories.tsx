import type { Meta, StoryObj } from '@storybook/react'
import App from './App'
import { BannerGallery } from './BannerGallery'

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
          'tWorkspace 的通知設定:Focus(暫停通知、優先名單、跟系統勿擾連動)/ Display(訊息預覽、通話中顯示通知、同一聊天收合橫幅)/ Native apps(目前只有 Chats:@Mentions 區塊有總開關,各種通知選 Show in banner / Off)。選項為 Checkbox,Switch 只當功能區塊總開關。左下頭像選單也能暫停通知。',
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

/** Chats 子頁:@Mentions 區塊(標題列總開關 + Everyone / Personal 兩個 Select)與 Messages 區塊。 */
export const ChatsNotifications: Story = {
  name: 'Notifications › Chats',
  render: () => <App config={{ agent: true, initialSettingsRoute: 'notifications/chats' }} />,
}

/** 優先名單子頁:暫停通知時,這些人的橫幅仍會出現。 */
export const PriorityContacts: Story = {
  name: 'Notifications › Priority contacts',
  render: () => <App config={{ agent: true, initialSettingsRoute: 'notifications/priority' }} />,
}

/** Push banner 情境總覽:每張卡對到流程圖的一道關卡;Play 送進右上角疊放區看計時與合併(BannerGallery.tsx)。 */
export const BannerScenarios: Story = {
  name: 'Push banner 情境總覽',
  render: () => <BannerGallery />,
}

/** Prototype 內的示範通知:開啟後 5 / 12 / 20 秒依序送出,照目前的通知設定決定跳不跳(先從頭像選單暫停,只剩優先聯絡人)。 */
export const LiveBanners: Story = {
  name: 'Push banner 實際觸發',
  render: () => <App config={{ agent: true, demoBanners: true }} />,
}
