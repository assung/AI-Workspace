#!/usr/bin/env node
/**
 * 色彩 token 抽取 —— 把 design system 的 CSS 變數解析成 sRGB,產出逆映射用的定義檔。
 *
 * 為什麼需要這一支:
 *
 *  1. `getComputedStyle(root).getPropertyValue('--color-blue-9')` 拿到的是
 *     **代換過但沒求值**的字串:`oklch(from oklch(0.54 0.22 258) calc(l*0.44) ...)`。
 *     自訂屬性是 token stream,不會被求值。要拿到真正的顏色,只能把它套到元素上再讀 computed。
 *
 *  2. 解析出來的值必須跟量測那一側經過**同一個**正規化器(`window.__DQA__.normalizeColor`,
 *     ADR-014 的 canvas 引擎)。兩邊各自量化的話,逆映射是拿兩種精度在做精確比對,永遠對不上。
 *
 * 用法:
 *
 *   # 從一個已經載入 token 的頁面抽(Storybook / 產品頁)
 *   node scripts/extract-tokens.mjs --url https://ds.example/iframe.html?id=... --out tokens/color-primitives.json
 *
 *   # 從 checkout 出來的 CSS 檔抽(不需要網路)
 *   node scripts/extract-tokens.mjs --css <ds>/src/tokens/color/primitives.css --css <ds>/src/tokens/color/semantic.css
 *
 * 選項:
 *   --theme <name>    抽取前先把 data-theme 設成這個值(預設 light)
 *   --demote <re>     名稱符合這個 regex 的 token 在「同色多名」時排到最後(可重複)
 *   --source-label <s> 寫進 _meta.source 的來源標示(例如 repo@sha),取代本機路徑
 *   --density <name>  抽取前先把 data-density 設成這個值(色彩用不到,但有些 DS 會連動)
 *   --out <file>      預設 tokens/color-primitives.json
 *   --include <re>    只收名稱符合這個 regex 的 token(預設全收)
 *   --chromium <path> 或環境變數 DQA_CHROMIUM
 */

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/* ------------------------------------------------------------------ 參數 */

function parseArgs(argv) {
  const out = {
    css: [], theme: 'light', density: null, out: 'tokens/color-primitives.json',
    include: null, url: null, demote: [], sourceLabel: null,
    chromium: process.env.DQA_CHROMIUM || null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const next = () => argv[i += 1];
    if (a === '--css') out.css.push(next());
    else if (a === '--url') out.url = next();
    else if (a === '--theme') out.theme = next();
    else if (a === '--density') out.density = next();
    else if (a === '--out') out.out = next();
    else if (a === '--include') out.include = next();
    else if (a === '--demote') out.demote.push(next());
    else if (a === '--source-label') out.sourceLabel = next();
    else if (a === '--chromium') out.chromium = next();
    else throw new Error(`不認識的參數:${a}`);
  }
  if (!out.url && !out.css.length) throw new Error('要給 --url 或至少一個 --css');
  if (out.url && out.css.length) throw new Error('--url 與 --css 只能擇一');
  return out;
}

/* ------------------------------------ --css 模式:起一個只掛這些 CSS 的頁面 */

function serveCss(files) {
  const bodies = files.map((f) => ({
    name: path.basename(f),
    dir: path.dirname(path.resolve(f)),
    text: fs.readFileSync(f, 'utf8'),
  }));
  const links = bodies.map((b, i) => `<link rel="stylesheet" href="/css/${i}/${b.name}">`).join('\n');
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">${links}</head><body></body></html>`;

  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    if (url === '/' || url === '/index.html') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }
    // /css/<i>/<相對路徑> —— 讓 CSS 裡的 @import './../x.css' 能解析到同一棵目錄樹
    const m = /^\/css\/(\d+)\/(.*)$/.exec(url);
    if (m) {
      const base = bodies[Number(m[1])];
      if (base) {
        const file = path.resolve(base.dir, m[2]);
        if (file.startsWith(path.parse(file).root) && fs.existsSync(file)) {
          res.writeHead(200, { 'content-type': 'text/css; charset=utf-8' });
          res.end(fs.readFileSync(file));
          return;
        }
      }
    }
    res.writeHead(404);
    res.end();
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${server.address().port}/` }));
  });
}

/* ---------------------------------------------------------- 頁面內的抽取 */

/**
 * 這支函式在瀏覽器裡跑。
 *
 * 判斷「這個 token 是不是顏色」用兩個哨兵父層:
 * `color: var(--x)` 若在 computed-value 階段無效(值不是顏色、或 token 不存在),
 * 該宣告會變成 unset → color 是繼承屬性 → 各自繼承到不同的哨兵色。
 * 兩邊算出同一個值才算是真的顏色。
 */
function pageExtract(opts) {
  const D = window.__DQA__;
  if (!D || !D.normalizeColor) throw new Error('DQA: normalizeColor 沒有注入');

  if (opts.theme) document.documentElement.setAttribute('data-theme', opts.theme);
  if (opts.density) document.documentElement.setAttribute('data-density', opts.density);

  /* 名稱來源:樣式表掃描 ∪ computed 列舉。前者連沒套用到的選擇器(例如 dark 區塊)也看得到。 */
  const names = new Set();
  const cs = getComputedStyle(document.documentElement);
  for (let i = 0; i < cs.length; i += 1) if (cs[i].startsWith('--')) names.add(cs[i]);
  let unreadableSheets = 0;
  for (const sheet of document.styleSheets) {
    let rules;
    try { rules = sheet.cssRules; } catch (e) { unreadableSheets += 1; continue; }
    const walk = (list) => {
      for (const rule of list) {
        if (rule.style) {
          for (let i = 0; i < rule.style.length; i += 1) {
            if (rule.style[i].startsWith('--')) names.add(rule.style[i]);
          }
        }
        if (rule.cssRules) walk(rule.cssRules);
      }
    };
    walk(rules);
  }

  const mkHost = (sentinel) => {
    const host = document.createElement('div');
    host.style.color = sentinel;
    const probe = document.createElement('span');
    host.appendChild(probe);
    document.body.appendChild(host);
    return { host, probe, sentinel };
  };
  const A = mkHost('rgb(1, 2, 3)');
  const B = mkHost('rgb(4, 5, 6)');

  const colors = {};
  const nonColor = [];
  for (const name of [...names].sort()) {
    A.probe.style.color = '';
    B.probe.style.color = '';
    A.probe.style.color = `var(${name})`;
    B.probe.style.color = `var(${name})`;
    const a = getComputedStyle(A.probe).color;
    const b = getComputedStyle(B.probe).color;
    if (a !== b) { nonColor.push(name); continue; }   // 各自繼承 → 不是顏色
    const norm = D.normalizeColor(a);
    if (!norm) { nonColor.push(name); continue; }
    colors[name] = norm;
  }
  A.host.remove();
  B.host.remove();

  return { colors, nonColor, unreadableSheets, scanned: names.size };
}

/* ------------------------------------------------------------ 後處理 */

function rgbStringToHex(v) {
  const m = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,/\s]+([\d.]+))?\s*\)$/i.exec(v);
  if (!m) return null;
  const [r, g, b] = [m[1], m[2], m[3]].map((n) => Math.round(parseFloat(n)));
  const a = m[4] == null ? 1 : parseFloat(m[4]);
  const hex = `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`;
  // 8 碼形式是必要的:alpha 不同就是不同的顏色,壓成 6 碼會把整條 alpha scale 合併成一個
  return a >= 1 ? hex : hex + Math.round(a * 255).toString(16).padStart(2, '0');
}

/**
 * 同一個顏色值可能有多個 token 名(`--foreground` 與 `--color-neutral-9` 是同一個色)。
 * 逆映射只能回報一個名字,所以這裡選一個並把其餘列進 `_aliases`。
 *
 * 挑選順序:**未被 --demote 命中的優先 → 名稱短的優先 → 字典序**。
 *
 * `--demote` 存在的理由:單純比長度會挑錯。實測 @qijenchen/design-system,
 * `black-a85`(9 字)會贏過 `foreground`(10 字),而該 DS 明文把 `--color-*` /
 * `--black-a*` 歸為 **Internal**、`--foreground` 這類 semantic 才是 **Public**
 * (token-system.spec.md 的 5-Layer 架構)。回報 Internal 名稱等於叫人去看不該直接消費的那一層。
 *
 * 哪些名稱該被 demote 是各 design system 自己的分層慣例,不是這支腳本猜得出來的,
 * 所以做成參數:`--demote '^(color-|black-a|white-a)'`。
 *
 * 無論挑中誰,`_aliases` 都會列出其餘名稱 —— computed style 看到的只是顏色,
 * 程式無法分辨實作寫的是哪一個 token,看報告的人要知道還有哪些可能。
 */
function pickNames(colors, demotePatterns) {
  const demote = demotePatterns.map((re) => new RegExp(re));
  const isDemoted = (name) => demote.some((re) => re.test(name));

  const byValue = new Map();
  for (const [rawName, rgbString] of Object.entries(colors)) {
    const hex = rgbStringToHex(rgbString);
    if (!hex) continue;
    const name = rawName.replace(/^--/, '');
    if (!byValue.has(hex)) byValue.set(hex, []);
    byValue.get(hex).push(name);
  }
  const scale = {};
  const aliases = {};
  for (const [hex, names] of [...byValue].sort((x, y) => x[0].localeCompare(y[0]))) {
    names.sort((a, b) =>
      (isDemoted(a) ? 1 : 0) - (isDemoted(b) ? 1 : 0)
      || a.length - b.length
      || a.localeCompare(b));
    scale[names[0]] = hex;
    if (names.length > 1) aliases[names[0]] = names.slice(1);
  }
  return { scale, aliases };
}

/* ------------------------------------------------------------------ 主 */

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { chromium } = await import('playwright');

  let server = null;
  let target = args.url;
  if (args.css.length) {
    const served = await serveCss(args.css);
    server = served.server;
    target = served.url;
  }

  const browser = await chromium.launch({
    executablePath: args.chromium || undefined,
    args: ['--force-device-scale-factor=1'],
  });

  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(target, { waitUntil: 'networkidle' });
    // 用的是量測那一側的同一份 extract.js —— 正規化器只有一個(ADR-014)
    await page.addScriptTag({ path: path.join(ROOT, 'src', 'browser', 'extract.js') });

    const raw = await page.evaluate(pageExtract, { theme: args.theme, density: args.density });

    let colors = raw.colors;
    if (args.include) {
      const re = new RegExp(args.include);
      colors = Object.fromEntries(Object.entries(colors).filter(([k]) => re.test(k)));
    }

    const { scale, aliases } = pickNames(colors, args.demote);
    const outFile = path.isAbsolute(args.out) ? args.out : path.join(ROOT, args.out);
    const doc = {
      _comment: '由 scripts/extract-tokens.mjs 產生 —— 不要手改。改了下次抽取就會被蓋掉。',
      _meta: {
        // 本機路徑對別人沒有意義 —— 有 --source-label 就用它(例如 repo@sha)
        source: args.sourceLabel || args.url || args.css,
        demoted: args.demote,
        theme: args.theme,
        density: args.density,
        generatedAt: new Date().toISOString(),
        engine: 'chromium canvas via window.__DQA__.normalizeColor(ADR-014)',
        scannedCustomProperties: raw.scanned,
        colorTokens: Object.keys(colors).length,
        distinctValues: Object.keys(scale).length,
        unreadableStyleSheets: raw.unreadableSheets,
      },
      _aliases: aliases,
      scale,
    };
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.writeFileSync(outFile, `${JSON.stringify(doc, null, 2)}\n`);

    const withAlpha = Object.values(scale).filter((v) => v.length === 9).length;
    console.log(`掃到 ${raw.scanned} 個自訂屬性,其中 ${Object.keys(colors).length} 個是顏色`);
    console.log(`  → ${Object.keys(scale).length} 個相異色值(${withAlpha} 個帶 alpha)`);
    console.log(`  → ${Object.keys(aliases).length} 個值有多個 token 名,已列進 _aliases`);
    if (raw.unreadableSheets) {
      console.log(`  ⚠ ${raw.unreadableSheets} 份樣式表讀不到(跨網域),名稱可能有漏`);
    }
    console.log(`寫入 ${path.relative(ROOT, outFile)}`);
  } finally {
    await browser.close();
    if (server) server.close();
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
