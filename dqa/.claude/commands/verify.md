---
description: 完整驗證(確定性引擎 + guard + 脫敏)
---

依序跑並回報結果:

1. `npm test` — 六條確定性規則的 fixture 驗收
2. `npm run test:guards` — 七種 gap guard 跳過路徑
3. `npm run test:sanitize` — 三種外洩向量阻擋
4. `npm run test:color` — 色彩正規化輸出、alpha 合成、有效背景堆疊
5. `npm run test:density` — spacing 逆映射的 density 相依性、`0px` 的可觀測性
6. `npm run test:core` — core 在 Node 與瀏覽器兩條路徑上輸出必須逐字相同
7. `npm run test:sync` — `extension/` 的複製品與 `src/` 一致
8. `npm run test:ext` — 擴充套件靜態完整性

有瀏覽器的話再跑一次端對端(不含在 `test:all`):

9. `DQA_CHROMIUM=<chrome> xvfb-run -a npm run test:e2e` — 擴充套件端對端
10. `DQA_CHROMIUM=<chrome> xvfb-run -a npm run test:tokens` — token 抽取

任何一項失敗,**先讀 `docs/DECISIONS.md` 對應的 ADR 再動手**。
很多「修好測試」的直覺做法其實是回退掉一個已經辯論過的決定。

特別注意這三種假修法:
- 讓 guard 放寬以提高覆蓋率 → 違反 ADR-006
- 把 severity 改成隨 delta 浮動 → 違反 ADR-004
- 減少送給 AI 的 nodes 以節省 token → 違反 ADR-005
- 手改 `extension/` 底下的複製品讓 `test:sync` 過 → 違反 ADR-011(要改的是 `src/`,然後 `npm run sync:ext`)
- 在 core 裡加 `require` / `fs` 讓 Node 那條路徑好寫 → 違反 ADR-011,擴充套件會直接壞掉
- 在 core 裡自己實作 oklch → sRGB 讓 Node 也能轉色 → 違反 ADR-014,色域外的答案會跟瀏覽器不一致
- 手改 `tokens/color-primitives.json` 讓某個色對上 → 違反 ADR-016,那是產生檔,要改抽取參數重跑
- 把 8 碼 hex 改回 6 碼「簡化」→ 違反 ADR-017,DS 的整條 neutral scale 會被壓成一個 token
- density 不明時用預設值(md)讓規則跑得動 → 違反 ADR-019,會安靜地把合法值判成違規或反過來
- 把排除掉的 `0px` 改成進 `skipped_checks` → 違反 ADR-020,會把覆蓋率指標稀釋成背景噪音
