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
 *   --kind color|spacing  抽哪一類 token(預設 color)
 *   --theme <name>    抽取前先把 data-theme 設成這個值(預設 light)
 *   --density a,b     spacing 模式:對每個 density 各抽一次,輸出 densities: { a: {}, b: {} }
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
    css: [], kind: 'color', theme: 'light', density: null, densities: null,
    out: null,
    include: null, url: null, demote: [], sourceLabel: null,
    chromium: process.env.DQA_CHROMIUM || null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const next = () => argv[i += 1];
    if (a === '--css') out.css.push(next());
    else if (a === '--url') out.url = next();
    else if (a === '--theme') out.theme = next();
    else if (a === '--kind') out.kind = next();
    else if (a === '--density') {
      const v = next();
      if (v.includes(',')) out.densities = v.split(',').map((x) => x.trim()).filter(Boolean);
      else out.density = v;
    }
    else if (a === '--out') out.out = next();
    else if (a === '--include') out.include = next();
    else if (a === '--demote') out.demote.push(next());
    else if (a === '--source-label') out.sourceLabel = next();
    else if (a === '--chromium') out.chromium = next();
    else throw new Error(`不認識的參數:${a}`);
  }
  if (!out.url && !out.css.length) throw new Error('要給 --url 或至少一個 --css');
  if (out.url && out.css.length) throw new Error('--url 與 --css 只能擇一');
  if (!['color', 'spacing'].includes(out.kind)) throw new Error('--kind 只能是 color 或 spacing');
  if (!out.out) out.out = out.kind === 'spacing' ? 'tokens/spacing-scale.json' : 'tokens/color-primitives.json';
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
  if (opts.density) {
    document.documentElement.setAttribute('data-density', opts.density);
    document.documentElement.setAttribute('data-layout-space', opts.density);
  }

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

  /**
   * 判斷「這個 token 是不是<某型別>」的通用手法:兩個哨兵父層 + 一個**可繼承**的屬性。
   *
   * `prop: var(--x)` 若在 computed-value 階段無效(值的型別不對、或 token 不存在),
   * 該宣告會變成 unset → 可繼承屬性就各自繼承到不同的哨兵值。兩邊算出同一個值才算數。
   * 用可繼承的屬性是關鍵:不可繼承的屬性失敗時兩邊都會落到同一個 initial value,分不出來。
   */
  function probe(prop, sentinelA, sentinelB) {
    const mk = (sentinel) => {
      const host = document.createElement('div');
      host.style.setProperty(prop, sentinel);
      const el = document.createElement('span');
      host.appendChild(el);
      document.body.appendChild(host);
      return { host, el };
    };
    const A = mk(sentinelA);
    const B = mk(sentinelB);
    const read = (name) => {
      A.el.style.setProperty(prop, '');
      B.el.style.setProperty(prop, '');
      A.el.style.setProperty(prop, `var(${name})`);
      B.el.style.setProperty(prop, `var(${name})`);
      const a = getComputedStyle(A.el).getPropertyValue(prop);
      const b = getComputedStyle(B.el).getPropertyValue(prop);
      return a === b ? a : null;
    };
    return { read, done: () => { A.host.remove(); B.host.remove(); } };
  }

  const sorted = [...names].sort();
  const values = {};
  const rejected = [];

  if (opts.kind === 'spacing') {
    // letter-spacing 是可繼承的 <length> 屬性 —— 百分比、關鍵字、色值都會被擋掉
    const p = probe('letter-spacing', '5px', '7px');
    for (const name of sorted) {
      const v = p.read(name);
      if (!v || !/^-?[\d.]+px$/.test(v.trim())) { rejected.push(name); continue; }
      values[name] = parseFloat(v);
    }
    p.done();
  } else {
    const p = probe('color', 'rgb(1, 2, 3)', 'rgb(4, 5, 6)');
    for (const name of sorted) {
      const v = p.read(name);
      if (!v) { rejected.push(name); continue; }
      const norm = D.normalizeColor(v);
      if (!norm) { rejected.push(name); continue; }
      values[name] = norm;
    }
    p.done();
  }

  return { values, rejected, unreadableSheets, scanned: names.size };
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
function pickNames(values, demotePatterns) {
  const demote = demotePatterns.map((re) => new RegExp(re));
  const isDemoted = (name) => demote.some((re) => re.test(name));

  const byValue = new Map();
  for (const [rawName, rgbString] of Object.entries(values)) {
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

async function extractOnce(page, args, density) {
  const raw = await page.evaluate(pageExtract, { kind: args.kind, theme: args.theme, density });
  let values = raw.values;
  if (args.include) {
    const re = new RegExp(args.include);
    values = Object.fromEntries(Object.entries(values).filter(([k]) => re.test(k)));
  }
  return { raw, values };
}

/** spacing:token 名去掉 `--`,值是數字 px。同值多名不合併 —— 名字本身就是意圖。 */
function spacingScale(values) {
  const out = {};
  for (const [name, px] of Object.entries(values)) out[name.replace(/^--/, '')] = px;
  return Object.fromEntries(Object.entries(out).sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0])));
}

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

    const outFile = path.isAbsolute(args.out) ? args.out : path.join(ROOT, args.out);
    const meta = {
      // 本機路徑對別人沒有意義 —— 有 --source-label 就用它(例如 repo@sha)
      source: args.sourceLabel || args.url || args.css,
      kind: args.kind,
      theme: args.theme,
      generatedAt: new Date().toISOString(),
      engine: 'chromium computed value via probe（ADR-014 / ADR-016）',
    };
    let doc;

    if (args.kind === 'spacing') {
      const densities = args.densities || [args.density].filter(Boolean);
      if (!densities.length) {
        throw new Error('spacing 模式要給 --density(單一值或以逗號分隔,例如 --density md,lg)');
      }
      const scales = {};
      let scanned = 0;
      for (const d of densities) {
        const { raw, values } = await extractOnce(page, args, d);
        scales[d] = spacingScale(values);
        scanned = raw.scanned;
      }
      meta.densities = densities;
      meta.scannedCustomProperties = scanned;
      doc = {
        _comment: '由 scripts/extract-tokens.mjs 產生 —— 不要手改。改了下次抽取就會被蓋掉。',
        _meta: meta,
        unit: 'px',
        // 每個 density 一份:同一個 px 值在不同 density 下可能對應不同 token(ADR-019)
        densities: scales,
      };
      const names = new Set(Object.values(scales).flatMap((x) => Object.keys(x)));
      console.log(`掃到 ${scanned} 個自訂屬性`);
      for (const d of densities) {
        console.log(`  density=${d} → ${Object.keys(scales[d]).length} 個 spacing token`);
      }
      const collisions = [...names].filter((n) =>
        densities.some((d) => scales[d][n] !== scales[densities[0]][n]));
      console.log(`  ${collisions.length} 個 token 的值隨 density 改變:${collisions.join(', ') || '(無)'}`);
    } else {
      const { raw, values } = await extractOnce(page, args, args.density);
      const { scale, aliases } = pickNames(values, args.demote);
      meta.density = args.density;
      meta.demoted = args.demote;
      meta.scannedCustomProperties = raw.scanned;
      meta.colorTokens = Object.keys(values).length;
      meta.distinctValues = Object.keys(scale).length;
      meta.unreadableStyleSheets = raw.unreadableSheets;
      doc = {
        _comment: '由 scripts/extract-tokens.mjs 產生 —— 不要手改。改了下次抽取就會被蓋掉。',
        _meta: meta,
        _aliases: aliases,
        scale,
      };
      const withAlpha = Object.values(scale).filter((v) => v.length === 9).length;
      console.log(`掃到 ${raw.scanned} 個自訂屬性,其中 ${Object.keys(values).length} 個是顏色`);
      console.log(`  → ${Object.keys(scale).length} 個相異色值(${withAlpha} 個帶 alpha)`);
      console.log(`  → ${Object.keys(aliases).length} 個值有多個 token 名,已列進 _aliases`);
      if (raw.unreadableSheets) {
        console.log(`  ⚠ ${raw.unreadableSheets} 份樣式表讀不到(跨網域),名稱可能有漏`);
      }
    }

    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.writeFileSync(outFile, `${JSON.stringify(doc, null, 2)}\n`);
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
