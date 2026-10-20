import { isImageFile } from './imageviewer.js';
import { filesWidget } from './widgets.js';
import { styleNativeApp } from '../ui/native-layout.js';

const TRASH_VIEW = '::recycle-bin::';

/**
 * BrowserOS v2 — File Manager (Native System Component)
 * src/shell/filemanager.js
 *
 * Native app — not a .beep. Registered with WM via registerSystemApp.
 * Direct FS access, full drag-and-drop support.
 */

export function registerFileManager({ wm, fs, db, launcher, kernel, settings, fileAssociations }) {

  wm.registerSystemApp('filemanager', {
    title:  'File Manager',
    icon:   '📁',
    widgets: [filesWidget],
    width:  760,
    height: 520,
    mount(container, instanceId, args = {}) {
      let cwd = args.path || '/';
      const history = ['/'];
      let histIdx = 0;
      let selected = null;
      let clipboard = null;

      styleNativeApp(container, 'files');

      // ── Toolbar ──────────────────────────────────────────────────────────────
      const toolbar = document.createElement('div');
      toolbar.className = 'bos-native-toolbar';

      function mkBtn(t, title) {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = t; b.title = title || t;
        return b;
      }

      const backBtn     = mkBtn('◀', 'Back');
      const upBtn       = mkBtn('▲', 'Up');
      const pathInput   = document.createElement('input');
      pathInput.className = 'bos-native-path';
      pathInput.setAttribute('aria-label', 'Current folder');
      pathInput.readOnly = true;
      const newFolderBtn = mkBtn('+ Folder');
      const newFileBtn   = mkBtn('+ File');
      const importBtn    = mkBtn('⬆ Import', 'Import from your computer');
      const refreshBtn   = mkBtn('⟳', 'Refresh');
      const emptyTrashBtn = mkBtn('🗑️ Empty Bin', 'Permanently delete everything in the Recycle Bin');
      emptyTrashBtn.style.display = 'none';
      const fileInput    = document.createElement('input');
      fileInput.type = 'file'; fileInput.multiple = true; fileInput.style.display = 'none';

      [backBtn, upBtn, pathInput, newFolderBtn, newFileBtn, importBtn, refreshBtn, emptyTrashBtn, fileInput].forEach(el => toolbar.appendChild(el));
      container.appendChild(toolbar);

      // ── Layout ────────────────────────────────────────────────────────────────
      const layout = document.createElement('div');
      layout.className = 'bos-native-file-layout';
      container.appendChild(layout);

      // Sidebar
      const sidebar = document.createElement('nav');
      sidebar.className = 'bos-native-sidebar';
      sidebar.setAttribute('aria-label', 'File locations');
      layout.appendChild(sidebar);

      const SIDEBAR_ITEMS = [
        { label: '🏠 Home',       path: '/' },
        { label: '🖥️ Desktop',    path: '/Desktop' },
        { label: '📄 Documents',  path: '/Documents' },
        { label: '🖼️ Pictures',   path: '/Pictures' },
        { label: '⬇️ Downloads',  path: '/Downloads' },
        { label: '🎵 Music',      path: '/Music' },
        { label: '🗑️ Recycle Bin', path: TRASH_VIEW },
        { label: '⚡ Apps',       path: '/Apps' },
      ];

      function renderSidebar() {
        // Keep navigation nodes alive so selection can fade between locations
        // and keyboard focus survives a folder refresh.
        if (!sidebar.children.length) SIDEBAR_ITEMS.forEach(item => {
          const el = document.createElement('button');
          el.type = 'button';
          el.className = 'bos-fm-sidebar-item bos-native-nav-item';
          el.dataset.path = item.path;
          el.textContent = item.label;
          el.onclick = () => navigate(item.path);
          sidebar.appendChild(el);
        });
        sidebar.querySelectorAll('.bos-fm-sidebar-item').forEach(button => {
          if (cwd === button.dataset.path) button.setAttribute('aria-current', 'page');
          else button.removeAttribute('aria-current');
        });
      }

      // Main area
      const mainArea = document.createElement('div');
      mainArea.className = 'bos-native-file-content';
      layout.appendChild(mainArea);

      const grid = document.createElement('div');
      grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(80px,1fr));gap:4px;padding:8px;align-content:start';
      mainArea.appendChild(grid);

      // Status bar
      const statusBar = document.createElement('div');
      statusBar.className = 'bos-native-status';
      container.appendChild(statusBar);

      // ── Helpers ───────────────────────────────────────────────────────────────

      function fileIcon(name, type) {
        if (type === 'dir') return '📁';
        const ext = name.split('.').pop().toLowerCase();
        const map = { txt:'📄', md:'📄', js:'📜', html:'🌐', css:'🎨', json:'📋', png:'🖼️', jpg:'🖼️', jpeg:'🖼️', gif:'🖼️', mp3:'🎵', mp4:'🎬', webm:'🎬', m4v:'🎬', mov:'🎬', ogv:'🎬', pdf:'📕', beep:'⚡' };
        return map[ext] || '📄';
      }

      function fullPath(name) { return (cwd === '/' ? '' : cwd) + '/' + name; }

      async function createFile(path, content) {
        const result = await fs.writeUnique(path, content);
        if (!result.ok) {
          wm.notify('Create failed: ' + result.error);
          return result;
        }
        if (result.path !== path) {
          wm.notify('Name already exists; created "' + result.path.split('/').pop() + '" instead');
        }
        return result;
      }

      function navigate(path) {
        cwd = path;
        histIdx = history.length;
        history.push(path);
        render();
      }

      // ── Render ────────────────────────────────────────────────────────────────

      async function render() {
        pathInput.value = cwd === TRASH_VIEW ? 'Recycle Bin' : cwd;
        selected = null;
        grid.innerHTML = '';
        renderSidebar();
        const inTrash = cwd === TRASH_VIEW;
        [newFolderBtn, newFileBtn, importBtn].forEach(button => { button.style.display = inTrash ? 'none' : ''; });
        emptyTrashBtn.style.display = inTrash ? '' : 'none';
        if (!inTrash) {
          grid.style.display = 'grid';
          grid.style.flexDirection = '';
          grid.style.alignContent = 'start';
          grid.style.gap = '4px';
        } else {
          mainArea.oncontextmenu = null;
        }
        if (inTrash) {
          await renderTrash();
          return;
        }

        // Special case: /Apps shows all installed apps from DB + native system apps
        if (cwd === '/Apps') {
          await renderAppsDir();
          return;
        }

        const items = await fs.ls(cwd);
        if (!items) { grid.innerHTML = '<div style="padding:16px;color:var(--wm-text-dim)">Cannot read directory</div>'; return; }
        statusBar.textContent = items.length + ' item' + (items.length !== 1 ? 's' : '');

        items.forEach(item => {
          const el = document.createElement('div');
          el.style.cssText = 'display:flex;flex-direction:column;align-items:center;padding:8px 4px;border-radius:6px;cursor:pointer;text-align:center;transition:background 0.1s;font-size:11px;width:80px;height:90px;overflow:hidden;flex-shrink:0';

          // Get beep app icon/name from DB
          let iconHtml = '<span style="font-size:30px">' + fileIcon(item.name, item.type) + '</span>';
          let label = item.name;

          if (item.name.endsWith('.beep')) {
            db.apps.get(item.name.replace(/\.beep$/, '')).then(app => {
              if (app) {
                const iconEl = el.querySelector('.fm-icon');
                const labelEl = el.querySelector('.fm-label');
                if (iconEl) {
                  if (app.icon && app.icon.startsWith('data:')) {
                    iconEl.innerHTML = '<img src="' + app.icon + '" style="width:30px;height:30px;border-radius:4px;object-fit:cover">';
                  } else {
                    iconEl.textContent = app.emoji || '⚡';
                  }
                }
                if (labelEl) labelEl.textContent = app.name;
              }
            });
          }

          el.innerHTML = '<span class="fm-icon" style="font-size:30px;display:block">' + fileIcon(item.name, item.type) + '</span>' +
            '<span class="fm-label" style="margin-top:4px;word-break:break-word;color:var(--wm-text);font-size:11px;line-height:1.2;max-height:2.4em;overflow:hidden">' + label + '</span>';

          el.onclick = e => {
            grid.querySelectorAll('[data-selected]').forEach(s => { s.style.background = ''; s.removeAttribute('data-selected'); });
            el.style.background = 'rgba(0,120,212,0.2)';
            el.setAttribute('data-selected', '1');
            selected = item.name;
            statusBar.textContent = item.name;
            e.stopPropagation();
          };

          el.ondblclick = () => {
            if (item.type === 'dir') navigate(fullPath(item.name));
            else openFile(fullPath(item.name), item.name);
          };

          el.oncontextmenu = e => { e.preventDefault(); e.stopPropagation(); showItemMenu(e.clientX, e.clientY, item); };

          // ── Drag from FM to desktop ─────────────────────────────────────────
          let dragStartX, dragStartY, didDrag = false;

          el.addEventListener('mousedown', e => {
            if (e.button !== 0) return;
            didDrag = false;
            dragStartX = e.clientX; dragStartY = e.clientY;

            const onMove = e2 => {
              if (!didDrag && Math.abs(e2.clientX - dragStartX) < 6 && Math.abs(e2.clientY - dragStartY) < 6) return;
              if (!didDrag) {
                didDrag = true;
                // Start OS-level drag — pointer events on iframes disabled, parent handles mouse
                wm.startDrag(instanceId, fullPath(item.name), item.name, fileIcon(item.name, item.type));
              }
            };

            const onUp = () => {
              document.removeEventListener('mousemove', onMove);
              document.removeEventListener('mouseup', onUp);
              // endDrag is handled by WM's own mouseup listener
            };

            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
          });

          // ── Drop target (folder) ────────────────────────────────────────────
          if (item.type === 'dir') {
            el.addEventListener('dragover', e => { e.preventDefault(); el.style.outline = '2px solid var(--wm-accent)'; el.style.background = 'rgba(0,120,212,0.2)'; });
            el.addEventListener('dragleave', () => { el.style.outline = ''; el.style.background = ''; });
            el.addEventListener('drop', async e => {
              e.preventDefault(); el.style.outline = ''; el.style.background = '';
              const srcPath = e.dataTransfer.getData('text/plain');
              if (!srcPath || srcPath === fullPath(item.name)) return;
              const filename = srcPath.split('/').pop();
              const result = await fs.move(srcPath, fullPath(item.name) + '/' + filename);
              if (!result.ok) { wm.notify('Move failed: ' + result.error); return; }
              render();
              wm.notify('Moved "' + filename + '" into "' + item.name + '"');
            });
          }

          grid.appendChild(el);
        });

        // Blank area context menu
        mainArea.oncontextmenu = e => {
          if (e.target.closest('[data-selected]')) return;
          e.preventDefault();
          showBlankMenu(e.clientX, e.clientY);
        };

        // Deselect on blank click
        grid.onclick = e => {
          if (!e.target.closest('[data-selected]')) {
            grid.querySelectorAll('[data-selected]').forEach(s => { s.style.background = ''; s.removeAttribute('data-selected'); });
            selected = null;
          }
        };

        // Drop zone for host OS files and desktop drag
        mainArea.classList.add('bos-fm-dropzone');
        mainArea.addEventListener('dragover', e => {
          if (cwd === TRASH_VIEW || !e.dataTransfer.types.includes('Files')) return;
          e.preventDefault();
          mainArea.style.outline = '2px dashed var(--wm-accent)';
          mainArea.style.background = 'rgba(0,120,212,0.05)';
        });
        mainArea.addEventListener('dragleave', () => { mainArea.style.outline = ''; mainArea.style.background = ''; });
        mainArea.addEventListener('drop', async e => {
          if (cwd === TRASH_VIEW) return;
          e.preventDefault();
          mainArea.style.outline = ''; mainArea.style.background = '';
          const files = Array.from(e.dataTransfer.files);
          if (!files.length) return;
          statusBar.textContent = 'Importing ' + files.length + ' file(s)...';
          let done = 0;
          files.forEach(file => {
            const reader = new FileReader();
            const isText = file.type.startsWith('text/') || /\.(txt|md|js|json|html|css|csv|xml|svg|beep|writer|stage)$/i.test(file.name);
            reader.onload = async e2 => {
              await createFile(fullPath(file.name), e2.target.result);
              done++;
              if (done === files.length) { render(); statusBar.textContent = 'Imported ' + done + ' file(s)'; }
            };
            if (isText) reader.readAsText(file); else reader.readAsDataURL(file);
          });
        });

      }

      async function renderTrash() {
        grid.style.display = 'flex';
        grid.style.flexDirection = 'column';
        grid.style.alignContent = 'stretch';
        grid.style.gap = '6px';
        const items = await fs.listTrash();
        statusBar.textContent = items.length + ' item' + (items.length === 1 ? '' : 's') + ' in Recycle Bin';
        if (!items.length) {
          grid.innerHTML = '<div style="padding:16px;color:var(--wm-text-dim)">Recycle Bin is empty</div>';
          emptyTrashBtn.disabled = true;
          return;
        }
        emptyTrashBtn.disabled = false;
        items.forEach(item => {
          const row = document.createElement('div');
          row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:9px 10px;border:1px solid var(--wm-border);border-radius:7px;background:rgba(255,255,255,.03);min-height:54px';
          const icon = document.createElement('span');
          icon.style.cssText = 'font-size:24px';
          icon.textContent = fileIcon(item.originalName, item.originalType);
          const details = document.createElement('div');
          details.style.cssText = 'flex:1;min-width:0';
          const name = document.createElement('div');
          name.style.cssText = 'font-size:13px;color:var(--wm-text);word-break:break-word';
          name.textContent = item.originalName;
          const date = document.createElement('div');
          date.style.cssText = 'font-size:11px;color:var(--wm-text-dim);margin-top:2px';
          date.textContent = 'Deleted ' + new Date(item.deletedAt).toLocaleString() + ' · ' + item.originalPath;
          details.append(name, date);
          const restore = mkBtn('↩ Restore');
          restore.onclick = async () => {
            restore.disabled = true;
            const result = await fs.restoreTrash(item.id);
            if (!result.ok) { wm.notify('Restore failed: ' + result.error); restore.disabled = false; return; }
            wm.notify('Restored to ' + result.path);
            render();
          };
          const remove = mkBtn('Permanently Delete');
          remove.style.cssText += ';color:#ff8888;border-color:rgba(200,50,50,.35)';
          remove.onclick = async () => {
            if (!confirm('Permanently delete "' + item.originalName + '" and its contents? This cannot be undone.')) return;
            const result = await fs.permanentlyDeleteTrash(item.id);
            if (!result.ok) { wm.notify('Delete failed: ' + result.error); return; }
            render();
          };
          row.append(icon, details, restore, remove);
          grid.appendChild(row);
        });
      }

      // ── /Apps virtual directory ───────────────────────────────────────────────

      async function renderAppsDir() {
        const allApps = await db.apps.all();
        const nativeApps = [];
        for (const [id, sys] of wm._systemApps) {
          nativeApps.push({ id, name: sys.title, emoji: sys.icon, icon: null, native: true });
        }

        const combined = [
          ...nativeApps,
          ...allApps.filter(a => !nativeApps.find(n => n.id === a.id)),
        ].sort((a, b) => a.name.localeCompare(b.name));

        statusBar.textContent = combined.length + ' app' + (combined.length !== 1 ? 's' : '') + ' installed';

        if (!combined.length) {
          grid.innerHTML = '<div style="padding:16px;color:var(--wm-text-dim)">No apps installed</div>';
          return;
        }

        combined.forEach(app => {
          const el = document.createElement('div');
          el.style.cssText = 'display:flex;flex-direction:column;align-items:center;padding:8px 4px;border-radius:6px;cursor:pointer;text-align:center;transition:background 0.1s;font-size:11px;width:80px;height:90px;overflow:hidden;flex-shrink:0';

          const iconEl = document.createElement('div');
          iconEl.style.cssText = 'font-size:30px;display:flex;align-items:center;justify-content:center;width:100%';
          if (app.icon && app.icon.startsWith('data:')) {
            iconEl.innerHTML = '<img src="' + app.icon + '" style="width:30px;height:30px;border-radius:4px;object-fit:cover">';
          } else {
            iconEl.textContent = app.emoji || '⚡';
          }

          const labelEl = document.createElement('div');
          labelEl.style.cssText = 'margin-top:4px;word-break:break-word;color:var(--wm-text);font-size:11px;line-height:1.2;max-height:2.4em;overflow:hidden';
          labelEl.textContent = app.name;

          el.appendChild(iconEl);
          el.appendChild(labelEl);

          el.onmouseenter = () => el.style.background = 'rgba(255,255,255,0.08)';
          el.onmouseleave = () => { if (!el.hasAttribute('data-selected')) el.style.background = ''; };
          el.onclick = e => {
            grid.querySelectorAll('[data-selected]').forEach(s => { s.style.background = ''; s.removeAttribute('data-selected'); });
            el.style.background = 'rgba(0,120,212,0.2)';
            el.setAttribute('data-selected', '1');
            statusBar.textContent = app.name + (app.native ? ' (native)' : ' v' + (app.version || '?'));
            e.stopPropagation();
          };
          el.ondblclick = () => {
            if (app.native) wm.openSystemApp(app.id);
            else launcher.launchById(app.id);
          };

          grid.appendChild(el);
        });

        grid.onclick = e => {
          if (!e.target.closest('[data-selected]')) {
            grid.querySelectorAll('[data-selected]').forEach(s => { s.style.background = ''; s.removeAttribute('data-selected'); });
          }
        };
      }

      // ── File opening ──────────────────────────────────────────────────────────

      async function openFile(path, name, choose = false) {
        await fileAssociations.open(path, name, { choose });
      }

      // ── Context menus ─────────────────────────────────────────────────────────

      function showItemMenu(x, y, item) {
        const isImage = isImageFile(item.name);
        const items = [
          { label: '📂 Open', action: () => {
            if (item.type === 'dir') navigate(fullPath(item.name));
            else openFile(fullPath(item.name), item.name);
          }},
        ];
        if (item.type === 'file' && !item.name.toLowerCase().endsWith('.beep')) {
          items.push({ label: '🧭 Open with', action: () => openFile(fullPath(item.name), item.name, true) });
        }
        if (isImage && item.type === 'file') {
          items.push({ label: '🎨 Open in Paint', action: () => wm.openSystemApp('paint', { file: fullPath(item.name) }) });
        }
        items.push('sep');
        items.push(
          { label: '✂️ Cut', action: () => {
            clipboard = { op: 'cut', path: fullPath(item.name), name: item.name };
            statusBar.textContent = 'Cut: ' + item.name;
          }},
          { label: '📋 Copy', action: () => {
            clipboard = { op: 'copy', path: fullPath(item.name), name: item.name };
            statusBar.textContent = 'Copied: ' + item.name;
          }},
          'sep',
          { label: '✏️ Rename', action: async () => {
            const nn = prompt('New name:', item.name);
            if (nn && nn !== item.name) { await fs.rename(fullPath(item.name), nn); render(); }
          }},
          { label: '🗑️ Move to Recycle Bin', action: async () => {
            if (!confirm('Move "' + item.name + '" to the Recycle Bin?')) return;
            const res = await fs.rm(fullPath(item.name));
            if (res.ok) render(); else wm.notify('Delete failed: ' + res.error);
          }}
        );
        showMenu(x, y, items);
      }

      function showBlankMenu(x, y) {
        const items = [
          { label: '📁 New Folder', action: async () => {
            const name = prompt('Folder name:');
            if (name) { await fs.mkdir(fullPath(name)); render(); }
          }},
          { label: '📄 New File', action: async () => {
            const name = prompt('File name:', 'untitled.txt');
            if (name) { await createFile(fullPath(name), ''); render(); }
          }},
          'sep',
        ];
        if (clipboard) {
          items.push({ label: '📋 Paste "' + clipboard.name + '"', action: async () => {
            const destPath = fullPath(clipboard.name);
            if (clipboard.op === 'cut') {
              const result = await fs.move(clipboard.path, destPath);
              if (!result.ok) { wm.notify('Move failed: ' + result.error); return; }
            } else {
              const content = await fs.read(clipboard.path);
              if (content === null) { wm.notify('Could not copy: ' + clipboard.name); return; }
              const result = await createFile(destPath, content);
              if (!result.ok) return;
            }
            clipboard = null; render();
          }});
          items.push('sep');
        }
        items.push({ label: '⟳ Refresh', action: render });
        showMenu(x, y, items);
      }

      function showMenu(x, y, items) {
        document.getElementById('bos-ctx-menu')?.remove();
        const menu = document.createElement('div');
        menu.id = 'bos-ctx-menu';
        menu.style.cssText = 'position:fixed;left:' + Math.min(x, window.innerWidth - 200) + 'px;' +
          'top:' + Math.min(y, window.innerHeight - items.length * 34) + 'px;' +
          'background:var(--wm-panel-bg);backdrop-filter:var(--wm-backdrop-filter);border:1px solid var(--wm-panel-border);' +
          'border-radius:8px;padding:4px;z-index:99999;min-width:180px;box-shadow:0 8px 32px rgba(0,0,0,0.5)';
        items.forEach(item => {
          if (item === 'sep') {
            const s = document.createElement('div'); s.style.cssText = 'height:1px;background:rgba(255,255,255,0.1);margin:4px 0'; menu.appendChild(s);
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

      // ── Toolbar actions ───────────────────────────────────────────────────────

      backBtn.onclick = () => { if (histIdx > 0) { histIdx--; cwd = history[histIdx]; render(); }};
      upBtn.onclick   = () => {
        if (cwd === '/') return;
        const parts = cwd.split('/').filter(Boolean); parts.pop();
        navigate('/' + parts.join('/') || '/');
      };
      newFolderBtn.onclick = async () => { const n = prompt('Folder name:'); if (n) { await fs.mkdir(fullPath(n)); render(); }};
      newFileBtn.onclick   = async () => { const n = prompt('File name:', 'untitled.txt'); if (n) { await createFile(fullPath(n), ''); render(); }};
      refreshBtn.onclick   = render;
      emptyTrashBtn.onclick = async () => {
        const items = await fs.listTrash();
        if (!items.length || !confirm('Permanently delete all ' + items.length + ' item(s) in the Recycle Bin? This cannot be undone.')) return;
        const result = await fs.emptyTrash();
        if (!result.ok) { wm.notify('Could not empty the Recycle Bin'); return; }
        render();
      };
      importBtn.onclick    = () => fileInput.click();

      fileInput.onchange = async () => {
        const files = Array.from(fileInput.files);
        if (!files.length) return;
        statusBar.textContent = 'Importing ' + files.length + ' file(s)...';
        let done = 0;
        files.forEach(file => {
          const reader = new FileReader();
          const isText = file.type.startsWith('text/') || /\.(txt|md|js|json|html|css|csv|xml|svg|beep)$/i.test(file.name);
          reader.onload = async e => {
            await createFile(fullPath(file.name), e.target.result);
            done++;
            if (done === files.length) { render(); statusBar.textContent = 'Imported ' + done + ' file(s)'; }
          };
          if (isText) reader.readAsText(file); else reader.readAsDataURL(file);
        });
        fileInput.value = '';
      };

      // Receive desktop drags once per File Manager window, not once per render.
      const handleDesktopDrop = async e => {
        const { path, targetPath, targetInstanceId, onMoved } = e.detail || {};
        if (!path || !targetInstanceId || targetInstanceId !== instanceId) return;
        const filename = path.split('/').pop();
        const destFolder = targetPath || cwd;
        const destPath = (destFolder === '/' ? '' : destFolder) + '/' + filename;
        if (path === destPath) return;

        const source = await fs.stat(path);
        const normalizedSource = path.replace(/\/+$/, '');
        if (source?.type === 'dir' && destPath.startsWith(normalizedSource + '/')) {
          wm.notify('Cannot move a folder into itself or one of its subfolders');
          return;
        }

        const result = await fs.move(path, destPath);
        if (!result.ok) {
          wm.notify('Could not move "' + filename + '": ' + result.error);
          return;
        }
        if (typeof onMoved === 'function') onMoved(destPath);
        render();
        wm.notify('Moved "' + filename + '" to ' + destFolder);
      };
      document.addEventListener('bos:dropOnFM', handleDesktopDrop);

      render();
      return () => document.removeEventListener('bos:dropOnFM', handleDesktopDrop);
    }
  });
}


