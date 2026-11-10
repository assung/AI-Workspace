// Push banner 情境總覽(2026-11-07)。設計審閱用:每個情境一張真卡 + 對到流程圖哪一關 + 行為說明;
// 「Play」把那張卡送進右上角的真疊放區,看計時、停留暫停、同對話合併、最多 3 張。
// UI 文案英文;說明文字中文(給設計 / PM 審閱)。
import { useState } from 'react'
import { Button, DataTable, Separator, Switch } from '@qijenchen/design-system'
import { Play } from 'lucide-react'
import { BannerStack, NotificationBanner, useBannerStack, type BannerData } from './NotificationBanner'

const AVATAR: Record<string, string> = Object.fromEntries(
  Object.entries(import.meta.glob<string>('./assets/avatars/*.jpg', { eager: true, import: 'default' })).map(
    ([path, url]) => [path.replace(/^.*\/|\.jpg$/g, ''), url],
  ),
)
const P = {
  shinichi: { name: 'Kudo Shinichi 工藤新一', avatarUrl: AVATAR.shinichi },
  guanyu: { name: 'Chen Guan-Yu 陳冠宇', avatarUrl: AVATAR.guanyu },
  kenji: { name: 'Takahashi Kenji 高橋健二', avatarUrl: AVATAR.kenji },
  yating: { name: 'Lin Ya-Ting 林雅婷', avatarUrl: AVATAR.yating },
  yui: { name: 'Watanabe Yui 渡邊結衣', avatarUrl: AVATAR.yui },
  ai: { name: 'Haibara Ai 灰原哀', avatarUrl: AVATAR.ai },
}

type Scenario = { title: string; gate: string; behavior: string; data: BannerData; showPreview?: boolean }

const DELIVERED: Scenario[] = [
  {
    title: 'Chats — 一對一新訊息',
    gate: 'Chats › New messages = Banner and badge',
    behavior: '10 秒後收起;滑鼠停留或回覆中暫停。Reply 直接在卡上回,送出後顯示「Reply sent」3 秒收起。點內容 = 打開該聊天。',
    data: { id: 'dm', threadKey: 'chat:shinichi', app: 'chats', actor: P.shinichi, body: 'The Lugu Co-op samples arrived. Can you confirm the 20 kg order before 3 PM?', reply: true, time: 'now' },
  },
  {
    title: 'Chats — 群組 @提及',
    gate: 'Chats › @mentions',
    behavior: '來源列帶群組名;「為什麼收到」寫 You were @mentioned。',
    data: { id: 'mention', threadKey: 'chat:product-team', app: 'chats', context: 'Product Team 產品團隊', actor: P.guanyu, body: '@Me 我 can you confirm the launch date for the Q4 tasting kit?', reason: 'You were @mentioned', reply: true, time: 'now' },
  },
  {
    title: 'Chats — 同一對話連續訊息(合併)',
    gate: 'Display › Group notifications = On(預設)',
    behavior: '不疊出一排同一個人:新訊息取代舊卡,標題後顯示則數,內文換成最新一則,計時重來。設定關閉時每則各一張。',
    data: { id: 'grouped', threadKey: 'chat:kenji', app: 'chats', actor: P.kenji, count: 3, body: 'Also, the roaster is free on Thursday if we need a second batch.', reply: true, time: 'now' },
  },
  {
    title: 'Tasks — 指派給你',
    gate: 'Tasks › Assigned to you',
    behavior: 'Open task 打開任務;沒有其他就地動作(接不接任務要看內容,不在卡上決定)。',
    data: { id: 'assigned', app: 'tasks', context: 'Q4 Tasting Program', actor: P.guanyu, body: 'Assigned you “Prepare blind tasting scorecard” · Due Fri, Nov 14', actions: [{ label: 'Open task' }], time: '2m' },
  },
  {
    title: 'Tasks — 到期提醒(系統)',
    gate: 'Tasks › Due date reminders',
    behavior: '沒有發送人 → 用 app 圖示取代頭像。Mark complete 就地完成,卡片換成結果後收起。',
    data: { id: 'due', app: 'tasks', context: 'Q4 Tasting Program', title: 'Due in 2 hours', body: 'Send moisture readings for batch #3 to the lab', actions: [{ label: 'Mark complete', primary: true, result: 'Marked complete' }, { label: 'Open task' }], time: 'now' },
  },
  {
    title: 'Docs — 留言 @提及',
    gate: 'Docs › @mentions',
    behavior: 'Reply 回覆的是那則留言串,不是整份文件。',
    data: { id: 'doc', app: 'docs', context: 'Q4 Launch Plan', actor: P.yui, body: '@Me 我 can you add the vendor list to section 3 before Monday’s review?', reason: 'You were @mentioned in a comment', reply: true, actions: [{ label: 'Open doc' }], time: 'now' },
  },
  {
    title: 'Drive — 存取申請(就地核准)',
    gate: 'Drive › Access requests',
    behavior: '專案目標 2「在情境內完成」的代表:Approve 直接授權,卡片換成「Access granted…」3 秒後收起;Open 去檔案頁再決定。',
    data: { id: 'access', app: 'drive', context: 'Packaging mockups – Q4.fig', actor: P.yating, body: 'Requested edit access', actions: [{ label: 'Approve', primary: true, result: 'Access granted to Lin Ya-Ting' }, { label: 'Open' }], time: 'now' },
  },
]

const VARIANTS: Scenario[] = [
  {
    title: '緊急訊息',
    gate: '第 1 關:寄件人標記緊急',
    behavior: '穿過暫停、會議靜音、系統勿擾;不自動收起,直到讀取或關閉。Teams 每 2 分鐘再提醒,最多 20 分鐘。螢幕閱讀器用 role=alert。',
    data: { id: 'urgent', threadKey: 'chat:ai', app: 'chats', actor: P.ai, body: 'Lab results for batch #3 failed the moisture check. Please hold the shipment.', urgent: true, reply: true, time: 'now' },
  },
  {
    title: '暫停中,優先聯絡人仍通知',
    gate: '第 4 關:暫停 + Let priority contacts through',
    behavior: '「為什麼收到」說明是因為優先名單才穿過暫停,使用者知道其他人的通知被擋下了。',
    data: { id: 'priority', threadKey: 'chat:guanyu', app: 'chats', actor: P.guanyu, body: 'Quick one — are we still on for the 4 PM tasting?', reason: 'Priority contact · notifications are paused', reply: true, time: 'now' },
  },
  {
    title: '靜音的聊天,被直接 @',
    gate: '第 3 關:聊天被靜音 → 有直接 @你',
    behavior: '靜音只擋一般訊息;直接 @ 仍跳,並說明這是靜音聊天。',
    data: { id: 'muted', threadKey: 'chat:engineering', app: 'chats', context: 'Engineering', actor: P.kenji, body: '@Me 我 the PR for the tasting form is ready for your review.', reason: 'You were @mentioned · this chat is muted', reply: true, time: 'now' },
  },
  {
    title: '會議中,只放行這場會議的聊天',
    gate: '第 5 關:會議中靜音',
    behavior: '開了 Mute during meetings and calls 時,只有目前會議的聊天會跳。',
    data: { id: 'meeting', threadKey: 'chat:weekly', app: 'chats', context: 'Weekly tasting sync', actor: P.yui, body: 'Sharing the scorecard link here for everyone.', reason: 'From your current meeting', reply: true, time: 'now' },
  },
  {
    title: '訊息預覽關閉',
    gate: 'Display › Show message preview = Off',
    behavior: '只說誰、在哪裡;內文不顯示(投影、分享螢幕時不洩漏)。',
    showPreview: false,
    data: { id: 'nopreview', threadKey: 'chat:product-team-2', app: 'chats', context: 'Product Team 產品團隊', actor: P.guanyu, body: 'Budget numbers for Q4 are attached.', reply: true, time: 'now' },
  },
]

const SUPPRESSED: { gate: string; outcome: string; example: string }[] = [
  { gate: '這類通知 = Off', outcome: '不通知,也不加徽章', example: 'Chats › Reactions 設成 Off' },
  { gate: '這類通知 = Badge only', outcome: '只加未讀徽章', example: 'Drive › Shared with you(預設)' },
  { gate: '聊天被靜音,沒有直接 @', outcome: '不通知', example: '在已靜音的 Engineering 收到一般訊息' },
  { gate: '暫停中,寄件人不在優先名單', outcome: '只加未讀徽章', example: '暫停 1 小時期間,Shinichi 傳訊息' },
  { gate: '會議中靜音,不是這場會議', outcome: '只加未讀徽章', example: '開會時 Tasks 指派通知' },
  { gate: '系統勿擾 / 專注模式開著', outcome: '只加未讀徽章', example: 'macOS 專注模式期間任何非緊急通知' },
]

const SUPPRESSED_COLUMNS = [
  { accessorKey: 'gate', header: '關卡', meta: { width: 280 } },
  { accessorKey: 'outcome', header: '結果', meta: { width: 200 } },
  { accessorKey: 'example', header: '例子' },
]

export function BannerGallery() {
  const stack = useBannerStack()
  // 對應設定 Display › Group notifications;在總覽頁可直接切換,按兩次同一張 Play 看差別
  const [group, setGroup] = useState(true)
  let n = 0
  const play = (s: Scenario) => stack.push({ ...s.data, id: `${s.data.id}-${Date.now()}-${n++}`, count: undefined }, group)

  return (
    <div className="h-screen overflow-y-auto bg-canvas text-foreground">
      <div className="mx-auto flex max-w-[1080px] flex-col gap-10 px-6 py-10">
        <header className="flex flex-col gap-2">
          <p className="text-caption font-semibold uppercase tracking-wide text-fg-secondary">tWorkspace · In-app notifications</p>
          <h1 className="text-h3 font-semibold">Push banner scenarios</h1>
          <p className="max-w-[68ch] text-body text-fg-secondary">
            每張卡對到「Teams 通知決策流程圖」的一道關卡。按 Play 會把卡片送進右上角真的疊放區:10 秒收起、滑鼠停留暫停、同一對話合併、最多 3 張。
            操作回饋的 Toast 在右下,別人找你的 banner 在右上,兩者不搶同一個角落。
          </p>
          <Switch
            className="pt-2"
            label="Group notifications"
            description="對應設定 Display › Group notifications。開:同一來源連按 Play 會收合成一張並累計則數;關:每則各一張。"
            checked={group}
            onCheckedChange={setGroup}
          />
        </header>

        <ScenarioSection title="會跳橫幅:各 app 的一般情境" items={DELIVERED} onPlay={play} />
        <Separator />
        <ScenarioSection title="會跳橫幅:流程圖關卡造成的變體" items={VARIANTS} onPlay={play} />
        <Separator />

        <section className="flex flex-col gap-4">
          <h2 className="text-h5 font-semibold">不跳橫幅的情況</h2>
          <p className="max-w-[68ch] text-body text-fg-secondary">tWorkspace 沒有活動摘要,被擋下的通知只留未讀徽章(NavRail 分頁上的數字、列表上的紅點)。</p>
          <DataTable
            columns={SUPPRESSED_COLUMNS}
            data={SUPPRESSED}
            getRowId={(r: (typeof SUPPRESSED)[number]) => r.gate}
            aria-label="Cases that do not show a banner"
          />
        </section>
      </div>
      <BannerStack items={stack.items} onDismiss={stack.dismiss} showPreview />
    </div>
  )
}

function ScenarioSection({ title, items, onPlay }: { title: string; items: Scenario[]; onPlay: (s: Scenario) => void }) {
  return (
    <section className="flex flex-col gap-6">
      <h2 className="text-h5 font-semibold">{title}</h2>
      <div className="grid grid-cols-1 gap-x-10 gap-y-8 lg:grid-cols-2">
        {items.map((s) => (
          <article key={s.data.id} className="flex min-w-0 flex-col gap-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 flex-col gap-1">
                <h3 className="text-body font-semibold">{s.title}</h3>
                <p className="text-caption text-fg-secondary">關卡:{s.gate}</p>
              </div>
              <Button variant="secondary" size="sm" startIcon={Play} onClick={() => onPlay(s)}>Play</Button>
            </div>
            <NotificationBanner data={s.data} showPreview={s.showPreview ?? true} onDismiss={() => {}} onOpen={() => {}} />
            <p className="max-w-[60ch] text-body text-fg-secondary">{s.behavior}</p>
          </article>
        ))}
      </div>
    </section>
  )
}
