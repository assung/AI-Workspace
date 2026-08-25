'use strict';

/**
 * sanitize() 外洩向量驗證(ADR-003)
 * 從 extract.js 抽出函式本體執行,避免為了測試而把瀏覽器程式碼改成模組。
 */

const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'browser', 'extract.js'), 'utf8'
);
const m = /function sanitize\(value\) \{([\s\S]*?)\n  \}/.exec(src);
if (!m) throw new Error('找不到 sanitize()。改過 extract.js 就要同步這支測試。');
const sanitize = new Function('value', m[1]);

const cases = [
  { v: 'url(https://cdn.internal.corp/logos/customer-acme.png)', block: true,  why: '客戶名 + 內部 CDN 拓撲' },
  { v: '"已核准"',                                                block: true,  why: '::before 的字面文字' },
  { v: 'var(--feature-flag-new-billing)',                        block: true,  why: 'feature flag 名' },
  { v: '"pii-panel" "detail"',                                   block: true,  why: 'grid 具名區域洩漏資料分類' },
  { v: 'rgba(0, 0, 0, 0.1) 0px 2px 4px 0px',                     block: false, why: '正常 box-shadow' },
  { v: '12px',                                                   block: false, why: '正常 spacing' },
  { v: 'flex',                                                   block: false, why: '正常 display' },
];

let failed = 0;
for (const c of cases) {
  const blocked = sanitize(c.v) === null;
  const ok = blocked === c.block;
  if (!ok) failed += 1;
  console.log(`  ${ok ? '✓' : '✗'} ${(blocked ? 'BLOCKED' : 'PASS   ')}  ${c.why.padEnd(28)} ${c.v.slice(0, 44)}`);
}

if (failed) {
  console.error(`\n${failed} 項失敗。sanitize 是最後一道防線,不要為了讓某個屬性通過而放寬它。`);
  process.exit(1);
}
console.log('\n外洩向量全數阻擋,正常值全數通過。');
