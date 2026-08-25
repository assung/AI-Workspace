'use strict';

/**
 * 擴充套件的靜態完整性檢查。
 *
 * 這裡不模擬 Chrome —— 只確認「載得起來」:manifest 指到的檔案都在、
 * 每一頁 <script src> 指到的檔案都在、所有 JS 都能被解析。
 * 這三件事任一漏掉,Chrome 會在載入時整個拒絕,而且錯誤訊息不會告訴你是哪一行。
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const EXT = path.join(__dirname, '..', 'extension');
const manifest = JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8'));

const problems = [];
const ok = (cond, label) => {
  if (!cond) problems.push(label);
  console.log(`  ${cond ? '✓' : '✗'} ${label}`);
};

/* --------------------------------------------------------------- manifest */

console.log('=== manifest ===');
ok(manifest.manifest_version === 3, 'manifest_version 為 3');
const declared = [
  manifest.background && manifest.background.service_worker,
  manifest.action && manifest.action.default_popup,
  manifest.options_page,
].filter(Boolean);
for (const rel of declared) {
  ok(fs.existsSync(path.join(EXT, rel)), `manifest 指到的 ${rel} 存在`);
}
ok(!manifest.permissions.includes('<all_urls>'), 'permissions 沒有把 <all_urls> 寫死(靠 activeTab 逐次授權)');

/* ------------------------------------------------------- 頁面的 script src */

console.log('\n=== 頁面相依 ===');
const htmlFiles = [];
(function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) walk(full);
    else if (name.endsWith('.html')) htmlFiles.push(full);
  }
}(EXT));

for (const file of htmlFiles) {
  const html = fs.readFileSync(file, 'utf8');
  const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]);
  for (const ref of refs) {
    if (/^(https?:)?\/\//.test(ref)) {
      problems.push(`${path.relative(EXT, file)} 引用了外部資源 ${ref}`);
      console.log(`  ✗ ${path.relative(EXT, file)} 引用外部資源 ${ref}`);
      continue;
    }
    const target = path.resolve(path.dirname(file), ref);
    ok(fs.existsSync(target), `${path.relative(EXT, file)} → ${ref}`);
  }
}

/* ---------------------------------------------------------------- 可解析 */

console.log('\n=== JS 解析 ===');
const jsFiles = [];
(function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) walk(full);
    else if (name.endsWith('.js')) jsFiles.push(full);
  }
}(EXT));

for (const file of jsFiles) {
  const rel = path.relative(EXT, file);
  try {
    new vm.Script(fs.readFileSync(file, 'utf8'), { filename: rel });
    console.log(`  ✓ ${rel}`);
  } catch (e) {
    problems.push(`${rel} 解析失敗:${e.message}`);
    console.log(`  ✗ ${rel} —— ${e.message}`);
  }
}

/* ------------------------------------------------- importScripts 的相依 */

console.log('\n=== service worker ===');
const sw = fs.readFileSync(path.join(EXT, manifest.background.service_worker), 'utf8');
const imported = [...sw.matchAll(/importScripts\(([^)]*)\)/g)]
  .flatMap((m) => [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]));
ok(imported.length > 0, 'service worker 有 importScripts 相依');
for (const rel of imported) {
  ok(fs.existsSync(path.join(EXT, rel)), `importScripts('${rel}') 存在`);
}

if (problems.length) {
  console.error(`\n${problems.length} 項問題,Chrome 會載入失敗。`);
  process.exit(1);
}
console.log('\n擴充套件靜態檢查全數通過。');
