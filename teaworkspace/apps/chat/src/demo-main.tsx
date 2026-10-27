// tWorkspace 展示版進入點(2026-10-27 user:「把這套先做成 prototype 方便 demo」)。
// 與 Storybook「Apps/chat/tAgent / Chat 分頁」同一份 App + 同一組 config,只是不帶 Storybook 外框:
// 打開即是全螢幕的 tWorkspace(Chat 分頁),NavRail 可切 Tasks / Docs / Drive / tAgent。
// Provider 與 main.tsx 相同(TooltipProvider 的 delay 值沿用)。建置:npm run build:demo → dist-demo/(相對路徑,可放任何靜態主機)。
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { TooltipProvider } from '@qijenchen/design-system'
import App from './App'
import './globals.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TooltipProvider delayDuration={500} skipDelayDuration={300}>
      <App config={{ agent: true }} />
    </TooltipProvider>
  </StrictMode>,
)
