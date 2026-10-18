/**
 * File type associations and the Open with picker.
 * .beep apps declare extensions in manifest.fileTypes; native apps declare
 * them when registered with the window manager.
 */

function extensionOf(name) {
  const leaf = String(name || '').split('/').pop();
  const dot = leaf.lastIndexOf('.');
  return dot > 0 ? leaf.slice(dot).toLowerCase() : '';
}

function appFileTypes(app) {
  const declared = Array.isArray(app.fileTypes) ? app.fileTypes : [];
  const legacy = app.kind === 'beep'
    ? ({ stage: ['.stage'], writer: ['.writer'] }[app.id] || [])
    : [];
  return [...new Set([...declared, ...legacy].map(type => {
    const value = String(type).trim().toLowerCase();
    return value.startsWith('.') ? value : '.' + value;
  }).filter(type => /^\.[a-z0-9][a-z0-9.+_-]*$/.test(type)))];
}

export function createFileAssociations({ wm, launcher, db, settings }) {
  async function listApps() {
    const native = wm.getSystemApps().map(app => ({
      key: 'native:' + app.id,
      id: app.id,
      kind: 'native',
      name: app.title || app.id,
      icon: app.icon || '🪟',
      fileTypes: appFileTypes({ ...app, kind: 'native' }),
    }));
    const installed = await db.apps.all();
    const beep = installed.map(app => ({
      key: 'beep:' + app.id,
      id: app.id,
      kind: 'beep',
      name: app.name || app.id,
      icon: app.icon || app.emoji || '⚡',
      fileTypes: appFileTypes({ ...app, kind: 'beep' }),
    }));
    return [...native, ...beep];
  }

  function showPicker(name, apps, extension) {
    return new Promise(resolve => {
      document.getElementById('bos-open-with-dialog')?.remove();
      const overlay = document.createElement('div');
      overlay.id = 'bos-open-with-dialog';
      overlay.style.cssText = 'position:fixed;inset:0;z-index:200000;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(5,8,18,.58);backdrop-filter:blur(10px);font-family:var(--wm-font,system-ui,sans-serif);color:var(--wm-text,#eee)';
      const panel = document.createElement('section');
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-modal', 'true');
      panel.setAttribute('aria-labelledby', 'bos-open-with-title');
      panel.style.cssText = 'width:min(480px,100%);max-height:80vh;display:flex;flex-direction:column;gap:12px;padding:18px;border:1px solid var(--wm-panel-border,rgba(255,255,255,.16));border-radius:14px;background:var(--wm-panel-bg,#18182a);box-shadow:0 24px 80px rgba(0,0,0,.5)';
      const title = document.createElement('h2');
      title.id = 'bos-open-with-title';
      title.textContent = 'Open ' + name;
      title.style.cssText = 'font-size:16px;margin:0';
      const subtitle = document.createElement('div');
      subtitle.textContent = extension ? 'Choose an app for ' + extension + ' files.' : 'Choose an app to open this file.';
      subtitle.style.cssText = 'font-size:12px;color:var(--wm-text-dim,#aaa)';
      const list = document.createElement('div');
      list.style.cssText = 'overflow:auto;display:flex;flex-direction:column;gap:6px';
      let selectedKey = apps[0]?.key || null;
      const rows = [];
      apps.forEach((app, index) => {
        const row = document.createElement('button');
        row.type = 'button';
        row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:10px;border:1px solid var(--wm-control-border,rgba(255,255,255,.12));border-radius:8px;background:var(--wm-control-bg,rgba(255,255,255,.06));color:inherit;text-align:left;cursor:pointer;font:inherit';
        const icon = document.createElement('span');
        icon.textContent = app.icon;
        icon.style.cssText = 'width:28px;text-align:center;font-size:20px';
        const label = document.createElement('span');
        label.textContent = app.name;
        label.style.cssText = 'flex:1;font-size:13px';
        const radio = document.createElement('span');
        radio.textContent = index === 0 ? '●' : '○';
        radio.setAttribute('aria-hidden', 'true');
        row.setAttribute('aria-pressed', String(index === 0));
        row.append(icon, label, radio);
        row.onclick = () => {
          selectedKey = app.key;
          rows.forEach(({ row: item, radio: dot }) => {
            const active = item.dataset.key === selectedKey;
            item.setAttribute('aria-pressed', String(active));
            dot.textContent = active ? '●' : '○';
            item.style.borderColor = active ? 'var(--wm-accent,#1687ed)' : 'var(--wm-control-border,rgba(255,255,255,.12))';
          });
        };
        row.dataset.key = app.key;
        rows.push({ row, radio });
        list.appendChild(row);
      });
      if (rows[0]) rows[0].row.style.borderColor = 'var(--wm-accent,#1687ed)';
      const actions = document.createElement('div');
      actions.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;padding-top:4px';
      const button = (label, primary, always) => {
        const el = document.createElement('button');
        el.type = 'button';
        el.textContent = label;
        el.style.cssText = 'padding:8px 12px;border:1px solid var(--wm-control-border,rgba(255,255,255,.16));border-radius:7px;background:' + (primary ? 'var(--wm-accent,#0878d1)' : 'var(--wm-control-bg,rgba(255,255,255,.08))') + ';color:inherit;cursor:pointer;font:inherit;font-size:12px';
        el.onclick = () => finish(selectedKey ? { key: selectedKey, always } : null);
        return el;
      };
      const finish = result => {
        overlay.remove();
        document.removeEventListener('keydown', onKey);
        resolve(result);
      };
      const onKey = event => {
        if (event.key === 'Escape') { event.preventDefault(); finish(null); }
      };
      document.addEventListener('keydown', onKey);
      actions.append(button('Cancel', false, false), button('Open once', false, false), button('Always use', true, true));
      panel.append(title, subtitle, list, actions);
      overlay.appendChild(panel);
      overlay.addEventListener('click', event => { if (event.target === overlay) finish(null); });
      document.body.appendChild(overlay);
      (rows[0]?.row || actions.querySelector('button'))?.focus();
    });
  }

  async function launch(handler, path) {
    try {
      if (handler.kind === 'native') wm.openSystemApp(handler.id, { file: path });
      else await launcher.launchById(handler.id, { file: path });
    } catch (error) {
      wm.notify('Could not open file: ' + error.message);
    }
  }

  async function chooseAndOpen(name, path, apps, extension) {
    if (!apps.length) {
      wm.notify('No apps are installed. Install an app that supports this file type.');
      return;
    }
    const result = await showPicker(name, apps, extension);
    if (!result) return;
    const handler = apps.find(app => app.key === result.key);
    if (!handler) return;
    if (result.always && extension) {
      const associations = { ...(settings.get('fileAssociations') || {}), [extension]: handler.key };
      await settings.set('fileAssociations', associations);
    }
    await launch(handler, path);
  }

  async function open(path, name, { choose = false } = {}) {
    if (String(name).toLowerCase().endsWith('.beep')) {
      try { await launcher.launch(path); }
      catch (error) { wm.notify('Could not open app: ' + error.message); }
      return;
    }
    const extension = extensionOf(name);
    const apps = await listApps();
    const handlers = apps.filter(app => app.fileTypes.includes(extension));
    const associations = settings.get('fileAssociations') || {};
    const defaultKey = associations[extension];
    const savedDefault = handlers.find(app => app.key === defaultKey);
    if (!choose && savedDefault) {
      await launch(savedDefault, path);
      return;
    }
    if (!choose && handlers.length === 1) {
      await launch(handlers[0], path);
      return;
    }
    if (handlers.length) {
      await chooseAndOpen(name, path, handlers, extension);
      return;
    }
    if (choose) {
      await chooseAndOpen(name, path, apps, extension);
      return;
    }
    wm.notify(extension
      ? 'No app is associated with ' + extension + ' files. Use Open with to choose one.'
      : 'No app is associated with this file. Use Open with to choose one.');
  }

  return { open, openWith: (path, name) => open(path, name, { choose: true }) };
}
