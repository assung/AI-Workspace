// Push banner 情境總覽(2026-11-07)。設計審閱用:每個情境一張真卡 + 對到流程圖哪一關 + 行為說明;
// 「Play」把那張卡送進右上角的真疊放區,看計時、停留暫停、同對話合併、同時張數(預設 3,可設 3–5)。
// UI 文案英文;說明文字中文(給設計 / PM 審閱)。
import { useState } from 'react'
import { Button, Checkbox, DataTable, RadioGroup, RadioGroupItem, Select, Separator } from '@qijenchen/design-system'
import { CalendarDays, ClipboardCheck, Play } from 'lucide-react'
import { BannerStack, NotificationBanner, useBannerStack, type BannerData, type BannerSize } from './NotificationBanner'

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
    gate: 'Chats › Messages › New messages = Show in banner',
    behavior: '10 秒後收起;滑鼠停留或回覆中暫停。Reply 直接在卡上回,送出後顯示「Reply sent」3 秒收起。點內容 = 打開該聊天。',
    data: { id: 'dm', threadKey: 'chat:shinichi', app: 'chats', actor: P.shinichi, body: 'The Lugu Co-op samples arrived. Can you confirm the 20 kg order before 3 PM?', reply: true, time: 'now' },
  },
  {
    title: 'Chats — Personal @mention',
    gate: 'Chats › @Mentions › Personal @mentions',
    behavior: '來源列帶群組名;「為什麼收到」寫 You were @mentioned。',
    data: { id: 'mention', threadKey: 'chat:product-team', app: 'chats', context: 'Product Team 產品團隊', actor: P.guanyu, body: '@Me 我 can you confirm the launch date for the Q4 tasting kit?', reason: 'You were @mentioned', reply: true, time: 'now' },
  },
  {
    title: 'Chats — Everyone in the chat @mention',
    gate: 'Chats › @Mentions › Everyone in the chat @mentions',
    behavior: '@所有人 的廣播。「為什麼收到」寫 Everyone in the chat was @mentioned,跟點名自己的 Personal @mention 分開;在已靜音的聊天不會跳。',
    data: { id: 'everyone', threadKey: 'chat:tea-team', app: 'chats', context: 'Tea Tasting 品茶小組', actor: P.kenji, body: '@everyone Friday’s blind tasting moves to 3 PM in room No.3.', reason: 'Everyone in the chat was @mentioned', reply: true, time: 'now' },
  },
  {
    title: 'Chats — 群組裡的轉傳訊息',
    gate: 'Chats › Messages › New messages = Show in banner',
    behavior: '名字是轉傳的人;他附的話放上面,原訊息放在引用框裡,標出原作者(對照 Teams 聊天裡轉傳訊息的外框與 Forwarded 標頭)。Reply 回的是群組,不是原作者。Compact 收成一行「Forwarded a message from …」。',
    data: {
      id: 'forward', threadKey: 'chat:product-team', app: 'chats', context: 'Product Team 產品團隊', actor: P.yui,
      body: 'FYI, this changes our packaging timeline.',
      forwarded: { from: 'Haibara Ai 灰原哀', body: 'Lab results for batch #3 are in. Moisture is 0.4% over spec, so the lot needs another drying pass.' },
      reply: true, time: 'now',
    },
  },
  {
    title: 'Chats — 同一對話連續訊息(合併)',
    gate: 'Display › Group banners from the same chat = 勾選(預設)',
    behavior: '不疊出一排同一個人:新訊息取代舊卡,標題後顯示則數,內文換成最新一則,計時重來。設定關閉時每則各一張。',
    data: { id: 'grouped', threadKey: 'chat:kenji', app: 'chats', actor: P.kenji, count: 3, body: 'Also, the roaster is free on Thursday if we need a second batch.', reply: true, time: 'now' },
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
    title: '靜音的聊天,被 Personal @mention',
    gate: '第 3 關:聊天被靜音 → 有直接 @你',
    behavior: '靜音只擋一般訊息和 Everyone @mentions;點名你的 Personal @mention 仍跳,並說明這是靜音聊天。',
    data: { id: 'muted', threadKey: 'chat:engineering', app: 'chats', context: 'Engineering', actor: P.kenji, body: '@Me 我 the PR for the tasting form is ready for your review.', reason: 'You were @mentioned · this chat is muted', reply: true, time: 'now' },
  },
  {
    title: '通話 / 會議中,只放行這場會議的聊天',
    gate: '第 5 關:Display › Show notifications while "In a Call" status = 未勾選',
    behavior: '取消勾選時,通話或會議中只有這場會議的聊天(和緊急訊息)會跳。',
    data: { id: 'meeting', threadKey: 'chat:weekly', app: 'chats', context: 'Weekly tasting sync', actor: P.yui, body: 'Sharing the scorecard link here for everyone.', reason: 'From your current meeting', reply: true, time: 'now' },
  },
  {
    title: '訊息預覽關閉',
    gate: 'Display › Show message and content previews in notifications = 未勾選',
    behavior: '只說誰、在哪裡;內文不顯示(投影、分享螢幕時不洩漏)。',
    showPreview: false,
    data: { id: 'nopreview', threadKey: 'chat:product-team-2', app: 'chats', context: 'Product Team 產品團隊', actor: P.guanyu, body: 'Budget numbers for Q4 are attached.', reply: true, time: 'now' },
  },
]

const SUPPRESSED: { gate: string; outcome: string; example: string }[] = [
  { gate: '@Mentions 總開關關閉', outcome: '兩種 @ 都不跳卡', example: 'Chats › @Mentions 的 Switch 關掉,下方兩個 Select 變 disabled' },
  { gate: '這種通知 = Off', outcome: '不跳卡(聊天本身的未讀數照常)', example: 'Chats › Messages › Reactions(預設 Off)' },
  { gate: '聊天被靜音,不是 Personal @mention', outcome: '不通知', example: '已靜音的 Engineering 有人 @everyone' },
  { gate: '暫停中,寄件人不在優先名單', outcome: '不跳卡', example: '暫停 1 小時期間,Shinichi 傳訊息' },
  { gate: '通話 / 會議中且未勾選「Show notifications while "In a Call" status」', outcome: '不跳卡', example: '開會時 Product Team 的一般訊息' },
  { gate: '系統勿擾 / 專注模式開著', outcome: '不跳卡', example: 'macOS 專注模式期間任何非緊急通知' },
]

const SUPPRESSED_COLUMNS = [
  { accessorKey: 'gate', header: '關卡', meta: { width: 280 } },
  { accessorKey: 'outcome', header: '結果', meta: { width: 200 } },
  { accessorKey: 'example', header: '例子' },
]

export function BannerGallery() {
  const stack = useBannerStack()
  // 對應設定 Display › Group banners from the same chat;在總覽頁可直接切換,按兩次同一張 Play 看差別
  const [group, setGroup] = useState(true)
  // 對應設定 Display › Size(Comfy / Compact);上方切換 = 整頁情境卡 + 疊放區一起換
  const [size, setSize] = useState<BannerSize>('comfy')
  // 對應設定 Display › Show this many notifications on screen at once(3–5,預設 3)
  const [max, setMax] = useState(3)
  let n = 0
  const play = (s: Scenario) => stack.push({ ...s.data, id: `${s.data.id}-${Date.now()}-${n++}`, count: undefined }, group, max)

  return (
    <div className="h-screen overflow-y-auto bg-canvas text-foreground">
      <div className="mx-auto flex max-w-[1192px] flex-col gap-10 px-6 py-10">
        <header className="flex flex-col gap-2">
          <p className="text-caption font-semibold uppercase tracking-wide text-fg-secondary">tWorkspace · In-app notifications · Chats</p>
          <h1 className="text-h3 font-semibold">Push banner scenarios</h1>
          <p className="max-w-[68ch] text-body text-fg-secondary">
            每張卡對到「Teams 通知決策流程圖」的一道關卡。按 Play 會把卡片送進右上角真的疊放區:10 秒收起、滑鼠停留暫停、同一對話合併、同時張數上限(預設 3 張,可改 3–5)。
            操作回饋的 Toast 在右下,別人找你的 banner 在右上,兩者不搶同一個角落。
          </p>
          <Checkbox
            className="pt-2"
            label="Group banners from the same chat"
            description="對應設定 Display 的同名選項。勾選:同一聊天連按 Play 會收合成一張並累計則數;不勾:每則各一張。"
            checked={group}
            onCheckedChange={(v) => setGroup(v === true)}
          />
          <div className="flex flex-col gap-2 pt-2">
            <span id="gallery-size" className="text-body text-foreground">Size(對應設定 Display › Change the size of your message and content previews)</span>
            <RadioGroup aria-labelledby="gallery-size" value={size} onValueChange={(v) => setSize(v as BannerSize)} className="flex gap-6">
              <RadioGroupItem value="comfy" label="Comfy" />
              <RadioGroupItem value="compact" label="Compact" />
            </RadioGroup>
          </div>
          <div className="flex items-center gap-3 pt-2">
            <span id="gallery-max" className="text-body text-foreground">Show this many notifications on screen at once(對應設定 Display 的同名選項)</span>
            <Select
              className="w-40"
              size="sm"
              aria-label="Show this many notifications on screen at once"
              options={[{ value: '3', label: '3 (default)' }, { value: '4', label: '4' }, { value: '5', label: '5' }]}
              value={String(max)}
              onChange={(v) => setMax(Number(v))}
            />
          </div>
        </header>

        <ContextVariants onPlay={play} />
        <Separator />
        <ActionVariants onPlay={play} />
        <Separator />
        <ReactionVariants onPlay={play} />
        <Separator />
        <BannerStates size={size} />
        <Separator />
        <ThreadVsChat onPlay={play} />
        <Separator />
        <SizeComparison />
        <Separator />
        <ScenarioSection title="會跳橫幅:Chats 的一般情境" items={DELIVERED} onPlay={play} size={size} />
        <Separator />
        <ScenarioSection title="會跳橫幅:流程圖關卡造成的變體" items={VARIANTS} onPlay={play} size={size} />
        <Separator />

        <section className="flex flex-col gap-4">
          <h2 className="text-h5 font-semibold">不跳橫幅的情況</h2>
          <p className="max-w-[68ch] text-body text-fg-secondary">目前只有 Chats 有通知。tWorkspace 沒有活動摘要,被擋下的訊息仍在聊天的未讀數裡(NavRail 分頁上的數字、列表上的紅點)。</p>
          <DataTable
            columns={SUPPRESSED_COLUMNS}
            data={SUPPRESSED}
            getRowId={(r: (typeof SUPPRESSED)[number]) => r.gate}
            aria-label="Cases that do not show a banner"
          />
        </section>
      </div>
      <BannerStack items={stack.items} onDismiss={stack.dismiss} showPreview size={size} />
    </div>
  )
}

/** 三種情境(2026-11-17 user):DM / Group chat / App。App 沒有回覆,卡片 hug */
const CTX: { key: string; title: string; note: string; s: Scenario }[] = [
  {
    key: 'dm', title: 'DM', note: '左邊是對方的頭像,第一排是對方名字。',
    s: { title: '', gate: '', behavior: '', data: { id: 'ctx-dm', threadKey: 'chat:shinichi', app: 'chats', actor: P.shinichi, body: 'The Lugu Co-op samples arrived. Can you confirm the 20 kg order before 3 PM?', reply: true, time: 'now' } },
  },
  {
    key: 'group', title: 'Group chat', note: '左邊是群組裡發言者的頭像,第一排是群組名稱。',
    s: { title: '', gate: '', behavior: '', data: { id: 'ctx-group', threadKey: 'chat:product-team', app: 'chats', context: 'Product Team 產品團隊', actor: P.guanyu, body: '@Me 我 can you confirm the launch date for the Q4 tasting kit?', reply: true, time: 'now' } },
  },
  {
    key: 'app', title: 'App', note: '左邊是 app logo(圓形),第一排是 app 名稱 + APP 標籤。沒有回覆功能,卡片高度隨內容(hug)。',
    s: { title: '', gate: '', behavior: '', data: { id: 'ctx-app', app: 'chats', appInfo: { name: 'Approvals', icon: ClipboardCheck, color: 'var(--color-turquoise-6)' }, body: 'Lin Ya-Ting submitted expense report #4821 (NT$12,400) for your approval.', time: 'now' } },
  },
]
function ContextVariants({ onPlay }: { onPlay: (s: Scenario) => void }) {
  return (
    <section className="flex flex-col gap-6" data-contexts>
      <div className="flex flex-col gap-2">
        <h2 className="text-h5 font-semibold">情境樣式:DM / Group chat / App</h2>
        <p className="max-w-[68ch] text-body text-fg-secondary">
          同一套外框,第二區依來源換內容。DM 和 Group chat 可以回覆;App 通知不能回覆,所以沒有輸入框(Comfy)也沒有 Reply 按鈕(Compact),卡片比較矮。
        </p>
      </div>
      {/* 卡片以實際寬 360 並排:360 × 3 + 32 × 2 = 1144 = 頁面內容寬 */}
      <div className="grid grid-cols-1 gap-x-8 gap-y-6 xl:grid-cols-[repeat(3,360px)]">
        {CTX.map((c) => (
          <article key={c.key} className="flex min-w-0 flex-col gap-3" data-ctx={c.key}>
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-body font-semibold">{c.title}</h3>
              <Button variant="secondary" size="sm" startIcon={Play} onClick={() => onPlay(c.s)}>Play</Button>
            </div>
            <p className="text-caption text-fg-secondary">Comfy</p>
            <NotificationBanner data={c.s.data} size="comfy" onDismiss={() => {}} onOpen={() => {}} />
            <p className="text-caption text-fg-secondary">Compact</p>
            <NotificationBanner data={{ ...c.s.data, id: `${c.s.data.id}-compact` }} size="compact" onDismiss={() => {}} onOpen={() => {}} />
            <p className="text-body text-fg-secondary">{c.note}</p>
          </article>
        ))}
      </div>
    </section>
  )
}

/** 動作按鈕(2026-11-17 user):有按鈕就沒有回覆,按鈕取代輸入框;DS Button tertiary sm dark;一顆或兩顆,兩顆水平排、間距 12 */
const ACT: { key: string; title: string; note: string; s: Scenario }[] = [
  {
    key: 'one', title: '一顆按鈕', note: '按鈕撐滿第三區。按下 Join 會打開會議(示範中為打開來源)。',
    s: { title: '', gate: '', behavior: '', data: { id: 'act-one', app: 'chats', appInfo: { name: 'Calendar', icon: CalendarDays, color: 'var(--color-indigo-6)' }, body: 'Weekly tasting sync starts in 5 minutes · Room No.3', actions: [{ label: 'Join' }], time: 'now' } },
  },
  {
    key: 'two', title: '兩顆按鈕', note: '兩顆平分第三區,間距 8。按下後訊息列換成結果(例如 Approved),3 秒後收起。',
    s: { title: '', gate: '', behavior: '', data: { id: 'act-two', app: 'chats', appInfo: { name: 'Approvals', icon: ClipboardCheck, color: 'var(--color-turquoise-6)' }, body: 'Lin Ya-Ting submitted expense report #4821 (NT$12,400) for your approval.', actions: [{ label: 'Approve', result: 'Approved expense report #4821' }, { label: 'Reject', result: 'Rejected expense report #4821' }], time: 'now' } },
  },
]
function ActionVariants({ onPlay }: { onPlay: (s: Scenario) => void }) {
  return (
    <section className="flex flex-col gap-6" data-actions>
      <div className="flex flex-col gap-2">
        <h2 className="text-h5 font-semibold">動作按鈕</h2>
        <p className="max-w-[68ch] text-body text-fg-secondary">
          有動作按鈕的通知不能回覆,按鈕直接取代輸入框。Comfy 和 Compact 都把按鈕放在訊息下方一列;Compact 因此比可回覆的卡高。
        </p>
      </div>
      <div className="grid grid-cols-1 gap-x-8 gap-y-6 xl:grid-cols-[repeat(3,360px)]">
        {ACT.map((c) => (
          <article key={c.key} className="flex min-w-0 flex-col gap-3" data-act={c.key}>
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-body font-semibold">{c.title}</h3>
              <Button variant="secondary" size="sm" startIcon={Play} onClick={() => onPlay(c.s)}>Play</Button>
            </div>
            <p className="text-caption text-fg-secondary">Comfy</p>
            <NotificationBanner data={c.s.data} size="comfy" onDismiss={() => {}} onOpen={() => {}} />
            <p className="text-caption text-fg-secondary">Compact</p>
            <NotificationBanner data={{ ...c.s.data, id: `${c.s.data.id}-compact` }} size="compact" onDismiss={() => {}} onOpen={() => {}} />
            <p className="text-body text-fg-secondary">{c.note}</p>
          </article>
        ))}
      </div>
    </section>
  )
}

/** Emoji 回應(2026-11-17 user):頭像右下角 16px emoji 徽章;第一排人名、第二排「Reacted to your message: …」 */
const REACT: { key: string; title: string; note: string; s: Scenario }[] = [
  {
    key: 'dm', title: 'DM', note: '對方對你的訊息按了 emoji。第一排是人名。',
    s: { title: '', gate: '', behavior: '', data: { id: 'react-dm', threadKey: 'chat:shinichi:reactions', app: 'chats', actor: P.shinichi, reaction: { emoji: '👍', message: 'Confirmed, ordering 20 kg from the Lugu Co-op today.' }, body: '', reply: true, time: 'now' } },
  },
  {
    key: 'group', title: 'Group chat', note: '群組成員對你的訊息按了 emoji。第一排是群組名,第二排開頭是回應的人。',
    s: { title: '', gate: '', behavior: '', data: { id: 'react-group', threadKey: 'chat:product-team:reactions', app: 'chats', context: 'Product Team 產品團隊', actor: P.yui, reaction: { emoji: '🎉', message: 'The Q4 tasting kit launches on Nov 28!' }, body: '', reply: true, time: 'now' } },
  },
]
function ReactionVariants({ onPlay }: { onPlay: (s: Scenario) => void }) {
  return (
    <section className="flex flex-col gap-6" data-reactions>
      <div className="flex flex-col gap-2">
        <h2 className="text-h5 font-semibold">Emoji 回應</h2>
        <p className="max-w-[68ch] text-body text-fg-secondary">
          有人對你的訊息按了 emoji。頭像右下角疊一個 16px 的白底圓,裡面放 12px 的 emoji;圓的外框 1.5px 用卡片底色,看起來像從頭像挖出一圈。Emoji 回應不能回覆,所以卡片比較矮。
        </p>
      </div>
      <div className="grid grid-cols-1 gap-x-8 gap-y-6 xl:grid-cols-[repeat(3,360px)]">
        {REACT.map((c) => (
          <article key={c.key} className="flex min-w-0 flex-col gap-3" data-react={c.key}>
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-body font-semibold">{c.title}</h3>
              <Button variant="secondary" size="sm" startIcon={Play} onClick={() => onPlay(c.s)}>Play</Button>
            </div>
            <p className="text-caption text-fg-secondary">Comfy</p>
            <NotificationBanner data={c.s.data} size="comfy" onDismiss={() => {}} onOpen={() => {}} />
            <p className="text-caption text-fg-secondary">Compact</p>
            <NotificationBanner data={{ ...c.s.data, id: `${c.s.data.id}-compact` }} size="compact" onDismiss={() => {}} onOpen={() => {}} />
            <p className="text-body text-fg-secondary">{c.note}</p>
          </article>
        ))}
      </div>
    </section>
  )
}

/** 卡片的三種狀態(2026-11-12):Initial / Hover / Reply focused。三張是同一則通知;Hover 與 Reply 請實際操作第 2、3 張 */
const STATE_NOTES = [
  { title: 'Initial', note: '剛跳出。10 秒後自動收起。回覆輸入框一開始就在。' },
  { title: 'Hover', note: '外觀不變(同 Teams)。滑鼠停在卡上時計時暫停,移開後繼續;點頭像或文字區會打開這個聊天。' },
  { title: 'Reply focused', note: '點輸入框即可打字,框線變亮;回覆期間計時暫停。Enter 或紙飛機送出,Esc 離開輸入框。' },
]
function BannerStates({ size }: { size: BannerSize }) {
  const base = DELIVERED.find((x) => x.data.id === 'mention') as Scenario
  return (
    <section className="flex flex-col gap-6" data-states>
      <h2 className="text-h5 font-semibold">卡片狀態</h2>
      <div className="grid grid-cols-1 gap-x-8 gap-y-8 xl:grid-cols-[repeat(3,360px)]">
        {STATE_NOTES.map((st, i) => (
          <article key={st.title} className="flex min-w-0 flex-col gap-3" data-state={i}>
            <h3 className="text-body font-semibold">{st.title}</h3>
            <NotificationBanner data={{ ...base.data, id: `state-${i}` }} size={size} onDismiss={() => {}} onOpen={() => {}} />
            <p className="text-body text-fg-secondary">{st.note}</p>
          </article>
        ))}
      </div>
    </section>
  )
}

/** Thread 回覆 vs 聊天主畫面的訊息(2026-11-16,討論用):同一個群組、兩張卡,Reply 的目的地不同 */
const CHAT_MSG: Scenario = {
  title: '', gate: '', behavior: '',
  data: { id: 'tv-chat', threadKey: 'chat:product-team', app: 'chats', context: 'Product Team 產品團隊', actor: P.guanyu, body: 'Morning all. The Q4 tasting kit samples arrive on Thursday.', reply: true, time: 'now' },
}
const THREAD_MSG: Scenario = {
  title: '', gate: '', behavior: '',
  data: { id: 'tv-thread', threadKey: 'chat:product-team/thread:launch-date', app: 'chats', context: 'Product Team 產品團隊', actor: P.yui, body: 'Legal signed off, so Nov 28 works for the launch.', thread: { root: 'Can we lock the Q4 launch date this week?' }, reply: true, time: 'now' },
}
/** 一對一聊天(DM)的同一組對照:來源列沒有群組名,回覆對象是對方本人 */
const DM_MSG: Scenario = {
  title: '', gate: '', behavior: '',
  data: { id: 'tv-dm', threadKey: 'chat:shinichi', app: 'chats', actor: P.shinichi, body: 'The Lugu Co-op samples arrived. Can you confirm the 20 kg order before 3 PM?', reply: true, time: 'now' },
}
const DM_THREAD_MSG: Scenario = {
  title: '', gate: '', behavior: '',
  data: { id: 'tv-dm-thread', threadKey: 'chat:shinichi/thread:roast-profile', app: 'chats', actor: P.shinichi, body: 'Batch #3 held at 205°C for 40 seconds longer. Want me to send the curve?', thread: { root: 'What changed in the roast profile for batch #3?' }, reply: true, time: 'now' },
}
function ThreadVsChat({ onPlay }: { onPlay: (s: Scenario) => void }) {
  const rows: { label: string; size: BannerSize; replying?: boolean }[] = [
    { label: 'Comfy', size: 'comfy' },
    { label: 'Comfy,按 Reply 後', size: 'comfy', replying: true },
    { label: 'Compact', size: 'compact' },
  ]
  const groups = [
    { key: 'group', title: 'Group chat', left: CHAT_MSG, right: THREAD_MSG, leftTitle: '一般訊息(回到群組)', rightTitle: 'Thread 回覆(回到 thread)' },
    { key: 'dm', title: 'DM(一對一)', left: DM_MSG, right: DM_THREAD_MSG, leftTitle: '一般訊息(回給對方)', rightTitle: 'Thread 回覆(回到 thread)' },
  ]
  return (
    <section className="flex flex-col gap-8" data-thread-vs-chat>
      <div className="flex flex-col gap-2">
        <h2 className="text-h5 font-semibold">Thread 回覆與一般訊息</h2>
        <p className="max-w-[68ch] text-body text-fg-secondary">
          同一個聊天裡,一般訊息和 thread 回覆分成兩張卡,不收合在一起,因為 Reply 會送到不同地方。
          來源列、按鈕和輸入框提示字都寫明目的地,送出前就知道會回到哪裡。同一個 thread 的多則回覆仍收合成一張。
          群組和一對一聊天規則相同,差別只在來源列有沒有群組名。
        </p>
      </div>
      {groups.map((g) => (
        <div key={g.key} className="flex flex-col gap-4" data-tv-group={g.key}>
          <div className="flex items-center gap-3">
            <h3 className="text-body-lg font-semibold">{g.title}</h3>
            <Button variant="secondary" size="sm" startIcon={Play} onClick={() => { onPlay(g.left); onPlay(g.right) }}>Play both</Button>
          </div>
          <div className="grid grid-cols-1 gap-x-10 gap-y-6 lg:grid-cols-2">
            <h4 className="text-body font-semibold">{g.leftTitle}</h4>
            <h4 className="text-body font-semibold max-lg:hidden">{g.rightTitle}</h4>
            {rows.map((r) => (
              <div key={r.label} className="contents">
                <div className="flex min-w-0 flex-col gap-2">
                  <p className="text-caption text-fg-secondary">{r.label}</p>
                  <NotificationBanner data={{ ...g.left.data, id: `tvl-${g.key}-${r.label}` }} size={r.size} defaultReplying={r.replying} onDismiss={() => {}} onOpen={() => {}} />
                </div>
                <div className="flex min-w-0 flex-col gap-2">
                  <p className="text-caption text-fg-secondary"><span className="lg:hidden">Thread 回覆 · </span>{r.label}</p>
                  <NotificationBanner data={{ ...g.right.data, id: `tvr-${g.key}-${r.label}` }} size={r.size} defaultReplying={r.replying} onDismiss={() => {}} onOpen={() => {}} />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </section>
  )
}

/** Comfy / Compact 並排:同一則通知兩種尺寸,看資訊取捨 */
const COMPARE_IDS = ['mention', 'forward', 'grouped', 'urgent']
function SizeComparison() {
  const all = [...DELIVERED, ...VARIANTS]
  const rows = COMPARE_IDS.map((id) => all.find((x) => x.data.id === id)).filter(Boolean) as Scenario[]
  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h2 className="text-h5 font-semibold">Comfy 與 Compact</h2>
        <p className="max-w-[68ch] text-body text-fg-secondary">
          Teams 的 Display 設定可選 Comfy 或 Compact(預設 Comfy)。Teams 沒公開兩者的版面差異,以下是我們的定義:
          Compact 把來源併到名字後面、內文只留一行,收掉「為什麼收到」和按鈕列,只留 Reply 圖示鈕;Urgent 標籤兩種都保留。寬度、陰影、計時規則相同。
        </p>
      </div>
      <div className="grid grid-cols-1 gap-x-10 gap-y-6 lg:grid-cols-2">
        <h3 className="text-body font-semibold max-lg:hidden">Comfy</h3>
        <h3 className="text-body font-semibold max-lg:hidden">Compact</h3>
        {rows.map((r) => (
          <div key={r.data.id} className="contents">
            <div className="flex min-w-0 flex-col gap-2">
              <p className="text-caption text-fg-secondary lg:hidden">Comfy</p>
              <NotificationBanner data={r.data} size="comfy" onDismiss={() => {}} onOpen={() => {}} />
            </div>
            <div className="flex min-w-0 flex-col gap-2">
              <p className="text-caption text-fg-secondary lg:hidden">Compact</p>
              <NotificationBanner data={r.data} size="compact" onDismiss={() => {}} onOpen={() => {}} />
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function ScenarioSection({ title, items, onPlay, size }: { title: string; items: Scenario[]; onPlay: (s: Scenario) => void; size: BannerSize }) {
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
            <NotificationBanner data={s.data} size={size} showPreview={s.showPreview ?? true} onDismiss={() => {}} onOpen={() => {}} />
            <p className="max-w-[60ch] text-body text-fg-secondary">{s.behavior}</p>
          </article>
        ))}
      </div>
    </section>
  )
}
