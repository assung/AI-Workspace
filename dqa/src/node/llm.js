'use strict';

/**
 * DQA AI 層 —— 把 payload 送去分類,回收經過驗證的 findings。
 *
 * 這一支**只在 Node 這條路徑上存在**。擴充套件不內建任何 LLM 呼叫(ADR-013):
 * egress 路徑的決定權不在這個工具手上,一個能把量測結果送去任意 endpoint 的
 * 擴充套件,資安審查會直接擋下 —— 而且擋得有道理。
 *
 * 三件事是刻意這樣設計的:
 *
 *  1. **endpoint 與金鑰不進 repo。** baseURL 走 config.json(已在 .gitignore)或環境變數,
 *     金鑰只走環境變數。內部 hostname 屬於「內部網路拓撲」,正是 ADR-003 認定
 *     payload 不可外洩的那一類東西 —— 它同樣不該躺在版控裡。
 *
 *  2. **輸出格式用 structured outputs 約束,不是靠 prompt 拜託。**
 *     rubric 的 code 清單直接編進 schema 的 enum,「模型發明新代碼」這個失敗模式
 *     從「事後重試」變成結構上不可能發生。
 *
 *  3. **schema 管不到的仍然要自己驗。** severity 是否沿用規則定義、
 *     unclassified 時 code 是否為 null、id 是否真的在 unresolved 清單裡 ——
 *     這些是語意約束,JSON schema 表達不了,所以有 validateFindings()。
 */

const Anthropic = require('@anthropic-ai/sdk');
const { z } = require('zod');
const { zodOutputFormat } = require('@anthropic-ai/sdk/helpers/zod');

const { buildPrompt } = require('../core/prompt');

const AnthropicClient = Anthropic.default || Anthropic;

const SEVERITIES = ['high', 'medium', 'low', 'info'];
const CLASSIFICATIONS = ['violation', 'acceptable', 'unclassified'];

/* ------------------------------------------------------------------ 設定 */

/**
 * 模型與呼叫參數。
 *
 * `claude-opus-4-6` 的兩個特性會咬人,寫死在這裡而不是留給呼叫端:
 *
 *  - **thinking 必須明確打開。** 在 4.6 上省略 `thinking` 等於不思考
 *    (Opus 4.8/5 才是預設開)。這個任務是拿幾何數字做判斷,關掉思考等於自找幻覺。
 *  - **4.6 沒有 `xhigh` effort。** 那一階是 4.7 才加的,在 4.6 上送會被拒。
 */
const MODEL_DEFAULTS = {
  model: 'claude-opus-4-6',
  maxTokens: 16000,
  effort: 'high',       // 4.6 支援 low / medium / high / max —— 沒有 xhigh
};

function loadConfig(cfg = {}) {
  const llm = cfg.llm || {};
  const baseURL = process.env.DQA_LLM_BASE_URL || llm.baseURL || null;
  const apiKey = process.env.DQA_LLM_API_KEY || process.env.ANTHROPIC_API_KEY || null;
  const authToken = process.env.DQA_LLM_AUTH_TOKEN || null;

  if (!baseURL) {
    throw new Error(
      'DQA: 沒有 LLM endpoint。設環境變數 DQA_LLM_BASE_URL,或在 config.json 的 llm.baseURL 填。\n'
      + '     內部 hostname 不要寫進 config.example.json —— 那份會進版控(見 llm.js 檔首第 1 點)。'
    );
  }
  if (!apiKey && !authToken) {
    throw new Error('DQA: 沒有憑證。設 DQA_LLM_API_KEY(x-api-key)或 DQA_LLM_AUTH_TOKEN(Bearer)。');
  }

  return {
    baseURL,
    apiKey,
    authToken,
    model: llm.model || MODEL_DEFAULTS.model,
    maxTokens: llm.maxTokens || MODEL_DEFAULTS.maxTokens,
    effort: llm.effort || MODEL_DEFAULTS.effort,
    // 閘道器不見得支援 structured outputs。預設先試,被拒就降級並明說(見 classify)
    structuredOutputs: llm.structuredOutputs !== false,
    headers: llm.headers || {},
    timeoutMs: llm.timeoutMs || 10 * 60 * 1000,
  };
}

function createClient(cfg) {
  return new AnthropicClient({
    baseURL: cfg.baseURL,
    // 走 Bearer 的閘道器用 authToken;走原生 x-api-key 的用 apiKey
    apiKey: cfg.apiKey || null,
    authToken: cfg.authToken || undefined,
    defaultHeaders: cfg.headers,
    timeout: cfg.timeoutMs,
    maxRetries: 2,
  });
}

/* ------------------------------------------------------------ 輸出 schema */

/** rubric 裡 evaluator === 'ai' 的規則,就是模型唯一能引用的清單 */
function aiRules(rubric) {
  const rules = rubric.rules.filter((r) => r.evaluator === 'ai');
  if (!rules.length) throw new Error('DQA: rubric 裡沒有 evaluator: "ai" 的規則,AI 層沒有可用的代碼');
  return rules;
}

/**
 * code 的 enum 直接從 rubric 產生 —— rubric 改了 schema 就跟著改,不會有第二份清單。
 * severity 不放進 enum 限制成「該規則的值」,因為 JSON schema 表達不了跨欄位相依;
 * 那條由 validateFindings() 把關。
 */
function buildFindingsSchema(rubric) {
  const codes = aiRules(rubric).map((r) => r.code);
  const Finding = z.object({
    id: z.string(),
    classification: z.enum(CLASSIFICATIONS),
    code: z.enum(codes).nullable(),
    severity: z.enum(SEVERITIES).nullable(),
    evidence: z.array(z.string()),
  });
  return z.object({ findings: z.array(Finding) });
}

/* -------------------------------------------------------------- 事後驗證 */

/**
 * structured outputs 保證得了形狀,保證不了語意。這裡驗四件 schema 表達不了的事:
 *
 *   1. id 必須真的在 unresolved 清單裡 —— 清單以外的一律不碰(prompt 硬性限制)
 *   2. unclassified 時 code 與 severity 必須是 null
 *   3. 有 code 時 severity 必須沿用規則定義,不得自行調整(ADR-004 的同一條紀律)
 *   4. 同一個 id 不可以出現兩次
 *
 * 回傳問題清單而不是丟例外 —— 呼叫端要能決定是重試還是把問題寫進報告。
 */
function validateFindings(findings, payload, rubric) {
  const problems = [];
  const bySeverity = new Map(aiRules(rubric).map((r) => [r.code, r.severity]));
  const allowed = new Set((payload.unresolved || []).map((u) => u.id));
  const seen = new Set();

  for (const f of findings) {
    const at = f.id || '(缺 id)';
    if (!allowed.has(f.id)) {
      problems.push(`${at}:不在 unresolved 清單裡,模型碰了作業範圍以外的項目`);
    }
    if (seen.has(f.id)) problems.push(`${at}:重複出現`);
    seen.add(f.id);

    if (f.classification === 'unclassified') {
      if (f.code !== null) problems.push(`${at}:unclassified 時 code 必須是 null,得到 ${f.code}`);
      if (f.severity !== null) problems.push(`${at}:unclassified 時 severity 必須是 null,得到 ${f.severity}`);
      continue;
    }
    if (f.code === null) {
      problems.push(`${at}:classification 是 ${f.classification} 但沒有 code`);
      continue;
    }
    const expected = bySeverity.get(f.code);
    if (expected === undefined) {
      problems.push(`${at}:${f.code} 不在 rubric 的 ai 規則清單裡`);
    } else if (f.severity !== expected) {
      problems.push(`${at}:${f.code} 的 severity 應為 ${expected},模型給了 ${f.severity}`);
    }
    if (!f.evidence.length) {
      // prompt 硬性限制 3:說不出數字就不要下判斷
      problems.push(`${at}:下了判斷卻沒有引用任何證據`);
    }
  }

  const answered = new Set(findings.map((f) => f.id));
  for (const id of allowed) {
    if (!answered.has(id)) problems.push(`${id}:unresolved 裡的項目沒有被回答`);
  }
  return problems;
}

/* -------------------------------------------------------------- 呼叫 */

function extractText(message) {
  return (message.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('');
}

/** 降級路徑:閘道器不支援 structured outputs 時,自己從文字裡挖 JSON */
function parseLooseJson(text) {
  const trimmed = String(text).trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
  return JSON.parse(trimmed);
}

/**
 * @param {object} opts
 *   opts.payload  buildPayload 的輸出
 *   opts.rubric   rubric.json 內容本體
 *   opts.config   整份 config(會讀 config.llm)
 * @returns {Promise<{findings:Array, problems:Array<string>, meta:object}>}
 */
async function classify(opts) {
  const { payload, rubric } = opts;
  const cfg = loadConfig(opts.config || {});
  const client = opts.client || createClient(cfg);
  const prompt = opts.correction
    ? `${buildPrompt(payload, rubric)}\n\n${correctionBlock(opts.correction)}`
    : buildPrompt(payload, rubric);

  const request = {
    model: cfg.model,
    max_tokens: cfg.maxTokens,
    // 4.6 上省略 thinking 等於不思考 —— 這個任務不能關(見 MODEL_DEFAULTS)
    thinking: { type: 'adaptive' },
    output_config: { effort: cfg.effort },
    messages: [{ role: 'user', content: prompt }],
  };

  const meta = { model: cfg.model, baseURL: cfg.baseURL, structuredOutputs: cfg.structuredOutputs };
  let raw = null;
  let message = null;

  if (cfg.structuredOutputs) {
    const schema = buildFindingsSchema(rubric);
    try {
      message = await client.messages.parse({
        ...request,
        output_config: { ...request.output_config, format: zodOutputFormat(schema, 'dqa_findings') },
      });
      raw = message.parsed_output;
    } catch (e) {
      if (isUnsupportedParam(e)) {
        // 閘道器沒實作 output_config.format。降級,但要在 meta 裡說清楚 ——
        // 降級之後「模型發明新代碼」重新變成可能發生的事,validateFindings 是唯一防線。
        meta.structuredOutputs = false;
        meta.degraded = `閘道器拒絕 structured outputs(${e.status || e.message}),已降級為純文字 JSON`;
      } else if (e instanceof AnthropicClient.APIError) {
        throw e;   // 傳輸 / 認證 / 其他 400 —— 那是真的壞掉,不要當成模型答錯
      } else {
        // SDK 在輸出不符 schema 時丟的是普通 Error。這是**模型答錯**,不是程式壞掉:
        // 回傳成 problems 讓 classifyWithRetry 把原因回灌,而不是帶著 stack trace 整個死掉。
        meta.schemaViolation = e.message;
        return {
          findings: [],
          problems: [`模型輸出不符 schema:${firstLine(e.message)}`],
          meta,
        };
      }
    }
  }

  if (!raw) {
    message = await client.messages.create(request);
    let text = extractText(message);
    try {
      raw = parseLooseJson(text);
    } catch (e) {
      meta.parseError = e.message;
      return { findings: [], problems: [`模型輸出不是合法 JSON:${firstLine(e.message)}`], meta };
    }
  }

  if (!raw || !Array.isArray(raw.findings)) {
    return { findings: [], problems: ['模型回傳的內容沒有 findings 陣列'], meta };
  }

  meta.stopReason = message.stop_reason;
  meta.usage = message.usage;
  if (message.stop_reason === 'refusal') {
    meta.refusal = message.stop_details || null;
  }

  return { findings: raw.findings, problems: validateFindings(raw.findings, payload, rubric), meta };
}

const firstLine = (msg) => String(msg || '').split('\n')[0].slice(0, 200);

/**
 * 閘道器不認得 output_config.format 的樣子。
 *
 * 型別上先確定是 APIError 400(不是本機的解析失敗),再看訊息有沒有指到這個參數 ——
 * 只憑 400 就降級會把「請求真的寫錯」也一起吞掉。
 */
function isUnsupportedParam(e) {
  if (!(e instanceof AnthropicClient.APIError) || e.status !== 400) return false;
  return /output_config|format|unsupported|unknown/i.test(String(e.message || ''));
}

/** 把上一次的違規項目回灌成一段追加指示 */
function correctionBlock(problems) {
  return `## 上一次輸出不合約,請重做
以下是上一次輸出被拒的原因。每一條都是硬性限制,不是建議:

${problems.map((p) => `- ${p}`).join('\n')}

重新輸出完整的 findings,不要解釋、不要為上一次道歉。`;
}

/**
 * 一次重試:格式或語意不合約就把問題回灌給模型再要一次(T3 的驗收條件)。
 *
 * 重試是**重新發一次單輪請求**(把問題附在 prompt 後面),不是接續對話。
 * 接續對話需要把上一輪的 thinking block 原封不動送回去,少送會出事;
 * 而這個任務本來就是單輪分類,沒有需要保留的上下文。
 *
 * 第二次還是不合約就把問題原樣回傳 —— 反覆重試只是把不確定性藏起來,
 * 而「模型答不出合約內的答案」本身就是要讓人看到的訊號。
 */
async function classifyWithRetry(opts) {
  const first = await classify(opts);
  if (!first.problems.length) return first;

  const second = await classify({ ...opts, correction: first.problems });
  second.meta.retried = true;
  second.meta.firstAttemptProblems = first.problems;
  return second;
}

/* ------------------------------------------------------------------ CLI */

/**
 * 連線體檢 —— 對著真實閘道器跑,回報它到底支援什麼。
 *
 * 這一支存在的理由:企業閘道器有可能是薄的反向代理(什麼都透傳),
 * 也可能是自己重寫的一層(只實作部分參數)。在還沒確認之前,
 * 任何「它應該支援」的假設都不該寫進判定流程。體檢先跑,再談分類。
 */
async function check(config) {
  const cfg = loadConfig(config || {});
  const client = createClient(cfg);
  const results = [];
  const record = (name, ok, detail) => {
    results.push({ name, ok, detail });
    console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? `　${detail}` : ''}`);
  };

  console.log(`endpoint ${cfg.baseURL}`);
  console.log(`model    ${cfg.model}`);
  console.log(`憑證     ${cfg.authToken ? 'Bearer(DQA_LLM_AUTH_TOKEN)' : 'x-api-key(DQA_LLM_API_KEY)'}\n`);

  let basicOk = false;
  try {
    const m = await client.messages.create({
      model: cfg.model,
      max_tokens: 64,
      messages: [{ role: 'user', content: 'Reply with the single word: ok' }],
    });
    basicOk = true;
    record('Messages API 通', true, `stop_reason=${m.stop_reason}`);
    record('模型 id 解析得到', m.model === cfg.model,
      m.model === cfg.model ? cfg.model : `送出 ${cfg.model},回來 ${m.model}`);
  } catch (e) {
    record('Messages API 通', false, `${e.status || ''} ${e.message}`.trim());
  }

  if (basicOk) {
    try {
      await client.messages.create({
        model: cfg.model,
        max_tokens: 512,
        thinking: { type: 'adaptive' },
        output_config: { effort: cfg.effort },
        messages: [{ role: 'user', content: 'Reply with the single word: ok' }],
      });
      record(`adaptive thinking + effort=${cfg.effort}`, true);
    } catch (e) {
      record(`adaptive thinking + effort=${cfg.effort}`, false,
        `${e.status || ''} ${e.message}`.trim() + ' —— 判定品質會受影響,見 llm.js 的 MODEL_DEFAULTS');
    }

    const probe = z.object({ ok: z.boolean() });
    try {
      const m = await client.messages.parse({
        model: cfg.model,
        max_tokens: 512,
        messages: [{ role: 'user', content: 'Return {"ok": true}' }],
        output_config: { format: zodOutputFormat(probe, 'probe') },
      });
      record('structured outputs', !!m.parsed_output,
        m.parsed_output ? '' : '回應解析不出結構');
    } catch (e) {
      record('structured outputs', false,
        `${e.status || ''} ${e.message}`.trim() + ' —— 會降級成純文字 JSON,validateFindings 變成唯一防線');
    }
  }

  const failed = results.filter((r) => !r.ok);
  console.log(failed.length ? `\n${failed.length} 項不支援。` : '\n閘道器支援全部需要的能力。');
  return { results, ok: failed.length === 0 };
}

async function main(argv) {
  const [cmd, ...rest] = argv;
  const fs = require('fs');
  const path = require('path');

  const readConfig = () => {
    const p = process.env.DQA_CONFIG || path.join(__dirname, '..', '..', 'config.json');
    return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : {};
  };

  if (cmd === 'check') {
    const { ok } = await check(readConfig());
    process.exit(ok ? 0 : 1);
  }

  if (cmd === 'classify') {
    const [payloadPath, outPath] = rest;
    if (!payloadPath) throw new Error('用法: node src/node/llm.js classify <payload.json> [out.json]');
    const payload = JSON.parse(fs.readFileSync(payloadPath, 'utf8'));
    const config = readConfig();
    const { rubric } = require('./data').loadData({
      tokensDir: config.tokensDir, rubricFile: config.rubricFile,
    });

    const r = await classifyWithRetry({ payload, rubric, config });
    console.log(`模型 ${r.meta.model}${r.meta.retried ? '(重試過一次)' : ''}`);
    if (r.meta.degraded) console.log(`⚠ ${r.meta.degraded}`);
    for (const f of r.findings) {
      console.log(`  [${f.severity || '—'}] ${f.classification.padEnd(12)} ${f.id}`
        + `${f.code ? `　${f.code}` : ''}`);
      for (const e of f.evidence) console.log(`      ${e}`);
    }
    if (r.problems.length) {
      console.error(`\n${r.problems.length} 項不合約(重試後仍然):`);
      for (const p of r.problems) console.error(`  ・${p}`);
    }
    if (outPath) {
      fs.writeFileSync(outPath, `${JSON.stringify(r, null, 2)}\n`);
      console.log(`\n寫入 ${outPath}`);
    }
    process.exit(r.problems.length ? 1 : 0);
  }

  throw new Error('用法: node src/node/llm.js <check|classify> [...]');
}

if (require.main === module) {
  main(process.argv.slice(2)).catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}

module.exports = {
  check,
  classify,
  classifyWithRetry,
  validateFindings,
  buildFindingsSchema,
  loadConfig,
  createClient,
  aiRules,
  MODEL_DEFAULTS,
};
