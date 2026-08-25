'use strict';

/**
 * extension/ 的複製品必須與 src/ 一致。
 *
 * 這條測試存在的理由:兩條路徑一旦跑不同版本的量測或判定邏輯,
 * 同一個畫面在 Playwright 與擴充套件上會得到不同的違規清單,而且沒人會發現。
 * 失敗時不要手改 extension/ 底下的檔案 —— 跑 `npm run sync:ext`。
 */

const { diff, FILE_MAP } = require('../scripts/sync-extension');

const stale = diff();

for (const [src, dst] of FILE_MAP) {
  const bad = stale.some((s) => s.dst === dst);
  console.log(`  ${bad ? '✗' : '✓'} ${dst.padEnd(38)} ← ${src}`);
}

if (stale.length) {
  console.error(`\n${stale.length} 個檔案沒有同步。跑 npm run sync:ext,不要手改 extension/ 底下的複製品。`);
  process.exit(1);
}
console.log('\nextension/ 與 src/ 完全一致。');
