'use strict';

const path = require('path');
const fs = require('fs');
const { buildPayload } = require('../core/payload');
const { buildPrompt } = require('../core/prompt');
const { loadData } = require('./data');

const BROWSER_DIR = path.join(__dirname, '..', 'browser');

async function capture(browser, { url, selector, viewportWidth, viewportHeight, themeAttrs, waitFor }) {
  const context = await browser.newContext({
    viewport: { width: viewportWidth, height: viewportHeight },
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
    colorScheme: 'light',
  });
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'networkidle' });
  if (waitFor) await page.waitForSelector(waitFor, { state: 'visible' });
  await page.waitForSelector(selector, { state: 'visible' });

  await page.addScriptTag({ path: path.join(BROWSER_DIR, 'preflight.js') });
  await page.addScriptTag({ path: path.join(BROWSER_DIR, 'extract.js') });

  const pf = await page.evaluate(
    (opts) => window.__DQA__.preflight(opts),
    { expectedViewportWidth: viewportWidth, themeAttrs, fontSettleMs: 120 }
  );

  if (!pf.ok) {
    await context.close();
    const e = new Error(`DQA preflight 失敗 @ ${url}`);
    e.details = pf.errors;
    throw e;
  }

  const extraction = await page.evaluate(
    (sel) => window.__DQA__.extract(sel, {}),
    selector
  );

  await context.close();
  return { env: pf.env, extraction };
}

/**
 * @param {object} cfg
 *   cfg.storybook   { url, selector }
 *   cfg.production  { url, selector, waitFor }
 *   cfg.viewport    { width, height }
 */
async function run(cfg) {
  const { chromium } = require('playwright');
  const browser = await chromium.launch({
    args: ['--force-device-scale-factor=1', '--font-render-hinting=none'],
  });

  try {
    const common = {
      viewportWidth: cfg.viewport.width,
      viewportHeight: cfg.viewport.height,
      themeAttrs: cfg.themeAttrs || ['data-theme', 'data-color-mode'],
    };
    // 序列執行,避免兩個 context 互搶字型載入資源造成 metrics 抖動
    const sb = await capture(browser, { ...common, ...cfg.storybook });
    const prod = await capture(browser, { ...common, ...cfg.production });

    // 資料在這裡讀進來一次,之後全程用注入的方式傳給 core。
    // core 兩條路徑共用,所以它不能有任何 fs 依賴。
    const { tokens, rubric } = loadData({
      tokensDir: cfg.tokensDir,
      rubricFile: cfg.rubricFile,
    });

    const payload = buildPayload(sb, prod, { tokens, rubric, captureMode: 'playwright' });

    return { payload, prompt: buildPrompt(payload, rubric) };
  } finally {
    await browser.close();
  }
}

if (require.main === module) {
  const cfgPath = process.argv[2];
  if (!cfgPath) {
    console.error('用法: node src/node/run.js <config.json> [outDir]');
    process.exit(1);
  }
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  const outDir = process.argv[3] || 'out';
  fs.mkdirSync(outDir, { recursive: true });

  run(cfg)
    .then(({ payload, prompt }) => {
      fs.writeFileSync(path.join(outDir, 'payload.json'), JSON.stringify(payload, null, 2));
      fs.writeFileSync(path.join(outDir, 'prompt.txt'), prompt);
      const d = payload.deterministic_violations;
      console.log(
        `確定性違規 ${d.length} 筆 / 提示 ${payload.notices.length} 筆`
        + ` / 跳過 ${payload.skipped_checks.length} 項 / unresolved ${payload.unresolved.length} 筆`
      );
      for (const v of d) console.log(`  [${v.severity}] ${v.code} @ ${v.node}`);
      for (const n of payload.notices) console.log(`  (提示) ${n.code} @ ${n.node}`);
    })
    .catch((e) => {
      console.error(e.message);
      if (e.details) console.error(JSON.stringify(e.details, null, 2));
      process.exit(1);
    });
}

module.exports = { run, capture };
