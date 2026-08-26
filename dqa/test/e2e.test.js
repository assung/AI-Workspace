'use strict';

/**
 * 端對端:把擴充套件真的載進 Chromium,對本機 fixture 跑完整流程。
 *
 * 這條測試存在的理由:fixture 單元測試測不到瀏覽器程式碼(docs/TASKS.md 的 T1)。
 * baselineY 與 measuredWidth 是最可能出錯的兩個欄位,而它們只有在真的排版過的頁面上才有值。
 *
 * 跑法:npm run test:e2e(需要 Chromium;無畫面環境用 xvfb-run 包起來)
 *
 * 唯一與正式版不同的地方:測試會把 manifest 複製一份並加上 host_permissions。
 * activeTab 要靠使用者點擊授權,自動化測試沒有那個手勢。其餘檔案一律用原版。
 */

const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const FIXTURE_DIR = path.join(__dirname, 'browser-fixture');

const problems = [];
const check = (cond, label, extra) => {
  if (!cond) problems.push(label);
  console.log(`  ${cond ? '✓' : '✗'} ${label}${extra ? `　${extra}` : ''}`);
};

/* ------------------------------------------------------------- 本機靜態站 */

function serve(dir) {
  const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8' };
  const server = http.createServer((req, res) => {
    const file = path.join(dir, decodeURIComponent(req.url.split('?')[0]));
    if (!file.startsWith(dir) || !fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': types[path.extname(file)] || 'text/plain' });
    res.end(fs.readFileSync(file));
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

/** 複製擴充套件,只改 manifest 的權限宣告(見檔首說明) */
function stageExtension(tmp) {
  const dst = path.join(tmp, 'extension');
  fs.cpSync(path.join(ROOT, 'extension'), dst, { recursive: true });
  const mf = JSON.parse(fs.readFileSync(path.join(dst, 'manifest.json'), 'utf8'));
  mf.host_permissions = ['http://127.0.0.1/*', 'http://localhost/*'];
  fs.writeFileSync(path.join(dst, 'manifest.json'), JSON.stringify(mf, null, 2));
  return dst;
}

/* --------------------------------------------------------------------- 主 */

async function main() {
  const { chromium } = require('playwright');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dqa-e2e-'));
  const extDir = stageExtension(tmp);
  const { server, port } = await serve(FIXTURE_DIR);
  const base = `http://127.0.0.1:${port}`;

  // 專案 pin 的 Playwright 版本與環境裡的 Chromium 版號未必一致 —— 有 DQA_CHROMIUM 就直接指定
  const executablePath = process.env.DQA_CHROMIUM || undefined;

  const ctx = await chromium.launchPersistentContext(path.join(tmp, 'profile'), {
    headless: false,
    executablePath,
    viewport: { width: 1280, height: 900 },
    args: [
      `--disable-extensions-except=${extDir}`,
      `--load-extension=${extDir}`,
      '--no-first-run',
      '--force-device-scale-factor=1',
      '--font-render-hinting=none',
    ],
  });

  try {
    const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker', { timeout: 15000 });
    const extId = new URL(sw.url()).host;
    console.log(`  擴充套件已載入:${extId}\n`);

    const page = await ctx.newPage();
    await page.goto(`${base}/storybook.html`, { waitUntil: 'load' });

    /**
     * 安裝時 onInstalled 會自動打開設定頁,而且是非同步的 —— 它可能在我們關完分頁之後才出現。
     * 作用中分頁若是 chrome-extension:// 的設定頁,executeScript 會被擋下並丟出
     * 「Cannot access contents of the page」,看起來像權限設錯,其實是選錯分頁。
     */
    async function ensureActive() {
      for (let i = 0; i < 10; i += 1) {
        for (const p of ctx.pages()) if (p !== page && p !== report) await p.close();
        await page.bringToFront();
        const url = await sw.evaluate(async () => (await DQA_CAPTURE.activeTab()).url || '');
        if (url.startsWith('http://127.0.0.1:')) return;
        await page.waitForTimeout(200);
      }
      throw new Error('無法讓 fixture 分頁成為作用中分頁');
    }
    let report = null;
    await ensureActive();

    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    await sw.evaluate(async (w) => {
      await DQA_STORE.clearAllCaptures();
      await DQA_STORE.clearData();
      await DQA_STORE.resetSettings();
      await DQA_STORE.setSettings({ viewportWidth: w });
    }, clientWidth);

    /* ------------------------------------------------- 1. 環境鎖真的會擋 */

    console.log('=== 環境鎖 ===');
    const wrongWidth = await sw.evaluate(async () => {
      await DQA_STORE.setSettings({ viewportWidth: 999 });
      try {
        await DQA_CAPTURE.captureSide('A');
        return { captured: true };
      } catch (e) {
        return { reasons: e.reasons || null, message: e.message };
      }
    });
    check(
      Array.isArray(wrongWidth.reasons) && wrongWidth.reasons.some((r) => /viewport/.test(r)),
      'viewport 寬度不符時拒絕擷取(ADR-009)',
      wrongWidth.captured ? '(竟然擷取成功了)' : (wrongWidth.reasons ? wrongWidth.reasons[0] : `其他錯誤:${wrongWidth.message}`)
    );
    await sw.evaluate(async (w) => DQA_STORE.setSettings({ viewportWidth: w }), clientWidth);

    /* -------------------------------------------------- 2. A 側(後備選擇器) */

    console.log('\n=== 擷取 A(Storybook)===');
    const a = await sw.evaluate(async () => (await DQA_CAPTURE.captureSide('A')).record);
    check(a.extraction.nodes.length > 5, 'A 側擷取到鄰域', `${a.extraction.nodes.length} 個節點`);
    check(a.extraction.targetPath === 'g>div0>div0', `targetPath = ${a.extraction.targetPath}`);
    check(a.url === undefined || !JSON.stringify(a.extraction).includes('Priya'),
      'payload 裡沒有任何文字內容(只有 chars 長度)');

    const label = a.extraction.nodes.find((n) => n.path === 'g>div0>div0>span0');
    const value = a.extraction.nodes.find((n) => n.path === 'g>div0>div0>span1');

    // baselineY 應落在行盒頂端往下約 0.7 個 lineHeight(TASKS.md T1 的驗收條件)
    const ratio = label ? (label.baselineY - label.box[1]) / label.text.lineHeightPx : null;
    check(ratio !== null && ratio > 0.5 && ratio < 0.95,
      'baselineY 落在行盒頂端往下 0.5~0.95 個 lineHeight',
      ratio === null ? '(沒量到)' : `實際 ${ratio.toFixed(3)}`);

    check(label && label.text.measuredWidth > 0 && label.text.measuredWidth < label.text.availWidth,
      'measuredWidth 有值且未溢出(Storybook 側)',
      label ? `${label.text.measuredWidth} / ${label.text.availWidth}` : '');
    check(value && value.text.truncated === false, 'A 側 value 未截斷');
    check(label && label.text.fontHash && !/Arial/.test(JSON.stringify(label.text)),
      'fontFamily 只以 hash 出現', label ? label.text.fontHash : '');

    /* ------------------------------------------------------ 3. 挑選器 */

    console.log('\n=== 元素挑選器 ===');
    await sw.evaluate(async () => {
      const tab = await DQA_CAPTURE.activeTab();
      await DQA_CAPTURE.startPicker(tab);
    });
    // 滑鼠停在 label 上,再用 ↑ 往上跳到整列 —— 順便驗鍵盤導覽
    const box = await page.locator('.property-row .label').first().boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Enter');
    const picked = await sw.evaluate(async () => {
      const tab = await DQA_CAPTURE.activeTab();
      return DQA_CAPTURE.readSelection(tab);
    });
    check(!!picked && picked.mode === 'picker' && /property-row/.test(picked.label || ''),
      '挑選器選到目標(↑ 從 label 跳到整列)', picked ? picked.label : '(沒選到)');

    const viaPicker = await sw.evaluate(async () => (await DQA_CAPTURE.captureSide('A')).record);
    check(viaPicker.extraction.nodes.length === a.extraction.nodes.length,
      '挑選器的框線沒有混進鄰域',
      `後備選擇器 ${a.extraction.nodes.length} / 挑選器 ${viaPicker.extraction.nodes.length}`);
    check(JSON.stringify(viaPicker.extraction.nodes) === JSON.stringify(a.extraction.nodes),
      '兩種選取方式量到完全相同的數據');

    /* -------------------------------------------------- 4. B 側與違規判定 */

    console.log('\n=== 擷取 B(Production)===');
    await page.goto(`${base}/production.html`, { waitUntil: 'load' });
    await ensureActive();
    const b = await sw.evaluate(async () => (await DQA_CAPTURE.captureSide('B')).record);
    check(b.extraction.nodes.length === a.extraction.nodes.length,
      '兩側節點數一致', `${b.extraction.nodes.length}`);

    const bValue = b.extraction.nodes.find((n) => n.path === 'g>div0>div0>span1');
    check(bValue && bValue.text.truncated === true && bValue.text.hasAffordance === false,
      'B 側 value 判定為截斷且無替代取用方式',
      bValue ? `overflowX ${bValue.text.overflowX}` : '');

    /* ---------------------------------------------------------- 5. 報告頁 */

    console.log('\n=== 報告頁 ===');
    report = await ctx.newPage();
    await report.goto(`chrome-extension://${extId}/report/report.html`, { waitUntil: 'load' });
    await report.waitForSelector('.finding', { timeout: 10000 });

    // payload 與 prompt 由報告頁載入的 core 產出 —— 測試讀的是它實際渲染的那一份
    const built = await report.evaluate(() => ({
      payload: window.__DQA_REPORT__.payload,
      promptLen: window.__DQA_REPORT__.prompt.length,
    }));

    console.log('\n=== 確定性違規 ===');
    const codes = built.payload.deterministic_violations.map((v) => v.code);
    for (const v of built.payload.deterministic_violations) {
      console.log(`     [${v.severity.padEnd(6)}] ${v.code} @ ${v.node}\u3000${JSON.stringify(v.evidence)}`);
    }
    for (const code of ['TOKEN-001', 'TOKEN-002', 'GESTALT-001', 'ALIGN-001', 'TRUNC-001']) {
      check(codes.includes(code), `${code} 在真實頁面上被抓到`);
    }
    check(built.payload.meta.captureMode === 'extension', 'payload 記錄了擷取路徑');
    check(built.payload.meta.env.warnings.length === 0, '兩側環境一致');
    check(built.promptLen > 1000, 'prompt 產得出來', `${built.promptLen} 字元`);

    const shown = await report.locator('.finding .code').allTextContents();
    check(shown.length === codes.length, '報告頁列出全部違規', `${shown.length} 筆`);
    const firstSev = await report.locator('.finding').first().getAttribute('class');
    check(/sev-high/.test(firstSev), '違規依 severity 排序,high 在最前');
    const promptText = await report.locator('#prompt').inputValue();
    check(promptText.length === built.promptLen, '報告頁的 prompt 與 core 產出一致');
    check(!/Priya|Raghunathan/.test(promptText), 'prompt 裡沒有頁面文字內容');
  } finally {
    await ctx.close();
    server.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  if (problems.length) {
    console.error(`\n${problems.length} 項失敗。`);
    process.exit(1);
  }
  console.log('\n端對端全部通過。');
}

main().catch((e) => {
  console.error(`\n端對端測試中斷:${e.message}`);
  console.error(e.stack);
  process.exit(1);
});
