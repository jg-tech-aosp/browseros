/**
 * BrowserOS — Taskbar
 * src/shell/taskbar.js
 *
 * Manages the taskbar:
 * - Pinned apps (with running indicators)
 * - Active window buttons
 * - System tray (clock, notifications bell, quick settings)
 * - Notification center panel
 */

export class Taskbar {
  constructor({ wm, db, launcher, settings, kernel }) {
    this._wm       = wm;
    this._db       = db;
    this._launcher = launcher;
    this._settings = settings;
    this._kernel   = kernel;
    this._notifications = []; // history
    this._unread        = 0;
    this._previewTimer = null;
    this._previewHideTimer = null;
    this._previewEl = null;
  }

  async boot() {
    this._buildTray();
    await this.refreshPinnedApps();

    const taskbarApps = document.getElementById('wm-taskbar-apps');
    this._bindTaskbarPreviewButtons(taskbarApps);
    this._previewObserver = new MutationObserver(records => {
      for (const record of records) {
        for (const node of record.addedNodes) this._bindTaskbarPreviewButtons(node);
      }
    });
    if (taskbarApps) this._previewObserver.observe(taskbarApps, { childList: true });

    taskbarApps?.addEventListener('contextmenu', async event => {
      const button = event.target.closest('.wm-taskbar-btn');
      if (!button || button.classList.contains('wm-pinned-btn') || !button.dataset.appId) return;
      event.preventDefault();
      const app = (await this._db.apps.all()).find(item => item.id === button.dataset.appId)
        || (this._wm._systemApps.has(button.dataset.appId)
          ? { id: button.dataset.appId, name: this._wm._systemApps.get(button.dataset.appId).title }
          : null);
      if (app) this._showPinnedMenu(event.clientX, event.clientY, app, button);
    });

    // Listen for notification events from WM
    document.addEventListener('bos:notify', e => {
      this._addNotification(e.detail.message);
    });
    console.log('[taskbar] Booted');
  }

  // ─── Pinned apps ───────────────────────────────────────────────────────────

  async refreshPinnedApps() {
    const pinned  = this._settings.get('pinnedApps') || [];
    const allApps = await this._db.apps.all();
    const container = document.getElementById('wm-taskbar-apps');
    if (!container) return;

    container.querySelectorAll('.wm-pinned-btn').forEach(b => b.remove());

    const pinnedIds = new Set(pinned);
    for (const [instanceId, win] of this._wm._windows) {
      if (win.appId && pinnedIds.has(win.appId)) {
        container.querySelectorAll('.wm-taskbar-btn[data-instance-id]').forEach(button => {
          if (button.dataset.instanceId === instanceId) button.remove();
        });
      } else {
        this._wm._addTaskbarBtn(instanceId, win.title, win.icon, win.appId);
      }
    }

    for (const appId of pinned) {
      // Check DB first, then fall back to native system app
      let app = allApps.find(a => a.id === appId);
      if (!app) {
        const sysApp = this._wm._systemApps.get(appId);
        if (sysApp) app = { id: appId, name: sysApp.title, icon: null, emoji: sysApp.icon };
      }
      if (!app) continue;
      const btn = this._makePinnedBtn(app);
      const firstWin = container.querySelector('.wm-taskbar-btn:not(.wm-pinned-btn)');
      container.insertBefore(btn, firstWin || null);
    }
    this._wm._syncTaskbarButtons();
  }

  _makePinnedBtn(app) {
    const btn = document.createElement('button');
    btn.className = 'wm-taskbar-btn wm-pinned-btn';
    btn.dataset.appId = app.id;
    btn.title  = app.name;
    btn.innerHTML = `
      <span>${app.icon || app.emoji || '⚡'}</span>
      <span class="wm-tb-label">${app.name}</span>
    `;

    // Show a running indicator when one or more windows belong to this app.
    this._updateRunningDot(btn, app.id);
    if (this._wm._windows.get(this._wm._activeId)?.appId === app.id) btn.classList.add('active');

    btn.onclick = async () => {
      const running = this._runningWindows(app.id);
      if (running.length === 0) {
        try {
          // Check if it's a native system app first
          if (this._wm._systemApps.has(app.id)) {
            this._wm.openSystemApp(app.id);
          } else {
            await this._launcher.launchById(app.id);
          }
        } catch(e) { this._wm.notify('Failed to launch: ' + e.message); }
      } else if (running.length === 1) {
        // Toggle minimize/focus
        const id = running[0].instanceId;
        const w  = this._wm._windows.get(id);
        if (!w) return;
        if (w.state.minimized)               { this._wm.minimize(id); this._wm.focus(id); }
        else if (this._wm._activeId === id)  { this._wm.minimize(id); }
        else                                  { this._wm.focus(id); }
      } else {
        // Cycle through this app's windows, restoring a minimized one as needed.
        const current = running.findIndex(win => win.instanceId === this._wm._activeId);
        const next = running[(current + 1) % running.length];
        if (next.state.minimized) this._wm.minimize(next.instanceId);
        this._wm.focus(next.instanceId);
      }
    };

    btn.addEventListener('contextmenu', e => {
      e.preventDefault();
      this._showPinnedMenu(e.clientX, e.clientY, app, btn);
    });

    return btn;
  }

  _runningWindows(appId) {
    return [...this._wm._windows.entries()]
      .filter(([, win]) => win.appId === appId)
      .map(([instanceId, win]) => ({ ...win, instanceId }));
  }

  _updateRunningDot(btn, appId) {
    btn.querySelector('.wm-running-dot')?.remove();
    const running = this._runningWindows(appId).length > 0;
    btn.classList.toggle('running', running);
    if (running) {
      const dot = document.createElement('span');
      dot.className = 'wm-running-dot';
      btn.appendChild(dot);
    }
  }

  _showPinnedMenu(x, y, app, btn) {
    const running = this._runningWindows(app.id);
    const items   = [];

    if (running.length > 0) {
      items.push({ label: '📂 Show all windows', action: () => {
        running.forEach(win => {
          if (win.state.minimized) this._wm.minimize(win.instanceId);
          this._wm.focus(win.instanceId);
        });
      }});
      items.push({ label: '✕ Close all', action: () => {
        running.forEach(r => this._wm.close(r.instanceId));
      }});
      items.push('sep');
    }

    const pinned = this._settings.get('pinnedApps') || [];
    const isPinned = pinned.includes(app.id);
    items.push({ label: isPinned ? '📌 Unpin from taskbar' : '📌 Pin to taskbar', action: async () => {
      const newPinned = isPinned
        ? pinned.filter(id => id !== app.id)
        : [...pinned, app.id];
      await this._settings.set('pinnedApps', newPinned);
      await this.refreshPinnedApps();
    }});

    this._showMenu(x, y, items);
  }

  _bindTaskbarPreviewButtons(root) {
    if (!root) return;
    const buttons = [];
    if (root.matches?.('.wm-taskbar-btn')) buttons.push(root);
    root.querySelectorAll?.('.wm-taskbar-btn').forEach(button => buttons.push(button));
    for (const button of buttons) {
      if (button._bosPreviewBound) continue;
      button._bosPreviewBound = true;
      button.addEventListener('mouseenter', () => {
        clearTimeout(this._previewTimer);
        clearTimeout(this._previewHideTimer);
        this._previewTimer = setTimeout(() => {
          if (button.isConnected) this._showWindowPreview(button);
        }, 180);
      });
      button.addEventListener('mouseleave', event => {
        if (this._previewEl?.contains(event.relatedTarget)) {
          clearTimeout(this._previewHideTimer);
          return;
        }
        clearTimeout(this._previewTimer);
        this._previewHideTimer = setTimeout(() => this._hideWindowPreview(), 180);
      });
    }
  }

  _showWindowPreview(button) {
    this._hideWindowPreview();
    const windows = button.dataset.appId
      ? this._runningWindows(button.dataset.appId)
      : [this._wm._windows.get(button.dataset.instanceId)]
          .filter(Boolean)
          .map(win => ({ ...win, instanceId: button.dataset.instanceId }));
    if (!windows.length) return;

    const panel = document.createElement('div');
    panel.id = 'bos-taskbar-preview';
    panel.setAttribute('role', 'group');
    panel.setAttribute('aria-label', 'Open windows');
    panel.style.cssText = 'position:fixed;bottom:calc(var(--wm-taskbar-h) + 10px);display:flex;gap:10px;max-width:min(92vw,960px);overflow-x:auto;padding:10px;background:var(--wm-panel-bg);border:1px solid var(--wm-panel-border);border-radius:12px;box-shadow:0 12px 36px rgba(0,0,0,.42);backdrop-filter:var(--wm-backdrop-filter,blur(20px));z-index:9500';
    const rect = button.getBoundingClientRect();
    const width = Math.min(960, window.innerWidth - 24, windows.length * 222 + 20);
    panel.style.left = Math.max(12, Math.min(rect.left + rect.width / 2 - width / 2, window.innerWidth - width - 12)) + 'px';
    panel.style.width = width + 'px';

    windows.forEach(win => {
      const title = win.el.querySelector('.wm-titlebar-title')?.textContent || win.title || 'App';
      const icon = win.el.querySelector('.wm-titlebar-icon')?.textContent || win.icon || '🪟';
      const card = document.createElement('button');
      card.type = 'button';
      card.title = 'Switch to ' + title;
      card.style.cssText = 'width:212px;flex:0 0 212px;text-align:left;padding:8px;border:1px solid var(--wm-panel-border);border-radius:9px;background:var(--wm-control-bg);color:var(--wm-text);cursor:pointer;font:inherit';
      const miniature = document.createElement('div');
      miniature.style.cssText = 'height:112px;border:1px solid var(--wm-border);border-radius:6px;overflow:hidden;background:var(--wm-bg);margin-bottom:8px;display:flex;flex-direction:column';
      const titlebar = document.createElement('div');
      titlebar.style.cssText = 'height:20px;display:flex;align-items:center;gap:5px;padding:0 7px;background:var(--wm-titlebar);color:var(--wm-titlebar-txt);font-size:10px;overflow:hidden';
      const miniIcon = document.createElement('span');
      miniIcon.textContent = icon;
      const miniTitle = document.createElement('span');
      miniTitle.textContent = title;
      miniTitle.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
      titlebar.append(miniIcon, miniTitle);
      const previewBody = document.createElement('div');
      previewBody.style.cssText = 'flex:1;display:flex;align-items:center;justify-content:center;background:linear-gradient(145deg,var(--wm-bg),var(--wm-hover));font-size:28px';
      previewBody.textContent = icon;
      miniature.append(titlebar, previewBody);
      const caption = document.createElement('div');
      caption.textContent = title + (win.state.minimized ? ' · Minimized' : '');
      caption.style.cssText = 'font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
      card.append(miniature, caption);
      card.onclick = () => {
        if (win.state.minimized) this._wm.minimize(win.instanceId);
        this._wm.focus(win.instanceId);
        this._hideWindowPreview();
      };
      panel.appendChild(card);
    });

    panel.addEventListener('mouseenter', () => clearTimeout(this._previewHideTimer));
    panel.addEventListener('mouseleave', event => {
      if (event.relatedTarget?.closest?.('.wm-taskbar-btn')) return;
      this._previewHideTimer = setTimeout(() => this._hideWindowPreview(), 180);
    });
    document.body.appendChild(panel);
    this._previewEl = panel;
  }

  _hideWindowPreview() {
    clearTimeout(this._previewTimer);
    if (this._previewEl) this._previewEl.remove();
    this._previewEl = null;
  }


  _buildTray() {
    const clock = document.getElementById('wm-clock');
    if (!clock) return;

    // Insert tray before clock
    const tray = document.createElement('div');
    tray.id = 'wm-tray';
    tray.style.cssText = 'display:flex;align-items:center;gap:4px;padding:0 8px;flex-shrink:0';

    // Notification bell
    this._bellBtn = document.createElement('button');
    this._bellBtn.style.cssText = `
      background:transparent;border:none;color:var(--wm-text);cursor:pointer;
      font-size:16px;position:relative;width:32px;height:32px;
      display:flex;align-items:center;justify-content:center;
      border-radius:6px;transition:background 0.15s;
    `;
    this._bellBtn.textContent = '🔔';
    this._bellBtn.title = 'Notifications';
    this._bellBtn.onmouseenter = () => this._bellBtn.style.background = 'rgba(255,255,255,0.1)';
    this._bellBtn.onmouseleave = () => this._bellBtn.style.background = 'transparent';
    this._bellBtn.onclick = () => { this._bellBtn.style.background = 'transparent'; this._toggleNotificationCenter(); };

    this._badgeEl = document.createElement('span');
    this._badgeEl.style.cssText = `
      position:absolute;top:2px;right:2px;
      background:#c42b1c;color:#fff;border-radius:50%;
      width:14px;height:14px;font-size:9px;
      display:none;align-items:center;justify-content:center;
    `;
    this._bellBtn.appendChild(this._badgeEl);
    tray.appendChild(this._bellBtn);

    // Quick settings button
    const qsBtn = document.createElement('button');
    qsBtn.style.cssText = `
      background:transparent;border:none;color:var(--wm-text);cursor:pointer;
      font-size:16px;width:32px;height:32px;
      display:flex;align-items:center;justify-content:center;
      border-radius:6px;transition:background 0.15s;
    `;
    qsBtn.textContent = '⚙️';
    qsBtn.title = 'Quick Settings';
    qsBtn.onmouseenter = () => qsBtn.style.background = 'rgba(255,255,255,0.1)';
    qsBtn.onmouseleave = () => qsBtn.style.background = 'transparent';
    qsBtn.onclick = () => { qsBtn.style.background = 'transparent'; this._toggleQuickSettings(); };
    tray.appendChild(qsBtn);

    clock.parentNode.insertBefore(tray, clock);
    clock.style.cursor = 'pointer';
    clock.tabIndex = 0;
    clock.setAttribute('role', 'button');
    clock.setAttribute('aria-haspopup', 'dialog');
    clock.setAttribute('aria-label', 'Open calendar and clock');
    clock.title = 'Calendar and Clock';
    clock.addEventListener('click', () => this._toggleCalendarClockFlyout());
    clock.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        this._toggleCalendarClockFlyout();
      }
    });
  }

  _toggleCalendarClockFlyout() {
    const existing = document.getElementById('bos-calendar-clock-panel');
    if (existing) {
      if (existing.dataset.closing) {
        clearTimeout(existing._flyoutCloseTimer);
        existing.remove();
      } else {
        this._closeFlyout(existing);
        return;
      }
    }

    const panel = document.createElement('div');
    panel.id = 'bos-calendar-clock-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Calendar and clock');
    panel.classList.add('bos-flyout-opening');
    panel.style.cssText = 'position:fixed;right:8px;bottom:calc(var(--wm-taskbar-h) + 8px);width:320px;max-height:min(78vh,680px);overflow-y:auto;padding:14px;background:var(--wm-panel-bg);backdrop-filter:var(--wm-backdrop-filter,blur(20px));border:1px solid var(--wm-panel-border);border-radius:12px;box-shadow:0 10px 34px rgba(0,0,0,.42);z-index:9100;color:var(--wm-text);font-family:var(--wm-font);';
    panel.addEventListener('click', event => event.stopPropagation());
    let selected = new Date();
    let month = new Date(selected.getFullYear(), selected.getMonth(), 1);
    let followsToday = true;

    const keyOf = date => date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
    const time = document.createElement('div');
    time.style.cssText = 'font-size:27px;font-weight:300;font-variant-numeric:tabular-nums';
    const dateLabel = document.createElement('div');
    dateLabel.style.cssText = 'font-size:12px;color:var(--wm-text-dim);margin:1px 0 12px';
    const monthBar = document.createElement('div');
    monthBar.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:7px';
    const monthName = document.createElement('strong');
    monthName.style.fontSize = '13px';
    const previous = document.createElement('button');
    const next = document.createElement('button');
    [previous, next].forEach(button => {
      button.type = 'button';
      button.style.cssText = 'border:0;border-radius:5px;background:var(--wm-control-bg);color:var(--wm-text);width:28px;height:26px;cursor:pointer;font-size:17px';
    });
    previous.textContent = '‹'; previous.title = 'Previous month';
    next.textContent = '›'; next.title = 'Next month';
    monthBar.append(previous, monthName, next);

    const week = document.createElement('div');
    week.style.cssText = 'display:grid;grid-template-columns:repeat(7,1fr);gap:3px;text-align:center;color:var(--wm-text-dim);font-size:10px;margin-bottom:3px';
    ['M','T','W','T','F','S','S'].forEach(label => {
      const cell = document.createElement('div'); cell.textContent = label; week.appendChild(cell);
    });
    const days = document.createElement('div');
    days.style.cssText = 'display:grid;grid-template-columns:repeat(7,1fr);gap:3px';
    const selectedDay = document.createElement('div');
    selectedDay.style.cssText = 'font-size:13px;font-weight:600;margin:10px 0 6px';
    const eventList = document.createElement('div');
    eventList.style.cssText = 'display:flex;flex-direction:column;gap:5px';
    const addEvent = document.createElement('button');
    addEvent.type = 'button';
    addEvent.textContent = '+ Event';
    addEvent.style.cssText = 'margin-top:7px;border:0;border-radius:6px;padding:5px 8px;background:transparent;color:var(--wm-accent);cursor:pointer;font:inherit;font-size:12px';
    const eventForm = document.createElement('form');
    eventForm.style.cssText = 'display:none;gap:6px;margin-top:6px';
    const eventName = document.createElement('input');
    eventName.type = 'text';
    eventName.maxLength = 120;
    eventName.placeholder = 'Event name';
    eventName.setAttribute('aria-label', 'Event name');
    eventName.style.cssText = 'flex:1;min-width:0;border:1px solid var(--wm-control-border);border-radius:6px;padding:6px;background:var(--wm-control-bg);color:var(--wm-text);font:inherit;font-size:12px';
    const saveEvent = document.createElement('button');
    saveEvent.type = 'submit';
    saveEvent.textContent = 'Save';
    saveEvent.style.cssText = 'border:1px solid var(--wm-control-border);border-radius:6px;padding:5px 8px;background:var(--wm-control-bg);color:var(--wm-text);cursor:pointer;font:inherit;font-size:12px';
    eventForm.append(eventName, saveEvent);
    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;gap:8px;margin-top:12px';
    const openCalendar = document.createElement('button');
    const openClock = document.createElement('button');
    [openCalendar, openClock].forEach(button => {
      button.type = 'button';
      button.style.cssText = 'flex:1;border:1px solid var(--wm-control-border);border-radius:7px;padding:7px;background:var(--wm-control-bg);color:var(--wm-text);cursor:pointer;font:inherit;font-size:12px';
    });
    openCalendar.textContent = '📅 Open Calendar';
    openClock.textContent = '🕒 Open Clock';
    actions.append(openCalendar, openClock);
    panel.append(time, dateLabel, monthBar, week, days, selectedDay, eventList, addEvent, eventForm, actions);

    let events = {};
    let eventsReady = false;
    const renderEvents = () => {
      selectedDay.textContent = selected.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
      eventList.innerHTML = '';
      const dayKey = keyOf(selected);
      const list = events[dayKey] || [];
      if (!eventsReady) {
        const loading = document.createElement('div');
        loading.textContent = 'Loading events…';
        loading.style.cssText = 'font-size:11px;color:var(--wm-text-dim)';
        eventList.appendChild(loading);
        return;
      }
      if (!list.length) {
        const empty = document.createElement('div');
        empty.textContent = 'No events';
        empty.style.cssText = 'font-size:11px;color:var(--wm-text-dim)';
        eventList.appendChild(empty);
      } else {
        list.forEach(item => {
          const row = document.createElement('div');
          row.style.cssText = 'display:flex;align-items:center;gap:6px;padding:5px 7px;border:1px solid var(--wm-border);border-radius:6px;background:var(--wm-control-bg);font-size:12px';
          const title = document.createElement('span');
          title.textContent = item.title;
          title.style.cssText = 'flex:1;overflow-wrap:anywhere';
          const remove = document.createElement('button');
          remove.type = 'button';
          remove.textContent = '×';
          remove.title = 'Remove event';
          remove.style.cssText = 'border:0;background:transparent;color:var(--wm-text-dim);cursor:pointer;font-size:16px';
          remove.onclick = async event => {
            event.stopPropagation();
            events[dayKey] = (events[dayKey] || []).filter(eventItem => eventItem.id !== item.id);
            if (!events[dayKey].length) delete events[dayKey];
            await this._db.settings.set('calendarEvents', events);
            renderEvents();
          };
          row.append(title, remove);
          eventList.appendChild(row);
        });
      }
    };
    addEvent.onclick = event => {
      event.stopPropagation();
      addEvent.style.display = 'none';
      eventForm.style.display = 'flex';
      eventName.focus();
    };
    eventForm.onsubmit = async event => {
      event.preventDefault();
      event.stopPropagation();
      const title = eventName.value.trim();
      if (!title) { eventName.focus(); return; }
      const dayKey = keyOf(selected);
      events[dayKey] ||= [];
      events[dayKey].push({ id: crypto.randomUUID?.() || Date.now() + '-' + Math.random(), title });
      await this._db.settings.set('calendarEvents', events);
      eventName.value = '';
      eventForm.style.display = 'none';
      addEvent.style.display = '';
      renderEvents();
    };
    addEvent.addEventListener('click', event => event.stopPropagation());

    const renderDays = () => {
      monthName.textContent = month.toLocaleDateString([], { month: 'long', year: 'numeric' });
      days.innerHTML = '';
      const first = new Date(month.getFullYear(), month.getMonth(), 1);
      const offset = (first.getDay() + 6) % 7;
      const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
      for (let i = 0; i < offset; i++) days.appendChild(document.createElement('span'));
      const todayKey = keyOf(new Date());
      for (let day = 1; day <= count; day++) {
        const date = new Date(month.getFullYear(), month.getMonth(), day);
        const key = keyOf(date);
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = String(day);
        button.setAttribute('aria-label', date.toLocaleDateString([], { dateStyle: 'full' }));
        button.style.cssText = 'height:31px;border:1px solid ' + (key === keyOf(selected) ? 'var(--wm-accent)' : 'transparent') +
          ';border-radius:6px;background:' + (key === keyOf(selected) ? 'var(--wm-accent)' : key === todayKey ? 'var(--wm-control-hover)' : 'transparent') +
          ';color:' + (key === keyOf(selected) ? '#fff' : 'var(--wm-text)') + ';cursor:pointer;font:inherit;font-size:12px';
        button.onclick = event => {
          event.stopPropagation();
          selected = date;
          followsToday = keyOf(date) === keyOf(new Date());
          addEvent.style.display = '';
          eventForm.style.display = 'none';
          eventName.value = '';
          renderDays();
          renderEvents();
        };
        days.appendChild(button);
      }
    };
    previous.onclick = () => { month = new Date(month.getFullYear(), month.getMonth() - 1, 1); renderDays(); };
    next.onclick = () => { month = new Date(month.getFullYear(), month.getMonth() + 1, 1); renderDays(); };
    openCalendar.onclick = () => {
      const date = keyOf(selected);
      this._closeFlyout(panel);
      this._wm.openSystemApp('calendar', { date });
    };
    openClock.onclick = () => {
      this._closeFlyout(panel);
      this._wm.openSystemApp('clock');
    };
    const updateClock = () => {
      const now = new Date();
      time.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      dateLabel.textContent = now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
      if (followsToday && keyOf(now) !== keyOf(selected)) {
        selected = now;
        month = new Date(now.getFullYear(), now.getMonth(), 1);
        renderDays();
        renderEvents();
      }
    };
    renderDays();
    renderEvents();
    updateClock();
    panel._clockTimer = setInterval(updateClock, 1000);
    document.body.appendChild(panel);
    this._db.settings.get('calendarEvents').then(saved => {
      if (!panel.isConnected) return;
      events = saved || {};
      eventsReady = true;
      renderEvents();
    }).catch(error => {
      console.error('[taskbar] Could not load calendar events:', error);
      eventsReady = true;
      renderEvents();
    });

    setTimeout(() => {
      const close = event => {
        if (!panel.contains(event.target) && event.target !== document.getElementById('wm-clock')) {
          this._closeFlyout(panel);
        }
      };
      panel._outsideClose = close;
      document.addEventListener('click', close);
    }, 0);
  }

  // ─── Notification center ───────────────────────────────────────────────────

  _addNotification(message) {
    this._notifications.unshift({ message, ts: Date.now() });
    if (this._notifications.length > 50) this._notifications.pop();
    this._unread++;
    this._updateBadge();

    // Refresh panel if open
    const panel = document.getElementById('bos-notif-panel');
    if (panel) this._renderNotifPanel(panel);
  }

  _updateBadge() {
    if (!this._badgeEl) return;
    if (this._unread > 0) {
      this._badgeEl.style.display = 'flex';
      this._badgeEl.textContent   = this._unread > 9 ? '9+' : this._unread;
    } else {
      this._badgeEl.style.display = 'none';
    }
  }

  _closeFlyout(panel) {
    if (!panel || panel.dataset.closing) return;
    if (panel._outsideClose) {
      document.removeEventListener('click', panel._outsideClose);
      panel._outsideClose = null;
    }
    if (panel._clockTimer) {
      clearInterval(panel._clockTimer);
      panel._clockTimer = null;
    }
    if (document.documentElement.classList.contains('bos-reduce-motion')) {
      panel.remove();
      return;
    }
    panel.dataset.closing = 'true';
    panel.classList.remove('bos-flyout-opening');
    panel.classList.add('bos-flyout-closing');
    const finish = event => {
      if (event && event.target !== panel) return;
      clearTimeout(panel._flyoutCloseTimer);
      panel.remove();
    };
    panel.addEventListener('animationend', finish);
    panel._flyoutCloseTimer = setTimeout(() => finish(), 220);
  }

  _toggleNotificationCenter() {
    const existing = document.getElementById('bos-notif-panel');
    if (existing) {
      if (existing.dataset.closing) {
        clearTimeout(existing._flyoutCloseTimer);
        existing.remove();
      } else {
        this._closeFlyout(existing);
        return;
      }
    }

    this._unread = 0;
    this._updateBadge();

    const panel = document.createElement('div');
    panel.id = 'bos-notif-panel';
    panel.classList.add('bos-flyout-opening');
    panel.style.cssText = `
      position:fixed;bottom:calc(var(--wm-taskbar-h) + 8px);right:8px;
      width:320px;max-height:400px;
      background:var(--wm-panel-bg);backdrop-filter:var(--wm-backdrop-filter,blur(20px));
      border:1px solid var(--wm-panel-border);border-radius:12px;
      box-shadow:0 8px 32px rgba(0,0,0,0.5);
      z-index:9100;display:flex;flex-direction:column;overflow:hidden;
    `;
    this._renderNotifPanel(panel);
    document.body.appendChild(panel);

    setTimeout(() => {
      const close = e => {
        if (!panel.contains(e.target) && e.target !== this._bellBtn) {
          this._closeFlyout(panel);
          document.removeEventListener('click', close);
        }
      };
      document.addEventListener('click', close);
    }, 0);
  }

  _renderNotifPanel(panel) {
    panel.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;
        padding:12px 14px;border-bottom:1px solid var(--wm-separator)">
        <span style="font-weight:bold;font-size:14px">Notifications</span>
        <button id="bos-notif-clear" style="background:none;border:none;color:var(--wm-text-dim);
          cursor:pointer;font-size:12px">Clear all</button>
      </div>
      <div id="bos-notif-list" style="overflow-y:auto;flex:1;padding:8px"></div>
    `;

    const list = panel.querySelector('#bos-notif-list');
    if (this._notifications.length === 0) {
      list.innerHTML = '<div style="padding:16px;color:var(--wm-text-dim);font-size:13px;text-align:center">No notifications</div>';
    } else {
      this._notifications.forEach(n => {
        const el = document.createElement('div');
        el.style.cssText = `
          padding:10px 12px;border-radius:6px;font-size:13px;
          border-bottom:1px solid var(--wm-separator);
          display:flex;justify-content:space-between;gap:12px;
        `;
        el.innerHTML = `
          <span>${n.message}</span>
          <span style="color:var(--wm-text-dim);font-size:11px;flex-shrink:0">
            ${new Date(n.ts).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}
          </span>
        `;
        list.appendChild(el);
      });
    }

    panel.querySelector('#bos-notif-clear').onclick = () => {
      this._notifications = [];
      this._renderNotifPanel(panel);
    };
  }

  // ─── Quick settings panel ──────────────────────────────────────────────────

  _toggleQuickSettings() {
    const existing = document.getElementById('bos-qs-panel');
    if (existing) {
      if (existing.dataset.closing) {
        clearTimeout(existing._flyoutCloseTimer);
        existing.remove();
      } else {
        this._closeFlyout(existing);
        return;
      }
    }

    const panel = document.createElement('div');
    panel.id = 'bos-qs-panel';
    panel.classList.add('bos-flyout-opening');
    panel.style.cssText = `
      position:fixed;bottom:calc(var(--wm-taskbar-h) + 8px);right:8px;
      width:300px;background:var(--wm-panel-bg);backdrop-filter:var(--wm-backdrop-filter,blur(20px));
      border:1px solid var(--wm-panel-border);border-radius:12px;
      box-shadow:0 8px 32px rgba(0,0,0,0.5);z-index:9100;padding:16px;
    `;

    const theme = this._settings.getAll();

    panel.innerHTML = `
      <div style="font-weight:bold;font-size:14px;margin-bottom:14px">Quick Settings</div>

      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
        <span style="font-size:13px">Dark Mode</span>
        <div class="qs-toggle ${theme.darkMode ? 'on' : ''}" id="qs-darkmode"
          style="width:44px;height:24px;border-radius:12px;cursor:pointer;
          background:${theme.darkMode ? '#0078d4' : '#444'};position:relative;transition:background 0.2s">
          <div style="position:absolute;width:18px;height:18px;background:#fff;border-radius:50%;
            top:3px;transition:left 0.2s;left:${theme.darkMode ? '23px' : '3px'}"></div>
        </div>
      </div>

      <div style="margin-bottom:12px">
        <div style="font-size:13px;margin-bottom:8px">Accent Color</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${['#0078d4','#e81123','#107c10','#ff8c00','#8764b8','#00b294'].map(c =>
            `<div data-color="${c}" style="width:26px;height:26px;border-radius:50%;
              background:${c};cursor:pointer;border:2px solid ${c === theme.accent ? '#fff' : 'transparent'};
              transition:border 0.15s"></div>`
          ).join('')}
        </div>
      </div>

      <div style="font-size:12px;color:var(--wm-text-dim);text-align:center;cursor:pointer" id="qs-open-settings">
        Open full Settings →
      </div>
    `;

    // Dark mode toggle
    panel.querySelector('#qs-darkmode').onclick = async () => {
      await this._settings.set('darkMode', !this._settings.get('darkMode'));
      this._closeFlyout(panel);
      this._toggleQuickSettings(); // re-render
    };

    // Accent swatches
    panel.querySelectorAll('[data-color]').forEach(el => {
      el.onclick = async () => {
        await this._settings.set('accent', el.dataset.color);
        this._closeFlyout(panel);
      };
    });

    // Open full settings
    panel.querySelector('#qs-open-settings').onclick = () => {
      this._wm.openSystemApp('settings');
      this._closeFlyout(panel);
    };

    document.body.appendChild(panel);

    setTimeout(() => {
      const close = e => {
        if (!panel.contains(e.target)) {
          this._closeFlyout(panel);
          document.removeEventListener('click', close);
        }
      };
      document.addEventListener('click', close);
    }, 0);
  }

  // ─── Generic menu ─────────────────────────────────────────────────────────

  _showMenu(x, y, items) {
    document.getElementById('bos-ctx-menu')?.remove();
    const menu = document.createElement('div');
    menu.id = 'bos-ctx-menu';
    menu.style.cssText = `
      position:fixed;left:${Math.min(x, window.innerWidth - 200)}px;
      top:${Math.min(y, window.innerHeight - items.length * 36 - 60)}px;
      background:var(--wm-panel-bg);backdrop-filter:var(--wm-backdrop-filter,blur(20px));
      border:1px solid var(--wm-panel-border);border-radius:8px;
      padding:4px;z-index:99999;min-width:200px;
      box-shadow:0 8px 32px rgba(0,0,0,0.5);
    `;
    items.forEach(item => {
      if (item === 'sep') {
        const sep = document.createElement('div');
        sep.style.cssText = 'height:1px;background:var(--wm-control-hover);margin:4px 0';
        menu.appendChild(sep);
      } else {
        const el = document.createElement('div');
        el.style.cssText = 'padding:7px 14px;border-radius:4px;font-size:13px;cursor:pointer;color:var(--wm-text)';
        el.textContent = item.label;
        el.onmouseenter = () => el.style.background = 'rgba(255,255,255,0.1)';
        el.onmouseleave = () => el.style.background = '';
        el.onclick = () => { item.action(); menu.remove(); };
        menu.appendChild(el);
      }
    });
    document.body.appendChild(menu);
    setTimeout(() => {
      const close = e => { if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('click', close); }};
      document.addEventListener('click', close);
    }, 0);
  }
}
