// Password-protect the demo build for the shared artifact.
// The app script (all screens, copy and demo data) is encrypted with AES-256-GCM using a key derived from the
// password (PBKDF2-SHA256, 310k iterations, random salt). Only the password screen ships in clear text;
// the browser decrypts the app after the right password is entered. The password itself is never written out.
//
// usage(先 npx vite build -c vite.demo.config.ts):node scripts/protect-demo.mjs dist-demo <out dir> <password>
// 密碼不進 repo,由執行的人在命令列給。
import { webcrypto as crypto } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const [srcDir, outDir, password] = process.argv.slice(2)
if (!srcDir || !outDir || !password) throw new Error('usage: protect_demo.mjs <src> <out> <password>')

const assets = path.join(srcDir, 'assets')
const jsName = fs.readdirSync(assets).find((f) => /^demo-.*\.js$/.test(f))
const cssName = fs.readdirSync(assets).find((f) => /^demo-.*\.css$/.test(f))
let js = fs.readFileSync(path.join(assets, jsName), 'utf8')
// Assets are resolved against the assets folder (the decrypted script runs inline, where import.meta.url = the page).
const n = js.split('import.meta.url').length - 1
js = js.replaceAll('import.meta.url', 'window.__TW_ASSET_BASE__')

const ITER = 310000
const salt = crypto.getRandomValues(new Uint8Array(16))
const iv = crypto.getRandomValues(new Uint8Array(12))
const baseKey = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey'])
const key = await crypto.subtle.deriveKey(
  { name: 'PBKDF2', salt, iterations: ITER, hash: 'SHA-256' },
  baseKey,
  { name: 'AES-GCM', length: 256 },
  false,
  ['encrypt'],
)
const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(js)))
const b64 = (u8) => Buffer.from(u8).toString('base64')

fs.rmSync(outDir, { recursive: true, force: true })
fs.mkdirSync(path.join(outDir, 'assets'), { recursive: true })
for (const f of fs.readdirSync(assets)) {
  if (f === jsName) continue
  fs.copyFileSync(path.join(assets, f), path.join(outDir, 'assets', f))
}
fs.writeFileSync(
  path.join(outDir, 'assets', 'app.enc.json'),
  JSON.stringify({ v: 1, iter: ITER, salt: b64(salt), iv: b64(iv), data: b64(cipher) }),
)

const html = `<!doctype html>
<html lang="en" data-theme="light">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="robots" content="noindex" />
    <title>Design demo</title>
    <link rel="stylesheet" href="./assets/${cssName}">
    <style>
      /* Password screen — DS tokens from the app stylesheet (canvas / surface / field height / radius / primary) */
      .tw-gate { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; padding: 16px;
        background: var(--canvas); color: var(--foreground); font-family: var(--font-sans); font-size: var(--font-body-size); line-height: 1.5; }
      .tw-gate[hidden] { display: none; }
      .tw-card { width: 100%; max-width: 360px; padding: 24px; border-radius: var(--radius-md);
        background: var(--surface); box-shadow: var(--elevation-200); display: flex; flex-direction: column; gap: 16px; }
      .tw-card h1 { margin: 0; font-size: var(--font-h4-size); font-weight: 600; line-height: 1.4; }
      .tw-card p { margin: 4px 0 0; color: var(--fg-secondary); }
      .tw-field { display: flex; flex-direction: column; gap: 4px; }
      .tw-field label { font-weight: 500; }
      .tw-field input { height: var(--field-height-md); padding: 0 12px; border-radius: var(--radius-md);
        border: 1px solid var(--border); background: var(--surface); color: var(--foreground); font: inherit; outline: none; }
      .tw-field input:focus-visible { border-color: var(--primary); box-shadow: 0 0 0 1px var(--primary); }
      .tw-field input[aria-invalid="true"] { border-color: var(--error); }
      .tw-card .tw-error { color: var(--error); font-size: var(--font-footnote-size); min-height: 1.5em; margin: 0; }
      .tw-card button { height: var(--field-height-md); border: 0; border-radius: var(--radius-md); cursor: pointer;
        background: var(--primary); color: var(--on-emphasis); font: inherit; font-weight: 500; }
      .tw-card button:hover { background: var(--primary-hover); }
      .tw-card button:disabled { opacity: .6; cursor: progress; }
    </style>
  </head>
  <body>
    <div class="tw-gate" id="tw-gate" hidden>
      <form class="tw-card" id="tw-form" novalidate>
        <div>
          <h1>Design demo</h1>
          <p>This demo is password protected. Enter the password you were given to continue.</p>
        </div>
        <div class="tw-field">
          <label for="tw-pw">Password</label>
          <input id="tw-pw" type="password" autocomplete="current-password" aria-describedby="tw-err" required />
          <p class="tw-error" id="tw-err" role="alert"></p>
        </div>
        <button type="submit" id="tw-go">Continue</button>
      </form>
    </div>
    <div id="root"></div>
    <script>
      (function () {
        var STORE = 'tw-demo-pw';
        var gate = document.getElementById('tw-gate');
        var form = document.getElementById('tw-form');
        var input = document.getElementById('tw-pw');
        var err = document.getElementById('tw-err');
        var go = document.getElementById('tw-go');
        var bundle = fetch('./assets/app.enc.json').then(function (r) { return r.json(); });
        function u8(b64) { var s = atob(b64), a = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) a[i] = s.charCodeAt(i); return a; }
        function unlock(pw) {
          return bundle.then(function (b) {
            return crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveKey'])
              .then(function (k) {
                return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: u8(b.salt), iterations: b.iter, hash: 'SHA-256' },
                  k, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
              })
              .then(function (key) { return crypto.subtle.decrypt({ name: 'AES-GCM', iv: u8(b.iv) }, key, u8(b.data)); })
              .then(function (plain) {
                window.__TW_ASSET_BASE__ = new URL('./assets/', location.href).href;
                var s = document.createElement('script');
                s.type = 'module';
                s.textContent = new TextDecoder().decode(plain);
                gate.hidden = true;
                document.body.appendChild(s);
              });
          });
        }
        // Same tab, already unlocked (e.g. reloading to restart the demo script) → skip the password screen
        var saved = null;
        try { saved = sessionStorage.getItem(STORE); } catch (e) {}
        (saved ? unlock(saved) : Promise.reject()).catch(function () {
          gate.hidden = false;
          input.focus();
        });
        form.addEventListener('submit', function (e) {
          e.preventDefault();
          var pw = input.value;
          if (!pw) { err.textContent = 'Enter the password.'; input.setAttribute('aria-invalid', 'true'); input.focus(); return; }
          go.disabled = true; err.textContent = '';
          unlock(pw).then(function () {
            try { sessionStorage.setItem(STORE, pw); } catch (e2) {}
          }, function () {
            go.disabled = false;
            err.textContent = 'Incorrect password. Try again.';
            input.setAttribute('aria-invalid', 'true');
            input.select();
          });
        });
        input.addEventListener('input', function () { input.removeAttribute('aria-invalid'); err.textContent = ''; });
      })();
    </script>
  </body>
</html>
`
fs.writeFileSync(path.join(outDir, 'index.html'), html)
console.log(`encrypted ${jsName} (${(js.length / 1024).toFixed(0)} KB, ${n} asset URLs rebased) → assets/app.enc.json`)
