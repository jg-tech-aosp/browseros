/**
 * BrowserOS v2 — Window Manager
 * src/wm/wm.js
 *
 * Creates and manages all OS windows.
 * Each window wraps a sandboxed iframe for app isolation.
 * Handles: create, focus, minimize, maximize, close, drag, resize.
 * Also handles OS-level UI: notify toasts, system app launching.
 */

// ─── CSS injected once into the host document ─────────────────────────────────

const WM_STYLES = `
  :root {
    --wm-accent:       #0078d4;
    --wm-bg:           #1e1e2e;
    --wm-border:       #3a3a5c;
    --wm-titlebar:     #2a2a4a;
    --wm-titlebar-txt: #e0e0ff;
    --wm-text:         #e0e0ff;
    --wm-text-dim:     #8888aa;
    --wm-hover:        #2d2d4e;
    --wm-taskbar-bg:   rgba(15,12,40,0.92);
    --wm-panel-bg:     rgba(20,20,40,0.97);
    --wm-panel-border: rgba(255,255,255,0.12);
    --wm-control-bg:   rgba(255,255,255,0.08);
    --wm-control-border: rgba(255,255,255,0.12);
    --wm-control-hover: rgba(255,255,255,0.14);
    --wm-separator:    rgba(255,255,255,0.1);
    --wm-backdrop-filter: blur(24px);
    --wm-window-bg: transparent;
    --wm-shadow:       0 8px 32px rgba(0,0,0,0.5);
    --wm-radius:       8px;
    --wm-taskbar-h:    48px;
    --wm-font:         'Segoe UI', system-ui, sans-serif;
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: var(--wm-font);
    color: var(--wm-text);
    overflow: hidden;
    width: 100vw;
    height: 100vh;
    background: var(--wm-wallpaper, linear-gradient(135deg,#0f0c29,#302b63,#24243e));
  }

  #wm-desktop {
    position: absolute;
    inset: 0 0 var(--wm-taskbar-h) 0;
    overflow: hidden;
    user-select: none;
  }

  /* ── Windows ── */
  .wm-window {
    position: absolute;
    display: flex;
    flex-direction: column;
    background: var(--wm-window-bg, var(--wm-bg));
    border: 1px solid var(--wm-border);
    border-radius: var(--wm-radius);
    box-shadow: var(--wm-shadow);
    min-width: 320px;
    min-height: 240px;
    overflow: hidden;
    transition: box-shadow 0.15s, top 0.24s cubic-bezier(.2,.75,.25,1), left 0.24s cubic-bezier(.2,.75,.25,1), width 0.24s cubic-bezier(.2,.75,.25,1), height 0.24s cubic-bezier(.2,.75,.25,1), border-radius 0.24s ease;
    user-select: none;
  }
  .wm-window.wm-window-ice-dragging, .wm-window.wm-window-ice-sliding { transition: none !important; }
  .wm-window.wm-window-opening { animation: wm-window-open 0.22s cubic-bezier(.2,.75,.25,1) both; }
  .wm-window.wm-window-minimizing { animation: wm-window-minimize 0.18s ease-in both; pointer-events:none; }
  .wm-window.wm-window-restoring { animation: wm-window-restore 0.2s cubic-bezier(.2,.75,.25,1) both; }
  @keyframes wm-window-open {
    from { opacity:0; transform:translateY(10px) scale(.97); }
    to { opacity:1; transform:translateY(0) scale(1); }
  }
  @keyframes wm-window-minimize {
    to { opacity:0; transform:translateY(12px) scale(.94); }
  }
  @keyframes wm-window-restore {
    from { opacity:0; transform:translateY(12px) scale(.94); }
    to { opacity:1; transform:translateY(0) scale(1); }
  }
  .wm-window.focused {
    box-shadow: var(--wm-shadow), 0 0 0 1px var(--wm-accent);
  }
  .wm-window.minimized { display: none; }
  .wm-window.maximized {
    top: 0 !important; left: 0 !important;
    width: 100% !important;
    height: calc(100vh - var(--wm-taskbar-h)) !important;
    border-radius: 0;
  }

  .wm-titlebar, .wm-titlebar-btns, .wm-btn, #wm-taskbar, #wm-taskbar-apps, .wm-taskbar-btn, .wm-pinned-btn, #wm-start-btn, #wm-tray, #wm-clock {
    user-select: none;
  }
  .bos-desktop-icon {
    user-select: none;
  }
  .wm-titlebar {
    height: 38px;
    background: var(--wm-titlebar-bg, var(--wm-titlebar));
    backdrop-filter: var(--wm-backdrop-filter, blur(24px));
    display: flex;
    align-items: center;
    padding: 0 10px;
    gap: 8px;
    cursor: move;
    flex-shrink: 0;
    border-bottom: 1px solid var(--wm-border);
    user-select: none;
  }
  .wm-titlebar-icon  { font-size: 16px; flex-shrink: 0; }
  .wm-titlebar-title {
    flex: 1;
    font-size: 13px;
    color: var(--wm-titlebar-txt);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .wm-titlebar-btns  { display: flex; gap: 4px; }

  .wm-btn {
    width: 26px; height: 26px;
    border: none;
    border-radius: 5px;
    cursor: pointer;
    font-size: 13px;
    display: flex; align-items: center; justify-content: center;
    background: var(--wm-control-bg);
    color: var(--wm-text);
    transition: background 0.12s;
  }
  .wm-btn:hover         { background: var(--wm-control-hover); }
  .wm-btn.wm-btn-close:hover { background: #c42b1c; color: #fff; }

  .wm-iframe {
    flex: 1;
    border: none;
    background: var(--wm-bg);
    display: block;
  }

  .wm-resize {
    position: absolute;
    right: 0; bottom: 0;
    width: 18px; height: 18px;
    cursor: se-resize;
  }

  /* Progress bar on titlebar bottom edge */
  .wm-progress {
    position: absolute;
    bottom: 0; left: 0;
    height: 2px;
    background: var(--wm-accent);
    transition: width 0.2s;
    pointer-events: none;
  }

  /* ── Taskbar ── */
  #wm-taskbar {
    position: absolute;
    bottom: 0; left: 0; right: 0;
    height: var(--wm-taskbar-h);
    background: var(--wm-taskbar-bg);
    backdrop-filter: var(--wm-backdrop-filter);
    border-top: 1px solid var(--wm-panel-border);
    transition: background-color 0.2s, backdrop-filter 0.2s;
    display: flex;
    align-items: center;
    padding: 0 8px;
    gap: 4px;
    z-index: 9000;
  }

  #wm-start-btn {
    width: 38px; height: 38px;
    background: #000;
    border: 1px solid rgba(255,255,255,0.24); border-radius: 8px; padding: 4px;
    cursor: pointer; font-size: 20px;
    color: #fff;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
    transition: background 0.15s;
  }
  #wm-start-btn:hover { filter: brightness(1.15); }
  .wm-start-logo { width: 28px; height: 28px; object-fit: contain; border-radius: 3px; display: block; }

  #wm-taskbar-apps { display: flex; gap: 4px; flex: 1; overflow: hidden; }

  .wm-taskbar-btn {
    height: 36px;
    padding: 0 10px;
    background: var(--wm-control-bg);
    border: 1px solid var(--wm-control-border);
    border-radius: 6px;
    color: var(--wm-text);
    cursor: pointer;
    font-size: 12px;
    display: flex; align-items: center; gap: 6px;
    white-space: nowrap;
    max-width: 160px;
    overflow: hidden;
    transition: background 0.12s;
    flex-shrink: 0;
  }
  .wm-taskbar-btn.active  { background: rgba(0,120,212,0.35); border-color: var(--wm-accent); }
  .wm-taskbar-btn:hover   { background: var(--wm-control-hover); }
  .wm-taskbar-btn .wm-running-dot {
    width: 5px; height: 5px; border-radius: 50%;
    background: var(--wm-accent); flex-shrink: 0;
  }

  #wm-clock {
    font-size: 12px; color: var(--wm-text);
    text-align: right; padding: 0 8px;
    white-space: nowrap; flex-shrink: 0;
    line-height: 1.4;
  }

  /* ── Desktop menu and flyout motion ── */
  #bos-startmenu.bos-menu-opening { animation: bos-menu-in 0.18s cubic-bezier(.2,.75,.25,1) both; }
  #bos-startmenu.bos-menu-closing { animation: bos-menu-out 0.15s ease-in both; pointer-events:none; }
  .bos-flyout-opening { transform-origin:bottom right; animation:bos-flyout-in 0.18s cubic-bezier(.2,.75,.25,1) both; }
  .bos-flyout-closing { transform-origin:bottom right; animation:bos-flyout-out 0.14s ease-in both; pointer-events:none; }
  @keyframes bos-menu-in { from { opacity:0; transform:translateY(12px) scale(.97); } to { opacity:1; transform:translateY(0) scale(1); } }
  @keyframes bos-menu-out { to { opacity:0; transform:translateY(8px) scale(.98); } }
  @keyframes bos-flyout-in { from { opacity:0; transform:translateY(10px) scale(.97); } to { opacity:1; transform:translateY(0) scale(1); } }
  @keyframes bos-flyout-out { to { opacity:0; transform:translateY(8px) scale(.98); } }

  /* ── App switcher ── */
  #wm-app-switcher {
    position:fixed; inset:0; z-index:100000; display:flex; align-items:center; justify-content:center;
    padding:24px; background:rgba(5,8,18,.42); backdrop-filter:blur(8px);
  }
  #wm-app-switcher[hidden] { display:none; }
  #wm-app-switcher .wm-switcher-panel {
    width:min(640px,100%); max-height:min(70vh,560px); overflow:auto; padding:16px;
    border:1px solid var(--wm-panel-border); border-radius:14px; background:var(--wm-panel-bg);
    color:var(--wm-text); box-shadow:0 20px 70px rgba(0,0,0,.45);
  }
  #wm-app-switcher h2 { margin:2px 4px 12px; font-size:14px; font-weight:600; }
  #wm-app-switcher .wm-switcher-list { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:8px; }
  #wm-app-switcher .wm-switcher-item {
    min-width:0; min-height:88px; padding:12px; border:1px solid var(--wm-control-border);
    border-radius:10px; background:var(--wm-control-bg); color:inherit; font:inherit;
    display:flex; flex-direction:column; align-items:center; justify-content:center; gap:8px; cursor:pointer;
  }
  #wm-app-switcher .wm-switcher-item:hover, #wm-app-switcher .wm-switcher-item.selected {
    border-color:var(--wm-accent); background:var(--wm-control-hover); outline:2px solid color-mix(in srgb,var(--wm-accent) 55%,transparent);
  }
  #wm-app-switcher .wm-switcher-icon { width:30px; height:30px; display:grid; place-items:center; font-size:25px; }
  #wm-app-switcher .wm-switcher-icon img { max-width:30px; max-height:30px; object-fit:contain; }
  #wm-app-switcher .wm-switcher-title { max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:12px; }
  #wm-app-switcher .wm-switcher-hint { margin:12px 4px 0; color:var(--wm-text-dim); font-size:11px; text-align:center; }
  @media (prefers-reduced-motion:reduce) { #wm-app-switcher * { animation:none!important; transition:none!important; } }

  /* ── Toast notifications ── */
  #wm-toasts {}
    position: fixed;
    bottom: calc(var(--wm-taskbar-h) + 12px);
    right: 16px;
    display: flex; flex-direction: column; gap: 8px;
    z-index: 99998;
    pointer-events: none;
  }
  .wm-toast {
    background: var(--wm-panel-bg);
    border: 1px solid var(--wm-panel-border);
    border-radius: 8px;
    padding: 10px 16px;
    font-size: 13px;
    color: var(--wm-text);
    box-shadow: 0 4px 20px rgba(0,0,0,0.5);
    backdrop-filter: var(--wm-backdrop-filter, blur(24px));
    animation: wm-toast-in 0.2s ease;
    pointer-events: auto;
    max-width: 300px;
  }
  @keyframes wm-toast-in {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .wm-toast.out {
    animation: wm-toast-out 0.3s ease forwards;
  }
  @keyframes wm-toast-out {
    to { opacity: 0; transform: translateY(8px); }
  }

  /* ── Crash overlay ── */
  .wm-crash {
    position: absolute; inset: 0;
    background: rgba(10,5,20,0.95);
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    gap: 10px; padding: 24px; text-align: center;
    color: #ff8888; font-size: 13px;
  }
  .wm-crash-icon { font-size: 36px; }
  .wm-crash pre  {
    background: rgba(255,255,255,0.05);
    border-radius: 6px; padding: 10px;
    font-size: 11px; color: #ffaaaa;
    white-space: pre-wrap; max-width: 100%;
    text-align: left;
  }
`;

// ─── Window Manager ────────────────────────────────────────────────────────────

export class WindowManager {
  /**
   * @param {object} opts
   * @param {Kernel}   opts.kernel   - Kernel instance (set after kernel boot)
   * @param {object}   opts.settings - Settings store
   * @param {Function} opts.onStart  - Called when start button is clicked
   */
  constructor({ kernel, settings, fs, onStart } = {}) {
    this._kernel   = kernel;
    this._settings = settings;
    this._fs       = fs;
    this._wallpaperRevision = 0;
    this._onStart  = onStart || (() => {});
    this._windows  = new Map();   // instanceId → { el, iframe, opts, state }
    this._zIndex   = 100;
    this._activeId = null;
    this._focusOrder = [];
    this._switcherOverlay = null;
    this._switcherWindows = [];
    this._switcherIndex = 0;
    this._switcherReturnFocus = null;
    this._systemApps = new Map(); // appId → mount function (for native apps)
  }

  // ─── Boot ──────────────────────────────────────────────────────────────────

  boot() {
    this._injectStyles();
    this._buildDOM();
    this._bindAppSwitcher();
    this._startClock();
    console.log('[wm] Booted');
  }

  // Allow index.js to set the start button handler after boot
  set onStart(fn) { this._onStart = fn; }

  _injectStyles() {
    const style = document.createElement('style');
    style.textContent = WM_STYLES;
    document.head.appendChild(style);
  }

  _buildDOM() {
    document.body.innerHTML = `
      <div id="wm-desktop"></div>
      <div id="wm-toasts"></div>
      <div id="wm-app-switcher" hidden role="dialog" aria-modal="true" aria-label="Switch apps">
        <section class="wm-switcher-panel">
          <h2>Switch apps</h2>
          <div class="wm-switcher-list"></div>
          <div class="wm-switcher-hint">Tab or arrow keys to move · Enter to switch · Esc to cancel</div>
        </section>
      </div>
      <div id="wm-taskbar">
        <button id="wm-start-btn" title="Start" aria-label="Open Start menu"><img class="wm-start-logo" src="${new URL('../../assets/browseros-logo-white-black.png', import.meta.url).href}" alt=""></button>
        <div id="wm-taskbar-apps"></div>
        <div id="wm-clock"></div>
      </div>
    `;
    document.getElementById('wm-start-btn').onclick = () => this._onStart();
  }

  _startClock() {
    const tick = () => {
      const now  = new Date();
      const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const date = now.toLocaleDateString([], { month: 'short', day: 'numeric' });
      const el   = document.getElementById('wm-clock');
      if (el) el.innerHTML = `${time}<br><span style="font-size:10px">${date}</span>`;
    };
    tick();
    setInterval(tick, 1000);
  }

  // ─── System app registry ───────────────────────────────────────────────────

  /**
   * Register a native system app (non-.beep).
   * mount(container, instanceId) is called to render the app.
   */
  registerSystemApp(appId, { title, icon, width, height, mount }) {
    this._systemApps.set(appId, { title, icon, width, height, mount });
  }

  openSystemApp(appId, args = {}) {
    const app = this._systemApps.get(appId);
    if (!app) { console.warn(`[wm] Unknown system app: ${appId}`); return; }
    let instanceOnClose = null;
    const instanceId = this._createWindow({
      instanceId: `sys_${appId}_${Date.now()}`,
      title:  app.title,
      icon:   app.icon,
      width:  app.width  || 700,
      height: app.height || 500,
      isSystem: true,
      appId,
      onClose: (id) => { if (instanceOnClose) instanceOnClose(id); },
    });
    const body = document.getElementById(`wm-body-${instanceId}`);
    if (body && app.mount) {
      const cleanup = app.mount(body, instanceId, args);
      if (typeof cleanup === 'function') instanceOnClose = cleanup;
    }
    return instanceId;
  }

  // ─── .beep window creation ─────────────────────────────────────────────────

  /**
   * Create a window for a sandboxed .beep app.
   * Called by the launcher after unzipping and validating the manifest.
   *
   * @param {object} opts
   * @param {string}   opts.instanceId
   * @param {string}   opts.title
   * @param {string}   opts.icon
   * @param {number}   opts.width
   * @param {number}   opts.height
   * @param {string}   opts.srcdoc     - Full iframe HTML (BOS client + app code)
   * @param {Function} opts.onClose    - Called when window is closed
   * @returns {HTMLIFrameElement}
   */
  createAppWindow({ instanceId, appId, title, icon, width, height, srcdoc, onClose }) {
    this._createWindow({ instanceId, appId, title, icon, width, height, srcdoc, onClose });
    const body = document.getElementById(`wm-body-${instanceId}`);

    // Create sandboxed iframe
    const iframe = document.createElement('iframe');
    iframe.className  = 'wm-iframe';
    iframe.sandbox    = 'allow-scripts';
    iframe.srcdoc     = srcdoc;
    body.appendChild(iframe);

    // Store reference
    const w = this._windows.get(instanceId);
    if (w) w.iframe = iframe;

    return iframe;
  }

  // ─── Core window factory ───────────────────────────────────────────────────

  _createWindow({ instanceId, appId, title, icon, width, height, onClose, isSystem }) {
    const offset = this._windows.size * 24;
    const x = 80 + offset;
    const y = 60 + offset;

    const el = document.createElement('div');
    el.className  = 'wm-window wm-window-opening';
    el.id         = `wm-win-${instanceId}`;
    el.style.cssText = `left:${x}px;top:${y}px;width:${width}px;height:${height}px;z-index:${++this._zIndex}`;

    el.innerHTML = `
      <div class="wm-titlebar" id="wm-tb-${instanceId}">
        <span class="wm-titlebar-icon">${icon || '🪟'}</span>
        <span class="wm-titlebar-title" id="wm-title-${instanceId}">${title || 'App'}</span>
        <div class="wm-titlebar-btns">
          <button class="wm-btn wm-btn-min"   title="Minimize">─</button>
          <button class="wm-btn wm-btn-max"   title="Maximize">□</button>
          <button class="wm-btn wm-btn-close" title="Close">✕</button>
        </div>
      </div>
      <div class="wm-body" id="wm-body-${instanceId}" style="flex:1;overflow:hidden;display:flex;flex-direction:column;position:relative;min-height:0"></div>
    `;

    document.getElementById('wm-desktop').appendChild(el);
    el.addEventListener('animationend', event => {
      if (event.target === el && el.classList.contains('wm-window-opening')) {
        el.classList.remove('wm-window-opening');
      }
    });

    // State
    const state = { minimized: false, maximized: false, prevRect: null, animationEnd: null };
    this._windows.set(instanceId, { el, iframe: null, state, onClose, appId, title: title || 'App', icon: icon || '🪟' });

    // Wire up controls
    el.querySelector('.wm-btn-min').onclick   = e => { e.stopPropagation(); this.minimize(instanceId); };
    el.querySelector('.wm-btn-max').onclick   = e => { e.stopPropagation(); this.maximize(instanceId); };
    el.querySelector('.wm-btn-close').onclick = e => { e.stopPropagation(); this.close(instanceId); };
    el.querySelector('.wm-titlebar').ondblclick = () => this.maximize(instanceId);

    el.addEventListener('mousedown', () => this.focus(instanceId));

    this._makeDraggable(el, el.querySelector('.wm-titlebar'), instanceId);
    this._makeResizable(el);

    this.focus(instanceId);
    this._addTaskbarBtn(instanceId, title, icon, appId);

    return instanceId;
  }

  // ─── Window controls ───────────────────────────────────────────────────────

  focus(instanceId) {
    const w = this._windows.get(instanceId);
    if (!w) return;
    this._activeId = instanceId;
    this._focusOrder = [instanceId, ...this._focusOrder.filter(id => id !== instanceId && this._windows.has(id))];
    w.el.style.zIndex = ++this._zIndex;

    // Update focused class
    this._windows.forEach((win, id) => {
      win.el.classList.toggle('focused', id === instanceId);
    });

    this._syncTaskbarButtons();
  }

  _bindAppSwitcher() {
    this._switcherOverlay = document.getElementById('wm-app-switcher');
    document.addEventListener('keydown', event => {
      if (this._switcherOverlay && !this._switcherOverlay.hidden) {
        if (event.key === 'Escape') {
          event.preventDefault();
          this._closeAppSwitcher(false);
        } else if (event.key === 'Enter') {
          event.preventDefault();
          this._closeAppSwitcher(true);
        } else if (event.key === 'Tab') {
          event.preventDefault();
          this._stepAppSwitcher(event.shiftKey ? -1 : 1);
        } else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
          event.preventDefault();
          this._stepAppSwitcher(1);
        } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
          event.preventDefault();
          this._stepAppSwitcher(-1);
        }
        return;
      }
      if (event.ctrlKey && event.shiftKey && !event.altKey && !event.metaKey && event.code === 'Space') {
        if (this._isEditableTarget(event.target)) return;
        event.preventDefault();
        this.showAppSwitcher();
      }
    });

    this._switcherOverlay?.addEventListener('click', event => {
      if (event.target === this._switcherOverlay) this._closeAppSwitcher(false);
    });
    this._switcherOverlay?.querySelector('.wm-switcher-list')?.addEventListener('click', event => {
      const item = event.target.closest('[data-instance-id]');
      if (!item) return;
      this._switcherIndex = this._switcherWindows.indexOf(item.dataset.instanceId);
      this._closeAppSwitcher(true);
    });

    // Sandboxed .beep frames have separate documents. Accept only the switcher
    // signal, and only from one of our own registered app iframes.
    window.addEventListener('message', event => {
      if (event.data?.type !== 'bos:appSwitcher') return;
      const ownedFrame = [...this._windows.values()].some(win => win.iframe?.contentWindow === event.source);
      if (ownedFrame) this.showAppSwitcher();
    });
  }

  _isEditableTarget(target) {
    return !!target?.closest?.('input, textarea, select, [contenteditable=""], [contenteditable="true"], [role="textbox"]');
  }

  showAppSwitcher() {
    const overlay = this._switcherOverlay;
    if (!overlay) return;
    const ids = [...this._focusOrder.filter(id => this._windows.has(id)),
      ...[...this._windows.keys()].filter(id => !this._focusOrder.includes(id))];
    if (!ids.length) return;
    this._switcherWindows = ids;
    this._switcherReturnFocus = document.activeElement;
    const activeIndex = ids.indexOf(this._activeId);
    this._switcherIndex = ids.length > 1 ? (activeIndex + 1 + ids.length) % ids.length : 0;
    overlay.hidden = false;
    this._renderAppSwitcher();
    overlay.querySelector('.wm-switcher-item.selected')?.focus();
  }

  _renderAppSwitcher() {
    const list = this._switcherOverlay?.querySelector('.wm-switcher-list');
    if (!list) return;
    list.replaceChildren();
    this._switcherWindows.forEach((id, index) => {
      const win = this._windows.get(id);
      if (!win) return;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'wm-switcher-item' + (index === this._switcherIndex ? ' selected' : '');
      button.dataset.instanceId = id;
      button.setAttribute('aria-pressed', String(index === this._switcherIndex));
      const icon = document.createElement('span');
      icon.className = 'wm-switcher-icon';
      if (typeof win.icon === 'string' && win.icon.startsWith('data:image/')) {
        const image = document.createElement('img');
        image.src = win.icon;
        image.alt = '';
        icon.appendChild(image);
      } else {
        icon.textContent = win.icon || '🪟';
      }
      const title = document.createElement('span');
      title.className = 'wm-switcher-title';
      title.textContent = win.title || 'App';
      button.append(icon, title);
      const select = () => {
        this._switcherIndex = index;
        list.querySelectorAll('.wm-switcher-item').forEach((item, itemIndex) => {
          const selected = itemIndex === index;
          item.classList.toggle('selected', selected);
          item.setAttribute('aria-pressed', String(selected));
        });
      };
      button.addEventListener('mouseenter', select);
      button.addEventListener('focus', select);
      list.appendChild(button);
    });
  }

  _stepAppSwitcher(direction) {
    const count = this._switcherWindows.length;
    if (!count) return;
    this._switcherIndex = (this._switcherIndex + direction + count) % count;
    this._renderAppSwitcher();
    this._switcherOverlay.querySelector('.wm-switcher-item.selected')?.focus();
  }

  _closeAppSwitcher(activate) {
    if (!this._switcherOverlay || this._switcherOverlay.hidden) return;
    const id = this._switcherWindows[this._switcherIndex];
    this._switcherOverlay.hidden = true;
    this._switcherWindows = [];
    const returnFocus = this._switcherReturnFocus;
    this._switcherReturnFocus = null;
    if (activate && this._windows.has(id)) {
      const win = this._windows.get(id);
      if (win.state.minimized) this.minimize(id);
      this.focus(id);
      win.iframe?.focus();
    } else if (returnFocus?.isConnected) {
      returnFocus.focus();
    }
  }

  _syncTaskbarButtons() {
    const active = this._windows.get(this._activeId);
    const activeVisible = active && !active.state.minimized ? active : null;
    document.querySelectorAll('.wm-taskbar-btn').forEach(btn => {
      const isWindow = btn.dataset.instanceId === this._activeId && !!activeVisible;
      const isPinnedApp = btn.classList.contains('wm-pinned-btn')
        && !!activeVisible?.appId && btn.dataset.appId === activeVisible.appId;
      btn.classList.toggle('active', isWindow || isPinnedApp);
    });
  }

  _syncTaskbarApp(appId) {
    if (!appId) return;
    const pinned = [...document.querySelectorAll('.wm-pinned-btn')]
      .find(btn => btn.dataset.appId === appId);
    if (!pinned) return;
    const running = [...this._windows.values()].some(win => win.appId === appId);
    pinned.classList.toggle('running', running);
    let dot = pinned.querySelector('.wm-running-dot');
    if (running && !dot) {
      dot = document.createElement('span');
      dot.className = 'wm-running-dot';
      pinned.appendChild(dot);
    } else if (!running && dot) {
      dot.remove();
    }
  }

  minimize(instanceId) {
    const w = this._windows.get(instanceId);
    if (!w) return;
    const minimizing = !w.state.minimized;
    w.state.minimized = minimizing;
    if (w.state.animationEnd) {
      w.el.removeEventListener('animationend', w.state.animationEnd);
      w.state.animationEnd = null;
    }
    w.el.classList.remove('wm-window-minimizing', 'wm-window-restoring');

    const reduceMotion = document.documentElement.classList.contains('bos-reduce-motion');
    if (minimizing) {
      if (reduceMotion) {
        w.el.classList.add('minimized');
      } else {
        const finish = event => {
          if (event.target !== w.el) return;
          w.el.removeEventListener('animationend', finish);
          w.state.animationEnd = null;
          w.el.classList.remove('wm-window-minimizing');
          if (w.state.minimized) w.el.classList.add('minimized');
        };
        w.state.animationEnd = finish;
        w.el.addEventListener('animationend', finish);
        w.el.classList.add('wm-window-minimizing');
      }
    } else {
      w.el.classList.remove('minimized');
      if (!reduceMotion) {
        const finish = event => {
          if (event.target !== w.el) return;
          w.el.removeEventListener('animationend', finish);
          w.state.animationEnd = null;
          w.el.classList.remove('wm-window-restoring');
        };
        w.state.animationEnd = finish;
        w.el.addEventListener('animationend', finish);
        w.el.classList.add('wm-window-restoring');
      }
    }
    this._syncTaskbarButtons();
  }

  maximize(instanceId) {
    const w = this._windows.get(instanceId);
    if (!w) return;
    if (!w.state.maximized) {
      w.state.prevRect = {
        left: w.el.style.left, top: w.el.style.top,
        width: w.el.style.width, height: w.el.style.height,
      };
      w.state.maximized = true;
      w.el.classList.add('maximized');
    } else {
      w.state.maximized = false;
      w.el.classList.remove('maximized');
      const r = w.state.prevRect;
      if (r) {
        w.el.style.left   = r.left;
        w.el.style.top    = r.top;
        w.el.style.width  = r.width;
        w.el.style.height = r.height;
      }
    }
  }

  close(instanceId) {
    const w = this._windows.get(instanceId);
    if (!w) return;
    const appId = w.appId;
    w.el.remove();
    this._windows.delete(instanceId);
    this._focusOrder = this._focusOrder.filter(id => id !== instanceId);
    this._switcherWindows = this._switcherWindows.filter(id => id !== instanceId);
    // Remove taskbar button
    const btn = document.querySelector(`.wm-taskbar-btn[data-instance-id="${instanceId}"]`);
    if (btn) btn.remove();
    // Notify kernel
    if (this._kernel) this._kernel.unregisterApp(instanceId);
    // Call onClose callback
    if (w.onClose) w.onClose(instanceId);
    this._syncTaskbarApp(appId);
    this._syncTaskbarButtons();
  }

  // ─── UI methods called by kernel handlers ──────────────────────────────────

  setWindowTitle(instanceId, title) {
    const el = document.getElementById(`wm-title-${instanceId}`);
    if (el) el.textContent = title;
    const btn = document.querySelector(`.wm-taskbar-btn[data-instance-id="${instanceId}"] .wm-tb-label`);
    if (btn) btn.textContent = title;
  }

  setWindowIcon(instanceId, icon) {
    const tb = document.getElementById(`wm-tb-${instanceId}`);
    if (tb) tb.querySelector('.wm-titlebar-icon').textContent = icon;
  }

  setWindowProgress(instanceId, value) {
    const w = this._windows.get(instanceId);
    if (!w) return;
    let bar = w.el.querySelector('.wm-progress');
    if (value < 0) { if (bar) bar.remove(); return; }
    if (!bar) {
      bar = document.createElement('div');
      bar.className = 'wm-progress';
      w.el.querySelector('.wm-titlebar').appendChild(bar);
    }
    bar.style.width = Math.min(100, Math.max(0, value)) + '%';
  }

  notify(message) {
    const container = document.getElementById('wm-toasts');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className   = 'wm-toast';
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
      toast.classList.add('out');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  showCrash(instanceId, error) {
    const body = document.getElementById(`wm-body-${instanceId}`);
    if (!body) return;
    const overlay = document.createElement('div');
    overlay.className = 'wm-crash';
    overlay.innerHTML = `
      <div class="wm-crash-icon">💥</div>
      <div><b>App crashed</b></div>
      <pre>${error.message || error}</pre>
    `;
    body.appendChild(overlay);
  }

  onAppUninstalled(appId) {
    // Notify desktop/shell to update app list
    document.dispatchEvent(new CustomEvent('bos:appUninstalled', { detail: { appId } }));
  }

  startDrag(instanceId, path, name, icon) {
    this.endDrag();
    const ghost = document.createElement('div');
    ghost.id = 'bos-drag-ghost';
    ghost.style.cssText = 'position:fixed;pointer-events:none;z-index:99999;display:flex;flex-direction:column;align-items:center;gap:4px;opacity:0.85;transform:translate(-50%,-50%)';
    ghost.innerHTML = '<span style="font-size:28px">' + (icon || '📄') + '</span>' +
      '<span style="font-size:11px;color:#fff;text-shadow:0 1px 3px #000;background:rgba(0,0,0,0.5);padding:2px 6px;border-radius:4px">' + (name || '') + '</span>';
    document.body.appendChild(ghost);
    this._dragState = { path, name, instanceId };
    ghost.style.left = '50%';
    ghost.style.top  = '50%';

    // Disable pointer events on ALL iframes so parent page gets mouse events
    document.querySelectorAll('.wm-iframe').forEach(f => {
      f._prevPointerEvents = f.style.pointerEvents;
      f.style.pointerEvents = 'none';
    });

    const onMove = e => {
      ghost.style.left = e.clientX + 'px';
      ghost.style.top  = e.clientY + 'px';
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const overWindow = el?.closest('.wm-window');
      const overFileManager = el?.closest('.bos-fm-dropzone');
      const targetInstanceId = overFileManager
        ? overFileManager.closest('.wm-window')?.id.replace(/^wm-win-/, '')
        : null;
      const desktop = document.getElementById('wm-desktop');
      if (desktop) desktop.style.outline = overWindow ? '' : '2px dashed var(--wm-accent)';
      if (this._dragState) {
        this._dragState.lastX = e.clientX;
        this._dragState.lastY = e.clientY;
        this._dragState.overDesktop = !overWindow;
        this._dragState.overFileManager = !!overFileManager;
        this._dragState.targetInstanceId = targetInstanceId;
      }
    };

    const onUp = e => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup',   onUp);
      // Re-enable pointer events on iframes
      document.querySelectorAll('.wm-iframe').forEach(f => {
        f.style.pointerEvents = f._prevPointerEvents || '';
      });
      const desktop = document.getElementById('wm-desktop');
      if (desktop) desktop.style.outline = '';
      if (this._dragState?.overFileManager && this._dragState.targetInstanceId) {
        document.dispatchEvent(new CustomEvent('bos:dropOnFM', {
          detail: {
            path: this._dragState.path,
            name: this._dragState.name,
            x: e.clientX,
            y: e.clientY,
            targetInstanceId: this._dragState.targetInstanceId,
          }
        }));
      } else if (this._dragState?.overDesktop) {
        document.dispatchEvent(new CustomEvent('bos:dropOnDesktop', {
          detail: { path: this._dragState.path, name: this._dragState.name, x: e.clientX, y: e.clientY }
        }));
      }
      this.endDrag();
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onUp);
  }

  moveDragGhost(x, y) {
    // No-op — parent page now handles mouse events directly
  }

  endDrag(fireEvent) {
    document.getElementById('bos-drag-ghost')?.remove();
    document.getElementById('wm-desktop').style.outline = '';
    this._dragState = null;
  }

  // ─── Taskbar ───────────────────────────────────────────────────────────────

  _addTaskbarBtn(instanceId, title, icon, appId) {
    const pinned = [...document.querySelectorAll('.wm-pinned-btn')]
      .find(btn => btn.dataset.appId === appId);
    if (pinned) {
      this._syncTaskbarApp(appId);
      this._syncTaskbarButtons();
      return;
    }
    const existing = document.querySelector(`.wm-taskbar-btn[data-instance-id="${instanceId}"]`);
    if (existing) return;
    const btn = document.createElement('button');
    btn.className = 'wm-taskbar-btn active';
    btn.dataset.instanceId = instanceId;
    if (appId) btn.dataset.appId = appId;
    btn.innerHTML = `
      <span>${icon || '🪟'}</span>
      <span class="wm-tb-label">${title || 'App'}</span>
      <span class="wm-running-dot"></span>
    `;
    btn.onclick = () => {
      const w = this._windows.get(instanceId);
      if (!w) return;
      if (w.state.minimized)        { this.minimize(instanceId); this.focus(instanceId); }
      else if (this._activeId === instanceId) { this.minimize(instanceId); }
      else                           { this.focus(instanceId); }
    };
    document.getElementById('wm-taskbar-apps').appendChild(btn);
    this._syncTaskbarButtons();
  }

  // ─── Drag & resize ─────────────────────────────────────────────────────────

  _makeDraggable(win, handle, instanceId) {
    let slideFrame = null;
    const stopSlide = () => {
      if (slideFrame !== null) cancelAnimationFrame(slideFrame);
      slideFrame = null;
      win.classList.remove('wm-window-ice-sliding');
    };

    const startSlide = (velocityX, velocityY) => {
      const desktop = document.getElementById('wm-desktop');
      if (!desktop) return;
      const maxX = Math.max(0, desktop.clientWidth - win.offsetWidth);
      const maxY = Math.max(0, desktop.clientHeight - win.offsetHeight);
      let left = Math.max(0, Math.min(maxX, parseFloat(win.style.left) || 0));
      let top = Math.max(0, Math.min(maxY, parseFloat(win.style.top) || 0));
      let vx = Math.max(-1.4, Math.min(1.4, velocityX));
      let vy = Math.max(-1.4, Math.min(1.4, velocityY));
      let previousTime = 0;
      const bounce = 0.72;

      if (Math.hypot(vx, vy) < 0.035) return;
      win.classList.add('wm-window-ice-sliding');

      const frame = time => {
        if (!win.isConnected || win.classList.contains('minimized') ||
            win.classList.contains('maximized') ||
            this._settings?.get('iceMode') !== true ||
            this._settings?.get('reduceMotion') === true) {
          stopSlide();
          return;
        }
        const dt = Math.min(32, previousTime ? time - previousTime : 16);
        previousTime = time;
        left += vx * dt;
        top += vy * dt;

        if (left < 0) { left = 0; vx = Math.abs(vx) * bounce; }
        else if (left > maxX) { left = maxX; vx = -Math.abs(vx) * bounce; }
        if (top < 0) { top = 0; vy = Math.abs(vy) * bounce; }
        else if (top > maxY) { top = maxY; vy = -Math.abs(vy) * bounce; }

        const friction = Math.exp(-0.0022 * dt);
        vx *= friction;
        vy *= friction;
        win.style.left = left + 'px';
        win.style.top = top + 'px';

        if (Math.hypot(vx, vy) < 0.018) {
          stopSlide();
          return;
        }
        slideFrame = requestAnimationFrame(frame);
      };
      slideFrame = requestAnimationFrame(frame);
    };

    handle.addEventListener('mousedown', e => {
      if (e.target.closest('.wm-titlebar-btns')) return;
      const w = this._windows.get(instanceId);
      if (w?.state.maximized) return;
      stopSlide();
      const desktop = document.getElementById('wm-desktop');
      const iceMode = this._settings?.get('iceMode') === true &&
        this._settings?.get('reduceMotion') !== true;
      win.classList.add('wm-window-dragging');
      if (iceMode) win.classList.add('wm-window-ice-dragging');
      const sx = e.clientX, sy = e.clientY;
      const sl = parseInt(win.style.left) || 0;
      const st = parseInt(win.style.top)  || 0;
      const maxX = Math.max(0, (desktop?.clientWidth || window.innerWidth) - win.offsetWidth);
      const maxY = Math.max(0, (desktop?.clientHeight || window.innerHeight) - win.offsetHeight);
      let lastX = sx, lastY = sy, lastTime = performance.now();
      let velocityX = 0, velocityY = 0;

      const onMove = e2 => {
        const now = performance.now();
        const sampleTime = Math.max(1, now - lastTime);
        const sampleX = (e2.clientX - lastX) / sampleTime;
        const sampleY = (e2.clientY - lastY) / sampleTime;
        velocityX = velocityX * 0.35 + sampleX * 0.65;
        velocityY = velocityY * 0.35 + sampleY * 0.65;
        lastX = e2.clientX;
        lastY = e2.clientY;
        lastTime = now;

        const nextLeft = sl + e2.clientX - sx;
        const nextTop = st + e2.clientY - sy;
        win.style.left = (iceMode ? Math.max(0, Math.min(maxX, nextLeft)) : Math.max(0, nextLeft)) + 'px';
        win.style.top = (iceMode ? Math.max(0, Math.min(maxY, nextTop)) : Math.max(0, nextTop)) + 'px';
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        win.classList.remove('wm-window-dragging', 'wm-window-ice-dragging');
        if (iceMode && this._settings?.get('iceMode') === true &&
            this._settings?.get('reduceMotion') !== true) {
          const releaseDamping = Math.exp(-0.0022 * Math.max(0, performance.now() - lastTime));
          startSlide(velocityX * releaseDamping * 1.15, velocityY * releaseDamping * 1.15);
        }
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      e.preventDefault();
    });
  }

  _makeResizable(win, handle) {
    // Remove the old single handle — we use edge/corner detection instead
    handle?.remove();

    const EDGE = 14; // px from edge that counts as resize zone
    const MIN_W = 280, MIN_H = 200;

    // Cursor style based on which edges are active
    const CURSORS = {
      n:'n-resize', s:'s-resize', e:'e-resize', w:'w-resize',
      ne:'ne-resize', nw:'nw-resize', se:'se-resize', sw:'sw-resize',
    };

    function getEdges(e) {
      const r   = win.getBoundingClientRect();
      const x   = e.clientX, y = e.clientY;
      const top = y - r.top < EDGE;
      const bot = r.bottom - y < EDGE;
      const lft = x - r.left < EDGE;
      const rgt = r.right - x < EDGE;
      const n = top && !lft && !rgt;
      const s = bot && !lft && !rgt;
      const e_ = rgt && !top && !bot;
      const w = lft && !top && !bot;
      const ne = top && rgt;
      const nw = top && lft;
      const se = bot && rgt;
      const sw = bot && lft;
      if (ne) return 'ne'; if (nw) return 'nw';
      if (se) return 'se'; if (sw) return 'sw';
      if (n) return 'n'; if (s) return 's';
      if (e_) return 'e'; if (w) return 'w';
      return null;
    }

    win.addEventListener('mousemove', e => {
      if (win.classList.contains('maximized')) { win.style.cursor = ''; return; }
      const edge = getEdges(e);
      win.style.cursor = edge ? CURSORS[edge] : '';
      // Don't show resize cursor over titlebar buttons or inside content
      if (e.target.closest('.wm-titlebar-btns') || e.target.closest('.wm-body')) {
        win.style.cursor = '';
      }
    });

    win.addEventListener('mouseleave', () => { win.style.cursor = ''; });

    win.addEventListener('mousedown', e => {
      if (win.classList.contains('maximized')) return;
      if (e.target.closest('.wm-titlebar') || e.target.closest('.wm-body')) return;
      const edge = getEdges(e);
      if (!edge) return;
      e.preventDefault();
      e.stopPropagation();

      const startX = e.clientX, startY = e.clientY;
      const startW = win.offsetWidth,  startH = win.offsetHeight;
      const startL = parseInt(win.style.left) || 0;
      const startT = parseInt(win.style.top)  || 0;

      // Disable iframe pointer events during resize
      document.querySelectorAll('.wm-iframe').forEach(f => {
        f._rpe = f.style.pointerEvents;
        f.style.pointerEvents = 'none';
      });
      document.body.style.userSelect = 'none';
      document.body.style.cursor = CURSORS[edge];

      const onMove = e2 => {
        const dx = e2.clientX - startX;
        const dy = e2.clientY - startY;
        let newW = startW, newH = startH, newL = startL, newT = startT;

        if (edge.includes('e')) newW = Math.max(MIN_W, startW + dx);
        if (edge.includes('s')) newH = Math.max(MIN_H, startH + dy);
        if (edge.includes('w')) {
          newW = Math.max(MIN_W, startW - dx);
          newL = startL + (startW - newW);
        }
        if (edge.includes('n')) {
          newH = Math.max(MIN_H, startH - dy);
          newT = startT + (startH - newH);
        }

        win.style.width  = newW + 'px';
        win.style.height = newH + 'px';
        win.style.left   = newL + 'px';
        win.style.top    = newT + 'px';
      };

      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup',   onUp);
        document.querySelectorAll('.wm-iframe').forEach(f => {
          f.style.pointerEvents = f._rpe || '';
        });
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup',   onUp);
    });
  }

  // ─── Theme ─────────────────────────────────────────────────────────────────

  applyTheme({ accent, font, darkMode, wallpaper, transparency }) {
    const r = document.documentElement;
    if (accent)    r.style.setProperty('--wm-accent', accent);
    if (font)      r.style.setProperty('--wm-font',   font);
    if (wallpaper) {
      const revision = ++this._wallpaperRevision;
      if (wallpaper.startsWith('fs:') && this._fs) {
        const path = wallpaper.slice(3);
        (async () => {
          const [content, stat] = await Promise.all([this._fs.read(path), this._fs.stat(path)]);
          if (content == null || !stat || !stat.mime?.startsWith('image/')) return null;
          if (content.toLowerCase().startsWith('data:image/')) return content;
          if (stat.mime === 'image/svg+xml' && stat.encoding !== 'base64') {
            return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(content);
          }
          return 'data:' + stat.mime + ';base64,' + content.replaceAll(' ', '').replaceAll('\n', '').replaceAll('\r', '');
        })().then(dataUrl => {
          if (revision !== this._wallpaperRevision) return;
          if (!dataUrl) { r.style.removeProperty('--wm-wallpaper'); return; }
          r.style.setProperty('--wm-wallpaper', 'url("' + dataUrl + '") center center / cover no-repeat fixed');
        }).catch(() => {
          if (revision === this._wallpaperRevision) r.style.removeProperty('--wm-wallpaper');
        });
      } else {
        r.style.setProperty('--wm-wallpaper', wallpaper);
      }
    }
    if (darkMode !== undefined) {
      r.style.setProperty('--wm-bg',           darkMode ? '#1e1e2e' : '#f0f0f5');
      r.style.setProperty('--wm-titlebar',      darkMode ? '#2a2a4a' : '#e0e0f0');
      r.style.setProperty('--wm-titlebar-bg',  darkMode ? (transparency === false ? '#2a2a4a' : 'rgba(42,42,74,0.58)') : (transparency === false ? '#e0e0f0' : 'rgba(224,224,240,0.62)'));
      r.style.setProperty('--wm-window-bg', transparency === false ? (darkMode ? '#1e1e2e' : '#f0f0f5') : 'transparent');
      r.style.setProperty('--wm-titlebar-txt',  darkMode ? '#e0e0ff' : '#111');
      r.style.setProperty('--wm-text',          darkMode ? '#e0e0ff' : '#111');
      r.style.setProperty('--wm-text-dim',      darkMode ? '#8888aa' : '#666');
      r.style.setProperty('--wm-border',        transparency === false ? (darkMode ? '#3a3a5c' : '#ccc') : (darkMode ? 'rgba(255,255,255,0.24)' : 'rgba(0,0,0,0.2)'));
      r.style.setProperty('--wm-hover',         darkMode ? '#2d2d4e' : '#ddd');
      r.style.setProperty('--wm-taskbar-bg',   darkMode ? (transparency === false ? '#0f0c28' : 'rgba(15,12,40,0.58)') : (transparency === false ? '#ebebf5' : 'rgba(235,235,245,0.62)'));
      r.style.setProperty('--wm-panel-bg',     darkMode ? (transparency === false ? '#141428' : 'rgba(20,20,40,0.58)') : (transparency === false ? '#fafaff' : 'rgba(250,250,255,0.64)'));
      r.style.setProperty('--wm-panel-border', darkMode ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.14)');
      r.style.setProperty('--wm-control-bg',   darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)');
      r.style.setProperty('--wm-control-border', darkMode ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.15)');
      r.style.setProperty('--wm-control-hover', darkMode ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.08)');
      r.style.setProperty('--wm-separator',    darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.12)');
      r.style.setProperty('--wm-backdrop-filter', transparency === false ? 'none' : 'blur(24px)');
    }
  }

  // ─── Kernel reference (set after kernel boots) ─────────────────────────────

  setKernel(kernel) {
    this._kernel = kernel;
  }
}
