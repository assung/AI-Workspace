// IT Service Desk 展示版進入點:與 main.tsx 同一份 App 與 Provider。
// 建置:npm run build:demo → dist-demo/(相對路徑,可放任何靜態主機);分享用再跑 scripts/protect-demo.mjs 加密碼。
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { TooltipProvider } from '@qijenchen/design-system'
import App from './App'
import './globals.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TooltipProvider delayDuration={500} skipDelayDuration={300}>
      <App />
    </TooltipProvider>
  </StrictMode>,
)
