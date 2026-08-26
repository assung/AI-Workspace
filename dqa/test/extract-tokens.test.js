'use strict';

/**
 * `scripts/extract-tokens.mjs` 的驗收。需要 Chromium,所以不含在 `npm run test:all`。
 *
 *   DQA_CHROMIUM=<chrome> xvfb-run -a npm run test:tokens
 *
 * 這支盯的是四件事,每一件都是「不用瀏覽器就做不到」的:
 *   1. relative color syntax 要被求值(字串解析拿到的是 oklch(from ...) 原樣)
 *   2. alpha 要留住,而且要進索引鍵 —— 同 hex 不同 alpha 是不同 token
 *   3. 非色值的自訂屬性不可以被收進來
 *   4. theme 覆寫要生效
 */

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const FIXTURE = path.join(__dirname, 'token-fixture', 'tokens.css');

const problems = [];
const check = (cond, label, extra) => {
  if (!cond) problems.push(label);
  console.log(`  ${cond ? '✓' : '✗'} ${label}${extra ? `　${extra}` : ''}`);
};

function extract(extraArgs) {
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'dqa-tok-')), 'tokens.json');
  execFileSync(process.execPath, [
    path.join(ROOT, 'scripts', 'extract-tokens.mjs'),
    '--css', FIXTURE, '--out', out, ...extraArgs,
  ], { cwd: ROOT, stdio: 'pipe' });
  return JSON.parse(fs.readFileSync(out, 'utf8'));
}

/* ------------------------------------------------------------ light */

console.log('=== light theme ===');
const light = extract(['--theme', 'light', '--demote', '^(color-|_)', '--source-label', 'test-fixture']);
const scale = light.scale;
const aliases = light._aliases;
const nameFor = (hex) => Object.keys(scale).find((k) => scale[hex] === undefined && scale[k] === hex);

check(scale.canvas === '#ffffff', 'oklch(1 0 0) → #ffffff', scale.canvas);

// relative color syntax:oklch(from var(--color-blue-6) calc(l*0.44) calc(c*0.65) h)
// 字串解析只會拿到未求值的原樣,只有瀏覽器算得出來
const blue9 = nameFor('#001160');
check(!!blue9, 'relative color syntax 被求值', blue9 ? `${blue9} = #001160` : '(沒算出來)');

check(scale.foreground === '#000000d9', 'alpha token → 8 碼 hex', scale.foreground);
check(scale.border === '#00000040', '同 hex 不同 alpha 各自成立', scale.border);
check(scale.foreground !== scale.border, '85% 黑與 25% 黑沒有被壓成同一個值');

check(scale.primary === '#0065ea', 'semantic 名稱勝出(--color-blue-6 被 demote)', scale.primary);
check((aliases.primary || []).includes('color-blue-6'),
  '被蓋掉的名稱進 _aliases', JSON.stringify(aliases.primary || []));

const names = Object.keys(scale).concat(...Object.values(aliases));
check(!names.includes('layout-space-loose') && !names.includes('font-body-size'),
  '非色值的自訂屬性沒有被收進來');
check(!names.some((n) => n.startsWith('_na')), '內部 alpha 百分比(--_naN)沒有被收進來');

check(light._meta.source === 'test-fixture' && light._meta.theme === 'light',
  '_meta 記錄來源與 theme');

/* ------------------------------------------------------------- dark */

console.log('\n=== dark theme ===');
const dark = extract(['--theme', 'dark', '--demote', '^(color-|_)']);
check(dark.scale.primary && dark.scale.primary !== scale.primary,
  'theme 覆寫生效,primary 換色', `${scale.primary} → ${dark.scale.primary}`);
check(dark.scale.foreground === '#ffffffd9',
  'dark 的 foreground 變成 85% 白', dark.scale.foreground);

/* ------------------------------------------------ 產出直接餵得進 resolver */

console.log('\n=== 產出可直接用於逆映射 ===');
const { TokenResolver } = require('../src/core/tokens');
const resolver = new TokenResolver({ tokens: { spacing: { 'space-100': 8 }, colors: light } });
const r = resolver.resolveColor('rgba(0, 0, 0, 0.851)');
check(!!r && r.token === 'foreground' && r.exact === true,
  '抽出來的檔案直接查得到 token', r ? `${r.token} exact=${r.exact}` : '(查不到)');

if (problems.length) {
  console.error(`\n${problems.length} 項失敗。`);
  process.exit(1);
}
console.log('\ntoken 抽取全部正確。');
