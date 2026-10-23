/** Trusted native app widgets. Sandboxed .beep code never runs in the desktop. */
function el(tag, text, className) {
  const node = document.createElement(tag);
  if (text != null) node.textContent = text;
  if (className) node.className = className;
  return node;
}

// One outstanding refresh per widget, paused while the page is hidden.
function live(container, refresh, milliseconds) {
  let closed = false, busy = false;
  const update = async () => {
    if (closed || busy || document.hidden) return;
    busy = true;
    try { await refresh(() => closed); }
    catch (_) { if (!closed) container.textContent = 'Information is temporarily unavailable.'; }
    finally { busy = false; }
  };
  update();
  const timer = setInterval(update, milliseconds);
  document.addEventListener('visibilitychange', update);
  return () => { closed = true; clearInterval(timer); document.removeEventListener('visibilitychange', update); };
}

function dateKey(date) {
  return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
}

export const clockWidget = {
  id: 'clock', title: 'Clock', description: 'Local time, date, and a live clock.', height: 196,
  mount(container) {
    const time = el('div', '', 'bos-widget-time');
    const date = el('div', '', 'bos-widget-muted');
    container.append(time, date);
    return live(container, () => {
      const now = new Date();
      time.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      date.textContent = now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
    }, 1000);
  },
};

export const calendarWidget = {
  id: 'agenda', title: 'Calendar', description: 'Today and upcoming events from your Calendar.', height: 276,
  mount(container, { db, wm }) {
    return live(container, async closed => {
      const events = await db.settings.get('calendarEvents') || {};
      if (closed()) return;
      container.replaceChildren();
      const today = dateKey(new Date());
      const upcoming = Object.keys(events).filter(key => /^\d{4}-\d{2}-\d{2}$/.test(key) && key >= today).sort();
      let count = 0;
      for (const key of upcoming) {
        for (const event of Array.isArray(events[key]) ? events[key] : []) {
          if (count++ >= 3) break;
          const button = el('button', '', 'bos-widget-event');
          button.type = 'button';
          button.append(el('small', key === today ? 'Today' : new Date(key + 'T12:00:00').toLocaleDateString([], { month: 'short', day: 'numeric' }), 'bos-widget-muted'), el('span', String(event.title || 'Untitled event')));
          button.onclick = () => wm.openSystemApp('calendar', { date: key });
          container.append(button);
        }
        if (count >= 3) break;
      }
      if (!count) container.append(el('p', 'No upcoming events. Open Calendar to add one.', 'bos-widget-muted'));
    }, 5000);
  },
};

export const filesWidget = {
  id: 'recent', title: 'Recent files', description: 'Quick access to recently changed files.', height: 276,
  mount(container, { fs, fileAssociations }) {
    return live(container, async closed => {
      const files = (await fs.recent(30)).filter(file => file.type === 'file' && !file.path.split('/').some(part => part.startsWith('.')) && !file.path.startsWith('/Apps/') && !file.path.endsWith('.beep')).slice(0, 4);
      if (closed()) return;
      container.replaceChildren();
      if (!files.length) container.append(el('p', 'Your recently changed files will appear here.', 'bos-widget-muted'));
      for (const file of files) {
        const name = file.path.split('/').pop();
        const button = el('button', name, 'bos-widget-file');
        button.type = 'button';
        button.title = file.path;
        button.onclick = () => fileAssociations.open(file.path, name);
        container.append(button);
      }
    }, 10000);
  },
};

export const systemWidget = {
  id: 'status', title: 'System Monitor', description: 'Open windows and browser storage usage.', height: 218,
  mount(container, { wm }) {
    return live(container, async closed => {
      const estimate = navigator.storage?.estimate ? await navigator.storage.estimate() : null;
      if (closed()) return;
      const count = wm.getOpenWindowCount();
      container.replaceChildren(el('div', String(count), 'bos-widget-time'), el('div', count === 1 ? 'open window' : 'open windows', 'bos-widget-muted'));
      if (estimate && Number.isFinite(estimate.usage)) {
        const used = (estimate.usage / 1024 / 1024).toFixed(1);
        container.append(el('div', used + ' MB browser storage used', 'bos-widget-muted'));
      }
    }, 5000);
  },
};

export function availableWidgets(wm) {
  return wm.getSystemApps().flatMap(app => (app.widgets || [])
    .filter(widget => /^[a-z0-9-]+$/i.test(widget.id) && typeof widget.mount === 'function')
    .map(widget => ({ ...widget, id: app.id + ':' + widget.id, appId: app.id, icon: app.icon })));
}

export async function setWidgetEnabled(settings, id, enabled) {
  const current = settings.get('desktopWidgets');
  const layout = Array.isArray(current) ? current : [];
  const next = layout.filter(item => item && item.id !== id);
  if (enabled && next.length < 12) next.push(layout.find(item => item.id === id) || { id, x: null, y: null });
  await settings.set('desktopWidgets', next);
}

const STYLES = `
  #bos-widget-layer { position:absolute; inset:0; pointer-events:none; z-index:0; }
  .bos-desktop-icon { z-index:1; }
  .bos-widget { position:absolute; pointer-events:auto; display:flex; flex-direction:column; color:var(--wm-text); background:var(--wm-panel-bg); border:1px solid var(--wm-panel-border); border-radius:16px; box-shadow:0 10px 35px rgba(0,0,0,.2); backdrop-filter:var(--wm-backdrop-filter); overflow:hidden; font:13px var(--wm-font); }
  .bos-widget-header { display:flex; align-items:center; gap:4px; padding:9px 10px; border-bottom:1px solid var(--wm-separator); }
  .bos-widget button, #bos-widget-gallery button { font:inherit; color:inherit; cursor:pointer; }
  .bos-widget-header button { background:transparent; border:0; border-radius:5px; padding:5px; }
  .bos-widget-header button:hover { background:var(--wm-control-hover); }
  .bos-widget-title { flex:1; text-align:left; font-weight:600!important; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .bos-widget-grip { cursor:grab!important; touch-action:none; }
  .bos-widget-grip:active { cursor:grabbing!important; }
  .bos-widget-body { padding:16px; flex:1; min-height:0; overflow:auto; display:flex; flex-direction:column; gap:8px; }
  .bos-widget-time { font-size:40px; font-weight:300; line-height:1.2; letter-spacing:-1.5px; font-variant-numeric:tabular-nums; }
  .bos-widget-muted { color:var(--wm-text-dim); font-size:12px; line-height:1.5; }
  .bos-widget-event,.bos-widget-file { background:var(--wm-control-bg); border:1px solid var(--wm-control-border); border-radius:7px; text-align:left; padding:8px; flex-shrink:0; }
  .bos-widget-event { display:flex; flex-direction:column; gap:3px; }
  .bos-widget-event span,.bos-widget-file { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .bos-widget button:focus-visible,#bos-widget-gallery button:focus-visible { outline:2px solid var(--wm-accent); outline-offset:2px; }
  #bos-widget-gallery { position:fixed; inset:0; z-index:200000; display:grid; place-items:center; padding:20px; background:rgba(4,10,20,.55); font:14px var(--wm-font); color:var(--wm-text); }
  #bos-widget-gallery section { width:min(660px,100%); max-height:85vh; overflow:auto; padding:24px; background:var(--wm-panel-bg); backdrop-filter:var(--wm-backdrop-filter); border:1px solid var(--wm-panel-border); border-radius:18px; box-shadow:0 20px 70px rgba(0,0,0,.35); }
  .bos-widget-gallery-list { display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:12px; margin:18px 0; }
  .bos-widget-option { padding:16px; display:flex; flex-direction:column; gap:10px; border:1px solid var(--wm-control-border); border-radius:12px; background:var(--wm-control-bg); }
  .bos-widget-action { border:1px solid var(--wm-control-border); border-radius:7px; padding:8px 12px; background:var(--wm-control-bg); }
`;

export class DesktopWidgets {
  constructor(context) {
    this.context = context;
    this.cards = new Map();
    this.controller = new AbortController();
    this.onSettings = (_theme, key) => { if (key == null || key === 'desktopWidgets') this.render(); };
  }

  boot() {
    const style = el('style', STYLES);
    style.id = 'bos-widget-styles';
    document.head.append(style);
    this.style = style;
    this.layer = el('div');
    this.layer.id = 'bos-widget-layer';
    document.getElementById('wm-desktop').append(this.layer);
    const options = { signal: this.controller.signal };
    document.addEventListener('bos:showWidgets', () => this.showGallery(), options);
    this.layer.addEventListener('contextmenu', event => { event.preventDefault(); event.stopPropagation(); }, options);
    window.addEventListener('resize', () => this.render(), options);
    this.context.settings.onChange(this.onSettings);
    this.render();
  }

  layout() {
    const value = this.context.settings.get('desktopWidgets');
    return Array.isArray(value) ? value.filter(item => item && typeof item.id === 'string').slice(0, 12) : [];
  }

  position(record, index, card) {
    const bounds = { width: this.layer.clientWidth, height: this.layer.clientHeight };
    card.style.width = Math.min(284, Math.max(160, bounds.width - 32)) + 'px';
    card.style.height = Math.min(card._height, Math.max(100, bounds.height - 32)) + 'px';
    const maxX = Math.max(0, bounds.width - card.offsetWidth - 16);
    const maxY = Math.max(0, bounds.height - card.offsetHeight - 16);
    const x = Number.isFinite(record.x) ? Math.min(1, Math.max(0, record.x)) : 1;
    const rows = Math.max(1, Math.floor((bounds.height - 32) / 292));
    const defaultY = maxY > 16 ? Math.min(maxY - 16, (index % rows) * 292) / (maxY - 16) : 0;
    const y = Number.isFinite(record.y) ? Math.min(1, Math.max(0, record.y)) : defaultY;
    const columnOffset = record.x == null ? Math.floor(index / rows) * 300 : 0;
    card.style.left = Math.max(16, Math.round(16 + x * Math.max(0, maxX - 16) - columnOffset)) + 'px';
    card.style.top = Math.round(16 + y * Math.max(0, maxY - 16)) + 'px';
  }

  render() {
    const definitions = availableWidgets(this.context.wm);
    const layout = this.layout();
    const active = new Set(layout.map(item => item.id));
    for (const [id, entry] of this.cards) {
      if (!active.has(id) || !definitions.some(def => def.id === id)) {
        entry.cleanup(); entry.card.remove(); this.cards.delete(id);
      }
    }
    layout.forEach((record, index) => {
      const definition = definitions.find(item => item.id === record.id);
      if (!definition) return;
      if (!this.cards.has(record.id)) this.createCard(definition);
      this.position(record, index, this.cards.get(record.id).card);
    });
  }

  createCard(definition) {
    const card = el('article', null, 'bos-widget');
    card.dataset.widget = definition.id;
    card.setAttribute('aria-label', definition.title + ' widget');
    card._height = definition.height || 240;
    const header = el('div', null, 'bos-widget-header');
    const grip = el('button', '⠿', 'bos-widget-grip');
    grip.type = 'button';
    grip.setAttribute('aria-label', 'Move ' + definition.title + ' widget. Drag or use arrow keys.');
    const title = el('button', definition.icon + ' ' + definition.title + ' ↗', 'bos-widget-title');
    title.type = 'button';
    title.title = 'Open ' + definition.title;
    title.onclick = () => this.context.wm.openSystemApp(definition.appId);
    const remove = el('button', '×');
    remove.type = 'button';
    remove.setAttribute('aria-label', 'Remove ' + definition.title + ' widget');
    remove.onclick = () => setWidgetEnabled(this.context.settings, definition.id, false).catch(() => this.context.wm.notify('Could not save widget layout'));
    header.append(grip, title, remove);
    const body = el('div', null, 'bos-widget-body');
    card.append(header, body);
    this.layer.append(card);
    let dispose = () => {};
    try { dispose = definition.mount(body, this.context) || dispose; }
    catch (_) { body.textContent = 'This widget could not be loaded.'; }
    const stopDrag = this.enableDrag(card, grip, definition.id);
    this.cards.set(definition.id, { card, cleanup: () => { stopDrag(); if (typeof dispose === 'function') dispose(); } });
  }

  enableDrag(card, grip, id) {
    const controller = new AbortController();
    const options = { signal: controller.signal };
    let drag = null;
    const move = (left, top) => {
      card.style.left = Math.min(Math.max(16, left), Math.max(16, this.layer.clientWidth - card.offsetWidth - 16)) + 'px';
      card.style.top = Math.min(Math.max(16, top), Math.max(16, this.layer.clientHeight - card.offsetHeight - 16)) + 'px';
    };
    const save = () => {
      const maxX = Math.max(0, this.layer.clientWidth - card.offsetWidth - 32);
      const maxY = Math.max(0, this.layer.clientHeight - card.offsetHeight - 32);
      const x = maxX ? (parseFloat(card.style.left) - 16) / maxX : 0;
      const y = maxY ? (parseFloat(card.style.top) - 16) / maxY : 0;
      const layout = this.layout().map(item => item.id === id ? { id, x, y } : item);
      this.context.settings.set('desktopWidgets', layout).catch(() => this.context.wm.notify('Could not save widget layout'));
    };
    grip.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      event.preventDefault(); event.stopPropagation();
      // offsetX/Y on the card's parent coordinate system also respect interface zoom.
      const bounds = this.layer.getBoundingClientRect();
      const scale = bounds.width / this.layer.clientWidth || 1;
      drag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, left: parseFloat(card.style.left), top: parseFloat(card.style.top), scale };
      grip.setPointerCapture(event.pointerId);
    }, options);
    grip.addEventListener('pointermove', event => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      move(drag.left + (event.clientX - drag.x) / drag.scale, drag.top + (event.clientY - drag.y) / drag.scale);
    }, options);
    const finish = event => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      drag = null;
      if (grip.hasPointerCapture(event.pointerId)) grip.releasePointerCapture(event.pointerId);
      save();
    };
    grip.addEventListener('pointerup', finish, options);
    grip.addEventListener('pointercancel', finish, options);
    grip.addEventListener('lostpointercapture', finish, options);
    grip.addEventListener('keydown', event => {
      const direction = { ArrowLeft: [-16,0], ArrowRight: [16,0], ArrowUp: [0,-16], ArrowDown: [0,16] }[event.key];
      if (!direction) return;
      event.preventDefault(); event.stopPropagation();
      move(parseFloat(card.style.left) + direction[0], parseFloat(card.style.top) + direction[1]); save();
    }, options);
    return () => controller.abort();
  }

  showGallery() {
    if (document.getElementById('bos-widget-gallery')) return;
    const previousFocus = document.activeElement;
    const overlay = el('div'); overlay.id = 'bos-widget-gallery';
    const panel = el('section'); panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); panel.setAttribute('aria-labelledby', 'bos-widget-gallery-title');
    const heading = el('h2', 'Desktop widgets'); heading.id = 'bos-widget-gallery-title';
    panel.append(heading, el('p', 'Live information from compatible apps. Drag the grip to move a widget.', 'bos-widget-muted'));
    const list = el('div', null, 'bos-widget-gallery-list');
    for (const definition of availableWidgets(this.context.wm)) {
      const option = el('div', null, 'bos-widget-option');
      option.append(el('strong', definition.icon + ' ' + definition.title), el('p', definition.description, 'bos-widget-muted'));
      const added = this.layout().some(item => item.id === definition.id);
      const button = el('button', added ? 'Remove widget' : 'Add widget', 'bos-widget-action');
      button.type = 'button';
      button.onclick = async () => {
        button.disabled = true;
        try {
          const enabled = this.layout().some(item => item.id === definition.id);
          await setWidgetEnabled(this.context.settings, definition.id, !enabled);
          button.textContent = enabled ? 'Add widget' : 'Remove widget';
        } catch (_) { this.context.wm.notify('Could not save widget layout'); }
        finally { button.disabled = false; }
      };
      option.append(button); list.append(option);
    }
    const close = el('button', 'Done', 'bos-widget-action'); close.type = 'button';
    const finish = () => { overlay.remove(); document.removeEventListener('keydown', onKey); previousFocus?.focus(); this.closeGallery = null; };
    const onKey = event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); finish(); }
      if (event.key === 'Tab') {
        const buttons = [...panel.querySelectorAll('button:not(:disabled)')];
        const first = buttons[0], last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    close.onclick = finish;
    overlay.onclick = event => { if (event.target === overlay) finish(); };
    document.addEventListener('keydown', onKey);
    panel.append(list, close); overlay.append(panel); document.body.append(overlay);
    this.closeGallery = finish;
    panel.querySelector('button').focus();
  }

  destroy() {
    this.closeGallery?.();
    this.controller.abort();
    this.context.settings.offChange(this.onSettings);
    for (const entry of this.cards.values()) entry.cleanup();
    this.cards.clear(); this.layer.remove(); this.style.remove();
  }
}

