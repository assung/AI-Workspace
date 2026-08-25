'use strict';

/**
 * core/*.js 在「瀏覽器」這條路徑上跑出來的結果,必須與 Node 這條路徑完全相同。
 *
 * 這條測試盯的是 ADR-011:同一份 core 有兩種載入方式(CommonJS / 一般 <script>),
 * 只要有人在其中一條路徑上加了 require、fs、或任何 Node 專屬的東西,
 * 擴充套件就會在使用者面前壞掉,而 npm test 依然全綠。
 *
 * 這裡用 vm 模擬擴充套件頁面:沒有 module、沒有 require,只有 globalThis。
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const { buildPayload } = require('../src/core/payload');
const { buildPrompt } = require('../src/core/prompt');
const { loadData } = require('../src/node/data');
const { storybook, production } = require('./fixture');

const CORE_DIR = path.join(__dirname, '..', 'src', 'core');
// 順序即 report.html 裡 <script> 的順序 —— 相依性只靠這個順序解決
const LOAD_ORDER = ['tokens.js', 'rubric-engine.js', 'payload.js', 'prompt.js'];

const { tokens, rubric } = loadData();

/* --------------------------------------------- 瀏覽器路徑:vm 裡沒有 module */

const sandbox = { console };
vm.createContext(sandbox);

let loadError = null;
try {
  for (const f of LOAD_ORDER) {
    vm.runInContext(fs.readFileSync(path.join(CORE_DIR, f), 'utf8'), sandbox, { filename: f });
  }
} catch (e) {
  loadError = e;
}

console.log('=== core 在瀏覽器路徑載入 ===');
console.log(`  ${loadError ? '✗' : '✓'} 四支 core 皆可用一般 <script> 載入${loadError ? ` —— ${loadError.message}` : ''}`);
if (loadError) process.exit(1);

const exported = ['TokenResolver', 'RubricEngine', 'buildPayload', 'buildPrompt', 'collectGaps'];
const missing = exported.filter((k) => typeof sandbox.DQA_CORE[k] !== 'function');
console.log(`  ${missing.length ? '✗' : '✓'} DQA_CORE 對外介面完整${missing.length ? ` —— 缺 ${missing.join(', ')}` : ''}`);

/* ------------------------------------------------------- 兩條路徑結果比對 */

const args = () => [
  JSON.parse(JSON.stringify(storybook)),
  JSON.parse(JSON.stringify(production)),
  { tokens, rubric, captureMode: 'extension' },
];

const viaNode = buildPayload(...args());
const viaBrowser = vm.runInContext('(a, b, o) => DQA_CORE.buildPayload(a, b, o)', sandbox)(
  ...args().map((x) => vm.runInContext('(json) => JSON.parse(json)', sandbox)(JSON.stringify(x)))
);

// generatedAt 是時間戳,兩次呼叫本來就不同
const strip = (p) => JSON.stringify(Object.assign({}, p, {
  meta: Object.assign({}, p.meta, { generatedAt: null }),
}));

const samePayload = strip(viaNode) === strip(viaBrowser);
console.log('\n=== Playwright 路徑 vs Extension 路徑 ===');
console.log(`  ${samePayload ? '✓' : '✗'} payload 完全相同(${viaNode.deterministic_violations.length} 筆違規)`);

const promptNode = buildPrompt(viaNode, rubric);
const promptBrowser = vm.runInContext('(p, r) => DQA_CORE.buildPrompt(p, r)', sandbox)(
  vm.runInContext('(json) => JSON.parse(json)', sandbox)(JSON.stringify(viaNode)),
  vm.runInContext('(json) => JSON.parse(json)', sandbox)(JSON.stringify(rubric))
);
const samePrompt = promptNode === promptBrowser;
console.log(`  ${samePrompt ? '✓' : '✗'} prompt 完全相同(${promptNode.length} 字元)`);

/* ------------------------------------------- rubric 契約:沒有 source 就擋掉 */

const noSource = JSON.parse(JSON.stringify(rubric));
delete noSource.rules[0].source;
let rejected = false;
try {
  buildPayload(...args().slice(0, 2), { tokens, rubric: noSource });
} catch (e) {
  rejected = /source/.test(e.message);
}
console.log(`  ${rejected ? '✓' : '✗'} 缺 source 的 rubric 在載入時就被擋下(ADR-007)`);

if (missing.length || !samePayload || !samePrompt || !rejected) {
  console.error('\n兩條路徑已經分岔。在修之前先讀 docs/DECISIONS.md 的 ADR-011。');
  process.exit(1);
}
console.log('\n兩條路徑輸出一致。');
