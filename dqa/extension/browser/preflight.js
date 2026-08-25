/* eslint-env browser */
/**
 * DQA Pre-flight —— 環境鎖與正規化
 *
 * 設計原則:任一項無法確認就 fail,不產出「看起來精確」的無效數據。
 * 這支同時給 Playwright (addScriptTag) 與 Chrome Extension (content script) 使用。
 */
(() => {
  const DQA = (window.__DQA__ = window.__DQA__ || {});

  const FREEZE_STYLE_ID = '__dqa_freeze__';

  function freezeMotion() {
    if (document.getElementById(FREEZE_STYLE_ID)) return;
    const s = document.createElement('style');
    s.id = FREEZE_STYLE_ID;
    s.textContent = `
      *, *::before, *::after {
        transition: none !important;
        animation: none !important;
        animation-play-state: paused !important;
        caret-color: transparent !important;
        scroll-behavior: auto !important;
      }
    `;
    document.head.appendChild(s);
  }

  /**
   * 解除凍結。Playwright 用不到(context 直接丟掉),
   * 但 Extension 是在使用者自己的分頁上跑的,量完必須能把頁面還原成可互動的狀態。
   */
  function unfreezeMotion() {
    const s = document.getElementById(FREEZE_STYLE_ID);
    if (s && s.parentNode) s.parentNode.removeChild(s);
  }

  /** 連兩幀 rAF,確保注入 style 之後 layout 已重算完成 */
  function settle() {
    return new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
  }

  function readTheme(attrs) {
    const el = document.documentElement;
    const body = document.body;
    const out = {};
    for (const a of attrs) {
      out[a] = el.getAttribute(a) ?? (body ? body.getAttribute(a) : null);
    }
    out['prefers-color-scheme'] =
      window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    return out;
  }

  /**
   * @param {object} opts
   * @param {number} opts.expectedViewportWidth  必填。兩側必須相同。
   * @param {string[]} [opts.themeAttrs]         要比對的主題屬性名
   * @param {number} [opts.fontSettleMs]         fonts.ready 之後再等多久
   * @returns {Promise<{ok:boolean, env:object, errors:Array}>}
   */
  DQA.preflight = async function preflight(opts = {}) {
    const errors = [];
    const themeAttrs = opts.themeAttrs || ['data-theme', 'data-color-mode', 'class'];

    // 1) 先關動畫,避免後續量到中間影格
    freezeMotion();

    // 2) 文件本身載入完成
    if (document.readyState !== 'complete') {
      errors.push({ code: 'PF_DOC_NOT_COMPLETE', detail: document.readyState });
    }

    // 3) 字型鎖 —— 這條是 baselineY / measuredWidth 的絕對前提
    if (!document.fonts) {
      errors.push({ code: 'PF_FONTS_API_MISSING' });
    } else {
      try {
        await document.fonts.ready;
      } catch (e) {
        errors.push({ code: 'PF_FONTS_READY_REJECTED' });
      }
      // 只回報「還沒 loaded 的數量」,不回報 family 名稱(可能是內部授權字型名/專案代號)
      let pending = 0;
      document.fonts.forEach((f) => {
        if (f.status !== 'loaded') pending += 1;
      });
      if (pending > 0) errors.push({ code: 'PF_FONTS_PENDING', detail: pending });
    }
    if (opts.fontSettleMs) {
      await new Promise((r) => setTimeout(r, opts.fontSettleMs));
    }

    // 4) Viewport 鎖 —— 這才是幾何是否可比的真正變因
    const clientWidth = document.documentElement.clientWidth;
    if (typeof opts.expectedViewportWidth !== 'number') {
      errors.push({ code: 'PF_VIEWPORT_NOT_SPECIFIED' });
    } else if (clientWidth !== opts.expectedViewportWidth) {
      errors.push({
        code: 'PF_VIEWPORT_MISMATCH',
        detail: { expected: opts.expectedViewportWidth, actual: clientWidth },
      });
    }

    // 5) 縮放鎖
    //    注意:getBoundingClientRect() 回傳 CSS px,與 DPR 無關 —— 不可用 DPR 反向換算座標。
    //    真正的風險是縮放改變了有效 viewport 寬度,進而改變 layout。
    //    pinch zoom 可直接偵測;瀏覽器層級縮放無法可靠偵測,因此改由 (4) 的寬度斷言間接把關,
    //    並把 dpr 記錄下來,交由 node 端比對兩側是否一致。
    const visualScale = window.visualViewport ? window.visualViewport.scale : 1;
    if (Math.abs(visualScale - 1) > 0.001) {
      errors.push({ code: 'PF_PINCH_ZOOM_ACTIVE', detail: visualScale });
    }

    // 6) 捲動位置歸零,避免 sticky / IntersectionObserver 造成的狀態差異
    window.scrollTo(0, 0);

    await settle();

    const env = {
      viewportWidth: document.documentElement.clientWidth,
      viewportHeight: document.documentElement.clientHeight,
      dpr: window.devicePixelRatio,
      visualScale,
      theme: readTheme(themeAttrs),
      ua: navigator.userAgent.replace(/\d+\.\d+\.\d+\.\d+/g, 'x'), // 去掉精確版號
    };

    return { ok: errors.length === 0, env, errors };
  };

  DQA.unfreezeMotion = unfreezeMotion;
})();
