'use strict';

/**
 * src/ 是唯一真實來源,extension/ 底下的 browser、core、data 都是複製品。
 *
 * 為什麼要複製而不是共用:Chrome Extension 只能載入自己資料夾裡的檔案。
 * 為什麼不讓 extension 自己寫一份:量測與判定邏輯一旦分岔,兩條路徑的數據就不可比,
 * 「Playwright 說有違規、擴充套件說沒有」這種爭議無法收斂。
 *
 * `npm run test:sync` 會驗證這裡的複製品是最新的。
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

/** [來源, 擴充套件內的目的地] */
const FILE_MAP = [
  ['src/browser/preflight.js', 'extension/browser/preflight.js'],
  ['src/browser/extract.js', 'extension/browser/extract.js'],
  ['src/core/tokens.js', 'extension/core/tokens.js'],
  ['src/core/rubric-engine.js', 'extension/core/rubric-engine.js'],
  ['src/core/payload.js', 'extension/core/payload.js'],
  ['src/core/prompt.js', 'extension/core/prompt.js'],
  ['src/core/report.js', 'extension/core/report.js'],
  ['rubric.json', 'extension/data/rubric.json'],
  ['tokens/spacing-scale.json', 'extension/data/spacing-scale.json'],
  ['tokens/color-primitives.json', 'extension/data/color-primitives.json'],
];

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

/** @returns {Array<{src:string, dst:string}>} 內容不同步的檔案 */
function diff() {
  const stale = [];
  for (const [src, dst] of FILE_MAP) {
    const dstPath = path.join(ROOT, dst);
    const same = fs.existsSync(dstPath) && fs.readFileSync(dstPath, 'utf8') === read(src);
    if (!same) stale.push({ src, dst });
  }
  return stale;
}

function sync() {
  const written = [];
  for (const [src, dst] of FILE_MAP) {
    const dstPath = path.join(ROOT, dst);
    fs.mkdirSync(path.dirname(dstPath), { recursive: true });
    const next = read(src);
    if (fs.existsSync(dstPath) && fs.readFileSync(dstPath, 'utf8') === next) continue;
    fs.writeFileSync(dstPath, next);
    written.push(dst);
  }
  return written;
}

if (require.main === module) {
  const written = sync();
  if (!written.length) console.log('extension/ 已是最新,沒有檔案需要同步。');
  for (const f of written) console.log(`synced → ${f}`);
}

module.exports = { sync, diff, FILE_MAP };
