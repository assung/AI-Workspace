// tWorkspace 展示版進入點(2026-10-27 user:「把這套先做成 prototype 方便 demo」)。
// 與 Storybook「Apps/chat/AI agent / Chat 分頁」同一份 App + 同一組 config,只是不帶 Storybook 外框:
// 打開即是全螢幕的 tWorkspace(Chat 分頁),NavRail 可切 Tasks / Docs / Drive / tAgent。
// Provider 與 main.tsx 相同(TooltipProvider 的 delay 值沿用)。建置:npm run build:demo → dist-demo/(相對路徑,可放任何靜態主機)。
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { TooltipProvider } from '@qijenchen/design-system'
import App from './App'
import { BannerGallery } from './BannerGallery'
import './globals.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TooltipProvider delayDuration={500} skipDelayDuration={300}>
      {/* #notification-settings = 打開就是 Settings › Notifications(2026-11-07 通知設定 demo;同 IT Service Desk #oncall 以 hash 切換的先例) */}
      {/* #banners = Push banner 情境總覽;其餘 = prototype(開啟後 5–32 秒依序送出示範通知,照設定決定跳不跳) */}
      {location.hash === '#banners' ? (
        <BannerGallery />
      ) : (
        <App config={{ agent: true, demoBanners: true, initialSettingsRoute: location.hash === '#notification-settings' ? 'notifications' : undefined }} />
      )}
    </TooltipProvider>
  </StrictMode>,
)
