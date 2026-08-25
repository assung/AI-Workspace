'use strict';

/**
 * core 的資料注入層 —— 只有 Node 這條路徑會讀檔。
 *
 * core/*.js 不碰檔案系統,因為 Chrome Extension 沒有 fs。
 * rubric 與 tokens 是「唯一權威」,兩條路徑都必須吃同一份檔案內容(見 ADR-011)。
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');

function loadJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/**
 * @param {object} [opts]
 * @param {string} [opts.tokensDir]   預設 <repo>/tokens
 * @param {string} [opts.rubricFile]  預設 <repo>/rubric.json
 * @returns {{tokens:{spacing:object, colors:object}, rubric:object}}
 */
function loadData(opts = {}) {
  const tokensDir = opts.tokensDir || path.join(ROOT, 'tokens');
  const rubricFile = opts.rubricFile || path.join(ROOT, 'rubric.json');
  return {
    tokens: {
      spacing: loadJson(path.join(tokensDir, 'spacing-scale.json')),
      colors: loadJson(path.join(tokensDir, 'color-primitives.json')),
    },
    rubric: loadJson(rubricFile),
  };
}

module.exports = { loadData, loadJson, ROOT };
