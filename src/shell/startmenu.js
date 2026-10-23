/**
 * BrowserOS — Start Menu
 * src/shell/startmenu.js
 *
 * Opens anchored to the taskbar start button.
 * Shows pinned apps, all apps, recent files.
 * Typing immediately searches — no separate search needed.
 */

export class StartMenu {
  constructor({ fs, db, wm, launcher, kernel, settings }) {
    this._fs       = fs;
    this._db       = db;
    this._wm       = wm;
    this._launcher = launcher;
    this._kernel   = kernel;
    this._settings = settings;
    this._el       = null;
    this._open     = false;
    this._closeTimer = null;
  }

  boot() {
    this._build();
    // The logo is a child of the Start button, so check the whole button.
    // Keep one outside-click handler instead of adding one on every opening.
    document.addEventListener('mousedown', event => {
      const startButton = document.getElementById('wm-start-btn');
      const appMenu = document.getElementById('bos-startmenu-app-menu');
      if (appMenu?.contains(event.target)) return;
      appMenu?.remove();
      if (this._open && !this._el.contains(event.target) &&
          !startButton?.contains(event.target)) this.close();
    });
    document.addEventListener('bos:profileChanged', event => {
      const nameEl = document.getElementById('bos-startmenu-user-name');
      if (nameEl) nameEl.textContent = event.detail?.name || 'User';
    });
    // Ctrl+Space belongs to Search; Start has its own taskbar button.
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && this._open) this.close();
    });
    console.log('[startmenu] Booted');
  }

  toggle() { this._open ? this.close() : this.openMenu(); }

  // ─── Build DOM ─────────────────────────────────────────────────────────────

  _build() {
    const el = document.createElement('div');
    el.id = 'bos-startmenu';
    el.setAttribute('aria-hidden', 'true');
    el.style.cssText = `
      position:fixed;
      bottom:calc(var(--wm-taskbar-h) + 8px);
      left:8px;
      width:380px;
      max-height:560px;
      background:var(--wm-panel-bg);
      backdrop-filter:var(--wm-backdrop-filter,blur(20px));
      border:1px solid var(--wm-panel-border);
      border-radius:14px;
      box-shadow:0 16px 48px rgba(0,0,0,0.6);
      z-index:9200;
      display:none;
      flex-direction:column;
      overflow:hidden;
    `;

    // Search bar
    const searchWrap = document.createElement('div');
    searchWrap.style.cssText = 'padding:14px 14px 10px;flex-shrink:0';
    const searchInput = document.createElement('input');
    searchInput.id = 'bos-startmenu-search';
    searchInput.placeholder = 'Search apps, files...';
    searchInput.style.cssText = `
      width:100%;background:var(--wm-control-bg);
      border:1px solid var(--wm-panel-border);border-radius:8px;
      color:var(--wm-text);padding:8px 12px;font-size:14px;outline:none;
      font-family:inherit;
    `;
    searchInput.addEventListener('input', () => this._onSearch(searchInput.value));
    searchInput.addEventListener('keydown', e => {
      if (e.key === 'Escape') this.close();
      if (e.key === 'Enter') this._launchFirst();
      if (e.key === 'ArrowDown') { e.preventDefault(); this._moveSelection(1); }
      if (e.key === 'ArrowUp')   { e.preventDefault(); this._moveSelection(-1); }
    });
    searchWrap.appendChild(searchInput);
    el.appendChild(searchWrap);

    // Body (scrollable)
    const body = document.createElement('div');
    body.id = 'bos-startmenu-body';
    body.style.cssText = 'flex:1;overflow-y:auto;padding:0 8px 12px';
    el.appendChild(body);

    // Footer
    const footer = document.createElement('div');
    footer.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-top:1px solid var(--wm-separator);flex-shrink:0';

    const userEl = document.createElement('div');
    userEl.style.cssText = 'display:flex;align-items:center;gap:8px;font-size:13px;color:var(--wm-text)';
    const profile = this._settings.get('userProfile') || {};
    userEl.innerHTML = '<span style="font-size:20px">👤</span>';
    const userName = document.createElement('span');
    userName.id = 'bos-startmenu-user-name';
    userName.textContent = profile.name || 'User';
    userEl.appendChild(userName);

    const powerBtn = document.createElement('button');
    powerBtn.textContent = '⏻';
    powerBtn.title = 'Power';
    powerBtn.style.cssText = 'background:var(--wm-control-bg);border:1px solid var(--wm-control-hover);border-radius:6px;color:var(--wm-text);width:32px;height:32px;cursor:pointer;font-size:16px;transition:background 0.15s';
    powerBtn.onmouseenter = () => powerBtn.style.background = 'rgba(200,50,50,0.3)';
    powerBtn.onmouseleave = () => powerBtn.style.background = 'var(--wm-control-bg)';
    powerBtn.onclick = () => {
      if (confirm('Reload BrowserOS?')) location.reload();
    };

    const settingsBtn = document.createElement('button');
    settingsBtn.textContent = '⚙️';
    settingsBtn.title = 'Settings';
    settingsBtn.style.cssText = 'background:var(--wm-control-bg);border:1px solid var(--wm-control-hover);border-radius:6px;color:var(--wm-text);width:32px;height:32px;cursor:pointer;font-size:16px;transition:background 0.15s';
    settingsBtn.onmouseenter = () => settingsBtn.style.background = 'var(--wm-control-hover)';
    settingsBtn.onmouseleave = () => settingsBtn.style.background = 'var(--wm-control-bg)';
    settingsBtn.onclick = () => { this._wm.openSystemApp('settings'); this.close(); };

    const btnGroup = document.createElement('div');
    btnGroup.style.cssText = 'display:flex;gap:6px';
    btnGroup.appendChild(settingsBtn);
    btnGroup.appendChild(powerBtn);

    footer.appendChild(userEl);
    footer.appendChild(btnGroup);
    el.appendChild(footer);

    document.body.appendChild(el);
    this._el          = el;
    this._searchInput = searchInput;
    this._body        = body;
  }

  // ─── Open / close ──────────────────────────────────────────────────────────

  async openMenu() {
    clearTimeout(this._closeTimer);
    this._open = true;
    this._el.setAttribute('aria-hidden', 'false');
    this._el.style.display = 'flex';
    this._el.classList.remove('bos-menu-closing', 'bos-menu-opening');
    void this._el.offsetWidth;
    this._el.classList.add('bos-menu-opening');
    setTimeout(() => {
      if (this._open) this._el.classList.remove('bos-menu-opening');
    }, 220);
    this._searchInput.value = '';
    await this._renderDefault();
    if (!this._open) return;
    this._searchInput.focus();
  }

  close() {
    if (!this._open) return;
    this._open = false;
    document.getElementById('bos-startmenu-app-menu')?.remove();
    this._el.setAttribute('aria-hidden', 'true');
    this._searchInput.blur();
    this._el.classList.remove('bos-menu-opening');
    if (document.documentElement.classList.contains('bos-reduce-motion')) {
      this._el.classList.remove('bos-menu-closing');
      this._el.style.display = 'none';
      return;
    }
    this._el.classList.add('bos-menu-closing');
    clearTimeout(this._closeTimer);
    this._closeTimer = setTimeout(() => {
      if (!this._open) {
        this._el.style.display = 'none';
        this._el.classList.remove('bos-menu-closing');
      }
    }, 170);
  }

  // ─── Default view ──────────────────────────────────────────────────────────

  async _renderDefault() {
    this._body.innerHTML = '';
    this._selectedIdx = -1;

    const pinned = this._getStartPins();
    const allApps = await this._db.apps.all();

    // Pinned apps
    if (pinned.length) {
      this._section('Pinned');
      const grid = document.createElement('div');
      grid.style.cssText = 'display:grid;grid-template-columns:repeat(4,1fr);gap:6px;padding:4px 0 10px';
      for (const appId of pinned) {
        let app = allApps.find(a => a.id === appId);
        let label, icon;
        if (app) {
          label = app.name; icon = app.icon || app.emoji || '⚡';
        } else {
          const sys = this._wm._systemApps.get(appId);
          if (!sys) continue;
          label = sys.title; icon = sys.icon || '🪟';
        }
        const tile = this._makeTile(label, icon, () => this._launchApp(appId));
        this._bindAppContextMenu(tile, appId);
        grid.appendChild(tile);
      }
      this._body.appendChild(grid);
    }

    // All apps
    this._section('All Apps');
    const appsToShow = [...allApps];
    // Add native apps
    for (const [id, sys] of this._wm._systemApps) {
      if (!appsToShow.find(a => a.id === id)) {
        appsToShow.push({ id, name: sys.title, emoji: sys.icon, icon: null });
      }
    }
    appsToShow.sort((a, b) => a.name.localeCompare(b.name));

    for (const app of appsToShow) {
      const row = this._makeRow(
        app.icon || app.emoji || '⚡',
        app.name,
        'App',
        () => this._launchApp(app.id)
      );
      this._bindAppContextMenu(row, app.id);
      this._body.appendChild(row);
    }

    // Recent files
    const recent = await this._getRecentFiles();
    if (recent.length) {
      this._section('Recent Files');
      for (const f of recent) {
        const row = this._makeRow(
          this._fileIcon(f.path),
          f.path.split('/').pop(),
          f.path,
          () => { this.close(); }
        );
        this._body.appendChild(row);
      }
    }
  }

  // ─── Search ────────────────────────────────────────────────────────────────

  async _onSearch(query) {
    this._body.innerHTML = '';
    this._selectedIdx = -1;
    const q = query.toLowerCase().trim();
    if (!q) { await this._renderDefault(); return; }

    const allApps = await this._db.apps.all();
    // Add native apps
    for (const [id, sys] of this._wm._systemApps) {
      if (!allApps.find(a => a.id === id)) {
        allApps.push({ id, name: sys.title, emoji: sys.icon, icon: null });
      }
    }

    const matchedApps = allApps.filter(a =>
      a.name.toLowerCase().includes(q) || a.id.includes(q)
    );

    if (matchedApps.length) {
      this._section('Apps');
      for (const app of matchedApps) {
        const row = this._makeRow(
          app.icon || app.emoji || '⚡',
          app.name,
          'App',
          () => this._launchApp(app.id)
        );
        row.dataset.searchResult = '1';
        this._bindAppContextMenu(row, app.id);
        this._body.appendChild(row);
      }
    }

    // File search
    const recent = await this._getRecentFiles();
    const matchedFiles = recent.filter(f => f.path.toLowerCase().includes(q));
    if (matchedFiles.length) {
      this._section('Files');
      for (const f of matchedFiles) {
        const row = this._makeRow(
          this._fileIcon(f.path),
          f.path.split('/').pop(),
          f.path,
          () => { this.close(); }
        );
        row.dataset.searchResult = '1';
        this._body.appendChild(row);
      }
    }

    if (!matchedApps.length && !matchedFiles.length) {
      const empty = document.createElement('div');
      empty.style.cssText = 'padding:32px;text-align:center;color:var(--wm-text-dim);font-size:13px';
      empty.textContent = 'No results for "' + query + '"';
      this._body.appendChild(empty);
    }
  }

  // ─── Keyboard navigation ───────────────────────────────────────────────────

  _moveSelection(dir) {
    const rows = [...this._body.querySelectorAll('[data-search-result], .sm-row')];
    if (!rows.length) return;
    rows.forEach(r => r.style.background = '');
    this._selectedIdx = Math.max(0, Math.min(rows.length - 1, this._selectedIdx + dir));
    rows[this._selectedIdx].style.background = 'rgba(0,120,212,0.25)';
    rows[this._selectedIdx].scrollIntoView({ block: 'nearest' });
  }

  _launchFirst() {
    const rows = [...this._body.querySelectorAll('[data-search-result], .sm-row')];
    if (rows.length > 0) {
      const idx = this._selectedIdx >= 0 ? this._selectedIdx : 0;
      rows[idx]?.click();
    }
  }

  // ─── Launch ────────────────────────────────────────────────────────────────

  async _launchApp(appId) {
    this.close();
    if (this._wm._systemApps.has(appId)) {
      this._wm.openSystemApp(appId);
    } else {
      try { await this._launcher.launchById(appId); }
      catch(e) { this._wm.notify('Failed to launch: ' + e.message); }
    }
  }

  _bindAppContextMenu(element, appId) {
    element.addEventListener('contextmenu', event => {
      event.preventDefault();
      event.stopPropagation();
      this._showAppContextMenu(event.clientX, event.clientY, appId);
    });
  }

  _getStartPins() {
    // Preserve the original Start layout until the user first changes its pins.
    return [...new Set(this._settings.get('startPinnedApps') ??
      this._settings.get('pinnedApps') ?? [])];
  }

  _showAppContextMenu(x, y, appId) {
    document.getElementById('bos-startmenu-app-menu')?.remove();
    const menu = document.createElement('div');
    menu.id = 'bos-startmenu-app-menu';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', 'App actions');
    menu.style.cssText = 'position:fixed;min-width:210px;padding:4px;background:var(--wm-panel-bg);border:1px solid var(--wm-panel-border);border-radius:8px;box-shadow:0 8px 28px rgba(0,0,0,.45);z-index:9500';
    const addAction = (label, run) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('role', 'menuitem');
      button.textContent = label;
      button.style.cssText = 'display:block;width:100%;padding:9px 11px;border:0;border-radius:5px;background:transparent;color:var(--wm-text);text-align:left;font:13px var(--wm-font);cursor:pointer';
      button.onmouseenter = () => button.style.background = 'var(--wm-control-hover)';
      button.onmouseleave = () => button.style.background = '';
      button.onclick = async event => {
        event.stopPropagation();
        menu.querySelectorAll('button').forEach(item => item.disabled = true);
        try { await run(); }
        catch (error) { this._wm.notify('Could not complete app action: ' + error.message); }
        finally {
          menu.remove();
          if (this._open) this._searchInput.focus();
        }
      };
      menu.appendChild(button);
    };
    const pinned = this._getStartPins().includes(appId);
    addAction(pinned ? 'Unpin from Start' : 'Pin to Start', async () => {
      const current = this._getStartPins();
      const next = pinned ? current.filter(id => id !== appId) : [...new Set([...current, appId])];
      try { await this._settings.set('startPinnedApps', next); }
      catch (error) {
        // Settings updates its cache before writing; undo that on a save failure.
        this._settings._cache.startPinnedApps = current;
        throw error;
      }
      if (this._open) await this._onSearch(this._searchInput.value);
    });
    addAction('Create desktop shortcut', () => {
      document.dispatchEvent(new CustomEvent('bos:createDesktopShortcut', { detail: { appId } }));
      this.close();
    });
    menu.addEventListener('keydown', event => {
      const buttons = [...menu.querySelectorAll('button')];
      const index = buttons.indexOf(document.activeElement);
      if (event.key === 'Escape') {
        event.preventDefault(); event.stopPropagation();
        menu.remove(); this._searchInput.focus();
      } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        buttons[(index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length].focus();
      }
    });
    document.body.appendChild(menu);
    menu.style.left = Math.max(4, Math.min(x, window.innerWidth - menu.offsetWidth - 4)) + 'px';
    menu.style.top = Math.max(4, Math.min(y, window.innerHeight - menu.offsetHeight - 4)) + 'px';
    menu.querySelector('button').focus();
  }

  // ─── UI helpers ────────────────────────────────────────────────────────────

  _section(title) {
    const el = document.createElement('div');
    el.style.cssText = 'font-size:11px;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:0.06em;font-weight:bold;padding:10px 6px 4px';
    el.textContent = title;
    this._body.appendChild(el);
  }

  _makeTile(label, icon, onClick) {
    const tile = document.createElement('div');
    tile.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:5px;padding:10px 6px;border-radius:8px;cursor:pointer;text-align:center;transition:background 0.15s';
    tile.onmouseenter = () => tile.style.background = 'var(--wm-control-hover)';
    tile.onmouseleave = () => tile.style.background = '';
    tile.onclick = onClick;

    const iconEl = document.createElement('div');
    iconEl.style.cssText = 'width:36px;height:36px;display:flex;align-items:center;justify-content:center;font-size:24px;border-radius:8px;background:var(--wm-control-bg)';
    if (icon && icon.startsWith('data:')) {
      iconEl.innerHTML = `<img src="${icon}" style="width:28px;height:28px;border-radius:4px;object-fit:cover">`;
    } else {
      iconEl.textContent = icon || '⚡';
    }

    const labelEl = document.createElement('div');
    labelEl.style.cssText = 'font-size:11px;color:var(--wm-text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;width:100%';
    labelEl.textContent = label;

    tile.appendChild(iconEl);
    tile.appendChild(labelEl);
    return tile;
  }

  _makeRow(icon, label, sublabel, onClick) {
    const row = document.createElement('div');
    row.className = 'sm-row';
    row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:7px 8px;border-radius:8px;cursor:pointer;transition:background 0.15s';
    row.onmouseenter = () => row.style.background = 'var(--wm-control-bg)';
    row.onmouseleave = () => { if (row.style.background !== 'rgba(0,120,212,0.25)') row.style.background = ''; };
    row.onclick = onClick;

    const iconEl = document.createElement('div');
    iconEl.style.cssText = 'width:32px;height:32px;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0';
    if (icon && icon.startsWith('data:')) {
      iconEl.innerHTML = `<img src="${icon}" style="width:28px;height:28px;border-radius:4px;object-fit:cover">`;
    } else {
      iconEl.textContent = icon;
    }

    const text = document.createElement('div');
    text.style.cssText = 'flex:1;overflow:hidden';
    text.innerHTML = `
      <div style="font-size:13px;color:var(--wm-text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${label}</div>
      <div style="font-size:11px;color:var(--wm-text-dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${sublabel}</div>
    `;

    row.appendChild(iconEl);
    row.appendChild(text);
    return row;
  }

  _fileIcon(path) {
    const ext = path.split('.').pop().toLowerCase();
    const map = { txt:'📄',md:'📄',js:'📜',html:'🌐',css:'🎨',json:'📋',png:'🖼️',jpg:'🖼️',mp3:'🎵',pdf:'📕' };
    return map[ext] || '📄';
  }

  async _getRecentFiles() {
    try {
      // Walk Documents, Desktop, Downloads for recently modified files
      const dirs = ['/Documents', '/Desktop', '/Downloads', '/Pictures'];
      const files = [];
      for (const dir of dirs) {
        const items = await this._fs.ls(dir) || [];
        for (const item of items) {
          if (item.type !== 'dir' && !item.name.startsWith('.')) {
            files.push({ path: dir + '/' + item.name, modified: item.modified || 0 });
          }
        }
      }
      return files.sort((a, b) => b.modified - a.modified).slice(0, 8);
    } catch { return []; }
  }
}
