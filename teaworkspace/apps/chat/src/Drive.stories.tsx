import type { Meta, StoryObj } from '@storybook/react'
import App from './App'

// @story-baseline: node_modules/@qijenchen/design-system — AppShell/展示 `FourRegions`(Menu + Main)、Breadcrumb(declarative items)、DataTable
//
// tWorkspace — Drive 分頁 keyscreen(2026-10-28,user:「左側 Drive,下方 My drive 跟 Channel drives(跟 chat channel 連動),
// 首頁為 My drive;右側麵包屑路徑 + 列表呈現檔案」)。只有本檔的 story 打開 `config.drivePage`;主 prototype 的 Drive 仍是佔位頁。
const meta: Meta<typeof App> = {
  title: 'Apps/chat/Drive (keyscreen)',
  component: App,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'tWorkspace 的 Drive 分頁(keyscreen,尚未加入 prototype):左側 My drive 與 Channel drives(每個 Chat 群組頻道一個檔案區),右側麵包屑 + 檔案列表。點資料夾名稱進入資料夾,點麵包屑回上層;頻道檔案區可用「Open chat」回到該頻道。',
      },
    },
  },
  tags: ['autodocs'],
}
export default meta
type Story = StoryObj<typeof App>

/** 首頁:My drive 根目錄。只有一層,依麵包屑規範不顯示麵包屑,頁首標題即位置。 */
export const MyDrive: Story = {
  name: 'My drive',
  render: () => <App config={{ agent: true, initialTab: 'drive', drivePage: true }} />,
}

/** 進到兩層資料夾:麵包屑 My drive / Q4 Tasting Program / Tasting photos,末位與頁首標題同字。 */
export const InFolder: Story = {
  name: '資料夾內(麵包屑)',
  render: () => <App config={{ agent: true, initialTab: 'drive', drivePage: true, initialDriveRoute: { root: 'my', path: ['q4-tasting', 'tasting-photos'] } }} />,
}

/** 頻道檔案區:Tea Tasting 品茶小組 —— 頻道裡貼過的檔案;頁首「Open chat」回到該頻道。 */
export const ChannelDrive: Story = {
  name: '頻道檔案區',
  render: () => <App config={{ agent: true, initialTab: 'drive', drivePage: true, initialDriveRoute: { root: 'channel:tea-team', path: [] } }} />,
}
