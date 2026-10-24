# vendor/ — 暫時性的 DS 打包檔

`@qijenchen/design-system` 與 `@qijenchen/storybook-config` 0.1.0-beta.148 尚未發布到 npm
(DS repo `ajenchen/design-system` PR #169,commit `a639035`)。這兩個 `.tgz` 是從該 PR 本機打包的版本,
讓 Netlify 在 148 發布前就能安裝建置。已取得 DS 作者同意放在此私人 repo 作內部預覽用(2026-10-24)。

**148 發布到 npm 後請移除:**

1. `package.json` 的兩個 `file:vendor/...` 改回 `^0.1.0-beta.148`,刪掉 `overrides` 裡這兩個套件
2. 刪除本資料夾
3. `npm install` 更新 `package-lock.json` 後提交
