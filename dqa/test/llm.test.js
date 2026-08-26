'use strict';

/**
 * AI 層驗收。**不連任何真實 endpoint** —— 本機起一個假的 Messages API,
 * 驗證我們送出去的請求形狀、以及收回來之後的合約檢查。
 *
 * 為什麼要這樣測:真實閘道器(內網)在開發機上碰不到,而「送錯參數」與
 * 「模型亂答時沒被擋下」這兩種失敗都不會自己現形 —— 前者要看請求、後者要餵壞資料。
 * 連線本身是否可用由 `node src/node/llm.js check` 對著真閘道器跑,那是另一件事。
 */

const http = require('http');
const {
  classify, classifyWithRetry, validateFindings, aiRules, MODEL_DEFAULTS,
} = require('../src/node/llm');
const { loadData } = require('../src/node/data');

const { rubric } = loadData();
const problems = [];
const check = (cond, label, extra) => {
  if (!cond) problems.push(label);
  console.log(`  ${cond ? '✓' : '✗'} ${label}${extra ? `　${extra}` : ''}`);
};

/* --------------------------------------------------------- 假的 payload */

const AI_CODES = aiRules(rubric).map((r) => r.code);
const SEV = new Map(aiRules(rubric).map((r) => [r.code, r.severity]));
const ID = 'EMPHASIS-001@g>div0';

const payload = {
  meta: { rubricVersion: rubric.version },
  nodes: [], nodes_storybook: [],
  structural_diff: { onlySb: [], onlyProd: [] },
  deterministic_violations: [], notices: [], skipped_checks: [],
  unresolved: [{ id: ID, node: 'g>div0', rule: 'EMPHASIS-001', question: '…' }],
};

const goodFinding = {
  id: ID, classification: 'violation', code: 'EMPHASIS-001',
  severity: SEV.get('EMPHASIS-001'), evidence: ['g>div0>span0.emphasis.score = 3.75'],
};

/* ------------------------------------------------------------ 假的閘道器 */

function mockGateway(handler) {
  const seen = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const parsed = JSON.parse(body);
      seen.push({ path: req.url, headers: req.headers, body: parsed });
      const out = handler(parsed, seen.length);
      res.writeHead(out.status || 200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(out.body));
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({
      server, seen, url: `http://127.0.0.1:${server.address().port}`,
    }));
  });
}

const messageWith = (obj) => ({
  id: 'msg_test', type: 'message', role: 'assistant', model: MODEL_DEFAULTS.model,
  content: [{ type: 'text', text: JSON.stringify(obj) }],
  stop_reason: 'end_turn', stop_sequence: null,
  usage: { input_tokens: 100, output_tokens: 20 },
});

async function withGateway(handler, fn) {
  const gw = await mockGateway(handler);
  process.env.DQA_LLM_BASE_URL = gw.url;
  process.env.DQA_LLM_API_KEY = 'test-key';
  try {
    return await fn(gw);
  } finally {
    gw.server.close();
  }
}

/* ------------------------------------------------------------------ 測試 */

(async function main() {
  console.log('=== 送出去的請求形狀 ===');
  await withGateway(() => ({ body: messageWith({ findings: [goodFinding] }) }), async (gw) => {
    const r = await classify({ payload, rubric, config: {} });
    const req = gw.seen[0].body;

    check(gw.seen[0].path === '/v1/messages', '打的是 /v1/messages', gw.seen[0].path);
    check(req.model === 'claude-opus-4-6', '模型是 claude-opus-4-6', req.model);
    // 4.6 省略 thinking 等於不思考 —— 這條漏掉不會報錯,只會安靜地變笨
    check(req.thinking && req.thinking.type === 'adaptive',
      'thinking 明確設成 adaptive(4.6 省略等於關閉)', JSON.stringify(req.thinking));
    check(req.output_config && req.output_config.effort === 'high',
      'effort 有送且不是 4.6 沒有的 xhigh', req.output_config && req.output_config.effort);
    check(!!(req.output_config && req.output_config.format),
      'structured outputs 有送');
    check(typeof req.messages[0].content === 'string'
      && req.messages[0].content.includes('## PAYLOAD'),
      'prompt 由 buildPrompt 產生,payload 整包送(ADR-005)');
    check(gw.seen[0].headers['x-api-key'] === 'test-key', '憑證走 x-api-key');

    check(r.findings.length === 1 && r.problems.length === 0,
      '合約內的回應直接通過', `${r.findings.length} findings / ${r.problems.length} problems`);
    check(r.meta.structuredOutputs === true && !r.meta.degraded, '沒有降級');
  });

  /* ------------------------------------------------- schema 管不到的語意 */

  console.log('\n=== 合約檢查(structured outputs 保證不了的部分)===');
  const cases = [
    {
      name: '發明不存在的 code',
      f: { ...goodFinding, code: 'INVENTED-999' },
      want: /不在 rubric/,
    },
    {
      name: '自行調整 severity',
      f: { ...goodFinding, severity: 'low' },
      want: /severity 應為/,
    },
    {
      name: 'unclassified 卻帶 code',
      f: { ...goodFinding, classification: 'unclassified' },
      want: /unclassified 時 code/,
    },
    {
      name: '碰了 unresolved 以外的項目',
      f: { ...goodFinding, id: 'g>div9.boxShadow' },
      want: /不在 unresolved/,
    },
    {
      name: '下判斷卻說不出證據',
      f: { ...goodFinding, evidence: [] },
      want: /沒有引用任何證據/,
    },
  ];
  for (const c of cases) {
    const found = validateFindings([c.f], payload, rubric);
    check(found.some((p) => c.want.test(p)), c.name, found[0] || '(沒抓到)');
  }
  check(validateFindings([], payload, rubric).some((p) => /沒有被回答/.test(p)),
    'unresolved 有項目沒被回答也算不合約');
  check(validateFindings([goodFinding], payload, rubric).length === 0,
    '合約內的 finding 不會被誤判');

  /* --------------------------------------------------------------- 降級 */

  console.log('\n=== 閘道器不支援 structured outputs ===');
  await withGateway((req) => {
    if (req.output_config && req.output_config.format) {
      return { status: 400, body: { type: 'error', error: { type: 'invalid_request_error', message: 'unsupported parameter: output_config.format' } } };
    }
    return { body: messageWith({ findings: [goodFinding] }) };
  }, async (gw) => {
    const r = await classify({ payload, rubric, config: {} });
    check(!!r.meta.degraded, '被拒之後降級而不是整個炸掉', r.meta.degraded);
    check(r.findings.length === 1 && r.problems.length === 0, '降級後仍拿得到 findings');
    check(gw.seen.length === 2 && !gw.seen[1].body.output_config.format,
      '第二次請求真的把 format 拿掉了');
  });

  /* --------------------------------------------------------------- 重試 */

  console.log('\n=== 不合約時重試一次 ===');
  await withGateway((req, n) => ({
    body: messageWith({ findings: [n === 1 ? { ...goodFinding, severity: 'low' } : goodFinding] }),
  }), async (gw) => {
    const r = await classifyWithRetry({ payload, rubric, config: {} });
    check(r.meta.retried === true, '第一次不合約 → 重試', JSON.stringify(r.meta.firstAttemptProblems));
    check(r.problems.length === 0, '第二次合約就通過');
    const retryPrompt = gw.seen[1].body.messages[0].content;
    check(retryPrompt.includes('上一次輸出不合約'),
      '重試把問題回灌給模型,不是原封不動再送一次');
    check(retryPrompt.includes('severity 應為'), '回灌的內容是具體的違規項目');
  });

  console.log('\n=== 重試後仍不合約 ===');
  await withGateway(() => ({ body: messageWith({ findings: [{ ...goodFinding, code: 'INVENTED-999' }] }) }),
    async () => {
      const r = await classifyWithRetry({ payload, rubric, config: {} });
      check(r.problems.length > 0, '問題原樣回傳,不吞掉', `${r.problems.length} 項`);
      check(r.meta.retried === true, '確實重試過');
    });

  if (problems.length) {
    console.error(`\n${problems.length} 項失敗。`);
    process.exit(1);
  }
  console.log('\nAI 層全部正確。');
}()).catch((e) => {
  console.error(`\n中斷:${e.message}`);
  console.error(e.stack);
  process.exit(1);
});
