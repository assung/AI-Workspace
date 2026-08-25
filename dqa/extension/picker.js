/* eslint-env browser */
/**
 * DQA 元素挑選器 —— 只有 Extension 這條路徑需要
 *
 * Playwright 那邊由 config 的 selector 指定目標;在瀏覽器裡人是用眼睛選的,
 * 所以這支不放進 src/browser/(那裡是兩條路徑共用的量測邏輯,不能被單邊需求污染)。
 *
 * 兩個必須守住的點:
 *  1. 選取結果存成 Element 參照,不合成 selector 字串 —— 合成出來的 selector 不保證唯一。
 *  2. 所有框線都掛在同一個 host 底下,量測前整個從 DOM 拿掉。
 *     框線是 body 的子節點,留著就會被 extract 當成鄰域的一員。
 */
(() => {
  const DQA = (window.__DQA__ = window.__DQA__ || {});
  if (DQA.picker) { DQA.picker.rebind(); return; }

  const HOST_ID = '__dqa_picker_host__';
  const Z = 2147483646;

  let host = null;
  let hoverBox = null;
  let pickedBox = null;
  let hint = null;
  let active = false;
  let candidate = null;
  let attached = false;

  /* ------------------------------------------------------------------ 外觀 */

  function buildHost() {
    const h = document.createElement('div');
    h.id = HOST_ID;
    h.style.cssText = 'all:initial;position:fixed;inset:0;pointer-events:none;z-index:' + Z;

    const mk = (border, bg) => {
      const d = document.createElement('div');
      d.style.cssText = `position:fixed;pointer-events:none;box-sizing:border-box;border:${border};background:${bg};display:none;`;
      h.appendChild(d);
      return d;
    };
    hoverBox = mk('2px solid #0c66e4', 'rgba(12,102,228,.10)');
    pickedBox = mk('2px solid #ae2e24', 'rgba(174,46,36,.08)');

    hint = document.createElement('div');
    hint.style.cssText = [
      'position:fixed;left:50%;bottom:24px;transform:translateX(-50%)',
      'font:12px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
      'color:#fff;background:#172b4d;padding:8px 14px;border-radius:6px',
      'pointer-events:none;white-space:nowrap;display:none',
      'box-shadow:0 4px 12px rgba(0,0,0,.3)',
    ].join(';');
    h.appendChild(hint);
    return h;
  }

  function attach() {
    if (!host) host = buildHost();
    if (!attached && document.body) {
      document.body.appendChild(host);
      attached = true;
    }
  }

  function detach() {
    if (attached && host && host.parentNode) host.parentNode.removeChild(host);
    attached = false;
  }

  function place(box, el) {
    if (!el || !el.isConnected) { box.style.display = 'none'; return; }
    const r = el.getBoundingClientRect();
    box.style.display = 'block';
    box.style.left = `${r.left}px`;
    box.style.top = `${r.top}px`;
    box.style.width = `${r.width}px`;
    box.style.height = `${r.height}px`;
  }

  function label(el) {
    const r = el.getBoundingClientRect();
    return `${describe(el).label}  ${Math.round(r.width)}×${Math.round(r.height)}`;
  }

  /* ---------------------------------------------------------------- 描述字串 */

  /** 只給操作者在 popup 裡認節點用,永遠不進 payload。 */
  function describe(el) {
    if (!el || el.nodeType !== 1) return { label: '(無)', tag: null, depth: 0 };
    const tag = el.tagName.toLowerCase();
    const id = el.id ? `#${el.id}` : '';
    const cls = (el.getAttribute('class') || '').trim().split(/\s+/).filter(Boolean).slice(0, 2)
      .map((c) => `.${c}`).join('');
    const dc = el.getAttribute('data-component') || el.getAttribute('data-testid');
    let depth = 0;
    for (let p = el.parentElement; p; p = p.parentElement) depth += 1;
    return {
      label: `${tag}${id}${cls}${dc ? `[${dc}]` : ''}`,
      tag,
      depth,
      childCount: el.children.length,
      siblingCount: el.parentElement ? el.parentElement.children.length : 0,
    };
  }

  /* ------------------------------------------------------------------ 事件 */

  function setCandidate(el) {
    candidate = el;
    if (!el) { hoverBox.style.display = 'none'; return; }
    place(hoverBox, el);
    hint.textContent = `${label(el)}　·　點擊選取　·　↑ 父層　↓ 子層　·　Esc 取消`;
  }

  function onMove(e) {
    if (!active) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || el === host || host.contains(el)) return;
    setCandidate(el);
  }

  function onKey(e) {
    if (!active) return;
    if (e.key === 'Escape') { e.preventDefault(); stop(); return; }
    if (!candidate) return;
    if (e.key === 'ArrowUp' && candidate.parentElement) {
      e.preventDefault(); setCandidate(candidate.parentElement);
    } else if (e.key === 'ArrowDown' && candidate.children.length) {
      e.preventDefault(); setCandidate(candidate.children[0]);
    } else if (e.key === 'Enter') {
      e.preventDefault(); commit(candidate);
    }
  }

  function onClick(e) {
    if (!active) return;
    e.preventDefault();
    e.stopPropagation();
    const el = document.elementFromPoint(e.clientX, e.clientY);
    commit(el && !host.contains(el) ? el : candidate);
  }

  function commit(el) {
    if (!el) return;
    DQA.picked = el;
    stop();
    place(pickedBox, el);
    hint.style.display = 'block';
    hint.textContent = `已選取 ${label(el)} —— 回到 DQA 面板擷取`;
    setTimeout(() => { if (hint) hint.style.display = 'none'; }, 2600);
  }

  const OPTS = { capture: true };

  function bind() {
    document.addEventListener('mousemove', onMove, OPTS);
    document.addEventListener('click', onClick, OPTS);
    document.addEventListener('keydown', onKey, OPTS);
  }

  function unbind() {
    document.removeEventListener('mousemove', onMove, OPTS);
    document.removeEventListener('click', onClick, OPTS);
    document.removeEventListener('keydown', onKey, OPTS);
  }

  function start() {
    attach();
    if (active) return;
    active = true;
    hint.style.display = 'block';
    hint.textContent = '移動滑鼠挑選元素　·　↑ 父層　↓ 子層　·　Esc 取消';
    bind();
  }

  function stop() {
    active = false;
    unbind();
    hoverBox.style.display = 'none';
    hint.style.display = 'none';
    candidate = null;
  }

  function clear() {
    stop();
    DQA.picked = null;
    if (pickedBox) pickedBox.style.display = 'none';
    detach();
  }

  /** 量測期間把整個 host 從 DOM 拿掉,量完再掛回去(見檔首第 2 點)。 */
  function setOverlaysVisible(visible) {
    if (visible) {
      if (DQA.picked) { attach(); place(pickedBox, DQA.picked); }
    } else {
      detach();
    }
  }

  /** 重複注入時(每次擷取都會 executeScript 一遍)只重綁事件,不重建狀態。 */
  function rebind() {
    if (active) { unbind(); bind(); }
    if (DQA.picked && DQA.picked.isConnected) { attach(); place(pickedBox, DQA.picked); }
  }

  window.addEventListener('scroll', () => {
    if (DQA.picked && DQA.picked.isConnected && attached) place(pickedBox, DQA.picked);
    if (active && candidate) place(hoverBox, candidate);
  }, true);

  DQA.describe = describe;
  DQA.picker = { start, stop, clear, setOverlaysVisible, rebind };
})();
