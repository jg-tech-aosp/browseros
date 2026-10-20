/**
 * BrowserOS v2 — Settings App
 * src/ui/settings-app.js
 *
 * Native system app — not a .beep.
 * Registered with the WM via wm.registerSystemApp('settings', ...).
 * Has direct access to the Settings store and kernel for live changes.
 */

/**
 * Keep a bounded console history for the Developer / Debug page.
 * Original console methods still run; entries stay in memory only.
 */
import { THEMES, WALLPAPERS, resolveWallpaper, DEFAULT_THEME, DEFAULT_LIGHT_THEME } from './themes.js';
import { availableWidgets, setWidgetEnabled } from '../shell/widgets.js';
import { boundedNumber } from './clear-ice.js';
import { styleNativeApp } from './native-layout.js';
import { createGlassSwitch, setGlassSwitch } from './glass-switch.js';

const DEBUG_LOG_LIMIT = 500;
const DEBUG_LOGS = [];
function formatDebugValue(value) {
  if (value instanceof Error) return value.stack || value.message;
  if (typeof value === 'string') return value;
  try {
    const seen = new WeakSet();
    const json = JSON.stringify(value, function(key, item) {
      if (item && typeof item === 'object') {
        if (seen.has(item)) return '[Circular]';
        seen.add(item);
      }
      return item;
    });
    return json === undefined ? String(value) : json;
  } catch (_) {
    return String(value);
  }
}
(function captureConsole() {
  ['log', 'info', 'warn', 'error', 'debug'].forEach(function(level) {
    const original = console[level] && console[level].bind(console);
    if (!original) return;
    const wrapped = function() {
      const args = Array.from(arguments);
      DEBUG_LOGS.push({
        time: new Date().toISOString(),
        level: level,
        message: args.map(formatDebugValue).join(' '),
      });
      if (DEBUG_LOGS.length > DEBUG_LOG_LIMIT) DEBUG_LOGS.shift();
      original.apply(console, args);
    };
    console[level] = wrapped;
  });
})();

export function registerSettingsApp({ wm, settings, kernel, db, fs }) {

  wm.registerSystemApp('settings', {
    title:  'Settings',
    icon:   '⚙️',
    width:  720,
    height: 520,
    mount(container, instanceId, args = {}) {
      styleNativeApp(container, 'settings');

      // ── Sidebar ─────────────────────────────────────────────────────────────
      var sidebar = document.createElement('nav');
      sidebar.className = 'bos-native-sidebar';
      sidebar.setAttribute('aria-label', 'Settings sections');

      var SECTIONS = [
        { id:'appearance', label:'🎨 Appearance' },
        { id:'widgets',    label:'🧩 Widgets' },
        { id:'display',    label:'🖥️ Display' },
        { id:'accessibility', label:'♿ Accessibility' },
        { id:'apps',       label:'📦 Apps' },
        { id:'storage',    label:'💾 Storage' },
        { id:'system',     label:'⚙️ System' },
        { id:'developer',  label:'🛠️ Developer / Debug' },
      ];

      var main = document.createElement('div');
      main.className = 'bos-native-settings-main';

      SECTIONS.forEach(function(sec) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'bos-native-nav-item';
        btn.textContent = sec.label;
        btn.dataset.section = sec.id;
        btn.onclick = function() {
          sidebar.querySelectorAll('[data-active]').forEach(function(b) {
            b.removeAttribute('data-active');
            b.removeAttribute('aria-current');
          });
          btn.setAttribute('data-active', '1');
          btn.setAttribute('aria-current', 'page');
          renderSection(sec.id, main);
        };
        sidebar.appendChild(btn);
      });

      container.appendChild(sidebar);
      container.appendChild(main);

      // Activate first section
      (sidebar.querySelector('[data-section="' + (SECTIONS.some(section => section.id === args.section) ? args.section : 'appearance') + '"]') || sidebar.firstChild).click();
      return function() { main._iceCleanup?.(); wm.applyGlassPreferences(settings.getTheme()); };
    }
  });

  // ── Section renderers ────────────────────────────────────────────────────────

  function renderSection(id, main) {
    main._iceCleanup?.(); main._iceCleanup = null;
    wm.applyGlassPreferences(settings.getTheme());
    main.innerHTML = '';

    if (id === 'appearance') renderAppearance(main);
    else if (id === 'widgets') renderWidgets(main);
    else if (id === 'display')    renderDisplay(main);
    else if (id === 'accessibility') renderAccessibility(main);
    else if (id === 'apps')       renderApps(main);
    else if (id === 'storage')    renderStorage(main);
    else if (id === 'system')     renderSystem(main);
    else if (id === 'developer') renderDeveloper(main);
  }

  function h2(text) {
    var el = document.createElement('h2');
    el.style.cssText = 'font-size:20px;margin-bottom:20px;color:var(--wm-text)';
    el.textContent = text;
    return el;
  }

  function row(label, sub, control) {
    var el = document.createElement('div');
    el.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:12px 0;border-bottom:1px solid rgba(255,255,255,0.05)';
    var left = document.createElement('div');
    var labelEl = document.createElement('div');
    labelEl.style.cssText = 'font-size:14px;color:var(--wm-text)';
    labelEl.textContent = label;
    left.appendChild(labelEl);
    if (sub) {
      var subEl = document.createElement('div');
      subEl.style.cssText = 'font-size:12px;color:var(--wm-text-dim);margin-top:2px';
      subEl.textContent = sub;
      left.appendChild(subEl);
    }
    el.appendChild(left);
    if (control) {
      if (control.getAttribute('role') === 'switch' && !control.hasAttribute('aria-label')) control.setAttribute('aria-label', label);
      el.appendChild(control);
    }
    return el;
  }

  function toggle(value, onChange) {
    var el = createGlassSwitch(value);
    el.onclick = async function() {
      var previous = el.getAttribute('aria-checked') === 'true';
      setGlassSwitch(el, !previous);
      el.disabled = true;
      el.setAttribute('aria-busy', 'true');
      try { await onChange(!previous); }
      catch (error) {
        setGlassSwitch(el, previous);
        wm.notify('Could not save setting: ' + error.message);
      } finally { el.disabled = false; el.removeAttribute('aria-busy'); }
    };
    return el;
  }

  // ── Appearance ───────────────────────────────────────────────────────────────

  function renderAppearance(main) {
    main._iceCleanup?.(); main._iceCleanup = null;
    main.appendChild(h2('Appearance'));

    var theme = settings.getAll();

    var presetLabel = document.createElement('p');
    presetLabel.textContent = 'Themes change the wallpaper, accent, and app colors together. You can customize each setting below.';
    presetLabel.style.cssText = 'font-size:12px;line-height:1.5;color:var(--wm-text-dim);margin-bottom:14px';
    main.appendChild(presetLabel);
    var themeGrid = document.createElement('div');
    themeGrid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:20px';
    THEMES.forEach(function(preset) {
      var card = document.createElement('button');
      card.type = 'button';
      card.dataset.themeId = preset.id;
      card.title = preset.description;
      card.setAttribute('aria-pressed', String((theme.themeId || DEFAULT_THEME.id) === preset.id));
      card.style.cssText = 'min-width:0;padding:0;overflow:hidden;text-align:left;border:2px solid ' + ((theme.themeId || DEFAULT_THEME.id) === preset.id ? 'var(--wm-accent)' : 'var(--wm-control-border)') + ';border-radius:10px;background:var(--wm-control-bg);color:var(--wm-text);cursor:pointer;font:inherit';
      var preview = document.createElement('div');
      preview.style.cssText = 'height:82px;position:relative;overflow:hidden';
      preview.style.background = resolveWallpaper(preset.wallpaper, preset.darkMode).replace(' fixed', '');
      var palette = preset[preset.darkMode ? 'dark' : 'light'];
      var windowPreview = document.createElement('div');
      windowPreview.style.cssText = 'position:absolute;left:22%;right:14%;top:17px;height:46px;border-radius:5px;background:' + palette[0] + ';border:1px solid ' + palette[3] + ';overflow:hidden;box-shadow:0 3px 10px #0003';
      var titlePreview = document.createElement('div');
      titlePreview.style.cssText = 'height:12px;background:' + palette[1] + ';border-bottom:2px solid ' + preset.accent;
      windowPreview.appendChild(titlePreview);
      var taskbarPreview = document.createElement('div');
      taskbarPreview.style.cssText = 'position:absolute;bottom:0;left:0;right:0;height:9px;background:' + palette[5];
      preview.append(windowPreview, taskbarPreview);
      var label = document.createElement('div');
      label.textContent = preset.name;
      label.style.cssText = 'padding:8px 10px;font-size:12px;font-weight:600';
      card.append(preview, label);
      card.onclick = async function() {
        themeGrid.querySelectorAll('button').forEach(function(button) { button.disabled = true; });
        try {
          await settings.setMany({ themeId: preset.id, accent: preset.accent, wallpaper: preset.wallpaper, darkMode: preset.darkMode, transparency: true });
          var scroll = main.scrollTop;
          main.replaceChildren();
          renderAppearance(main);
          main.scrollTop = scroll;
          main.querySelector('[data-theme-id="' + preset.id + '"]')?.focus({ preventScroll: true });
        } catch (_) { wm.notify('Could not save theme'); themeGrid.querySelectorAll('button').forEach(function(button) { button.disabled = false; }); }
      };
      themeGrid.appendChild(card);
    });
    main.appendChild(themeGrid);

    // Accent colors
    var accentRow = row('Accent Color', 'Used for highlights and active elements');
    var swatches = document.createElement('div');
    swatches.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;max-width:220px';
    var ACCENTS = ['#0078d4','#e81123','#107c10','#ff8c00','#8764b8','#00b294','#ca5010','#038387'];
    ACCENTS.forEach(function(c) {
      var sw = document.createElement('div');
      sw.style.cssText = 'width:28px;height:28px;border-radius:50%;background:' + c + ';cursor:pointer;border:2px solid ' + (theme.accent === c ? '#fff' : 'transparent') + ';transition:border 0.15s';
      sw.onclick = async function() {
        await settings.set('accent', c);
        document.documentElement.style.setProperty('--wm-accent', c);
        swatches.querySelectorAll('div').forEach(function(s) { s.style.borderColor = 'transparent'; });
        sw.style.borderColor = '#fff';
        kernel.broadcast('themeChanged', settings.getTheme());
      };
      swatches.appendChild(sw);
    });
    accentRow.appendChild(swatches);
    main.appendChild(accentRow);

    // Wallpapers
    var wpLabel = document.createElement('div');
    wpLabel.style.cssText = 'font-size:14px;color:var(--wm-text);margin:16px 0 10px';
    wpLabel.textContent = 'Wallpaper';
    main.appendChild(wpLabel);

    var wpGrid = document.createElement('div');
    wpGrid.style.cssText = 'display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:16px';
    WALLPAPERS.forEach(function(wp) {
      var el = document.createElement('button');
      el.type = 'button';
      el.dataset.wallpaper = wp.label;
      el.setAttribute('aria-pressed', String(theme.wallpaper === wp.val));
      el.style.cssText = 'padding:0;background:var(--wm-control-bg);border-radius:8px;overflow:hidden;cursor:pointer;border:2px solid ' + (theme.wallpaper === wp.val ? 'var(--wm-accent)' : 'transparent') + ';transition:border 0.15s';
      var preview = document.createElement('div');
      preview.style.height = '52px';
      preview.style.background = resolveWallpaper(wp.val).replace(' fixed', '');
      var label = document.createElement('div');
      label.textContent = wp.label;
      label.style.cssText = 'font-size:11px;text-align:center;padding:4px;color:var(--wm-text)';
      el.append(preview, label);
      el.onclick = async function() {
        await settings.set('wallpaper', wp.val);
        wpGrid.querySelectorAll('[data-wallpaper]').forEach(function(s) { s.style.borderColor = 'transparent'; s.setAttribute('aria-pressed', 'false'); });
        el.style.borderColor = 'var(--wm-accent)';
        el.setAttribute('aria-pressed', 'true');
        kernel.broadcast('themeChanged', settings.getTheme());
      };
      wpGrid.appendChild(el);
    });
    main.appendChild(wpGrid);

    // Pick an image already stored in BrowserOS instead of importing a new file.
    var chooseWallpaper = document.createElement('button');
    chooseWallpaper.type = 'button';
    chooseWallpaper.textContent = 'Choose picture from Files';
    chooseWallpaper.style.cssText = 'padding:8px 12px;margin:0 0 12px;border:1px solid var(--wm-border);border-radius:6px;background:var(--wm-hover);color:var(--wm-text);cursor:pointer';
    main.appendChild(chooseWallpaper);

    var wallpaperPicker = document.createElement('div');
    wallpaperPicker.style.cssText = 'display:none;border:1px solid var(--wm-border);border-radius:8px;padding:10px;margin-bottom:16px';
    main.appendChild(wallpaperPicker);

    var pickerPath = '/';
    async function showWallpaperFolder(path) {
      pickerPath = path || '/';
      wallpaperPicker.innerHTML = '';
      wallpaperPicker.style.display = 'block';

      var toolbar = document.createElement('div');
      toolbar.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:8px';
      var up = document.createElement('button');
      up.type = 'button';
      up.textContent = '↑ Up';
      up.disabled = pickerPath === '/';
      up.style.cssText = 'padding:5px 8px;border:1px solid var(--wm-border);border-radius:5px;background:var(--wm-hover);color:var(--wm-text);cursor:pointer';
      up.onclick = function() {
        var parent = pickerPath.split('/').slice(0, -1).join('/') || '/';
        showWallpaperFolder(parent);
      };
      var pathLabel = document.createElement('span');
      pathLabel.textContent = pickerPath;
      pathLabel.style.cssText = 'font-size:12px;color:var(--wm-text-dim);overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
      toolbar.appendChild(up);
      toolbar.appendChild(pathLabel);
      wallpaperPicker.appendChild(toolbar);

      var items = await fs.ls(pickerPath) || [];
      items.sort(function(a, b) {
        if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

      var list = document.createElement('div');
      list.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:6px;max-height:220px;overflow:auto';
      wallpaperPicker.appendChild(list);

      var imageItems = items.filter(function(item) {
        var ext = item.name.split('.').pop().toLowerCase();
        return item.type === 'file' && (['png','jpg','jpeg','gif','webp','svg'].includes(ext) || (item.mime || '').startsWith('image/'));
      });
      var dirs = items.filter(function(item) { return item.type === 'dir'; });

      for (var dir of dirs) {
        var folderBtn = document.createElement('button');
        folderBtn.type = 'button';
        folderBtn.textContent = '📁 ' + dir.name;
        folderBtn.style.cssText = 'padding:8px;text-align:left;border:1px solid var(--wm-border);border-radius:6px;background:var(--wm-hover);color:var(--wm-text);cursor:pointer';
        folderBtn.onclick = function(nextPath) { return function() { showWallpaperFolder(nextPath); }; }((pickerPath === '/' ? '' : pickerPath) + '/' + dir.name);
        list.appendChild(folderBtn);
      }

      if (!dirs.length && !imageItems.length) {
        var empty = document.createElement('div');
        empty.textContent = 'No picture files in this folder.';
        empty.style.cssText = 'grid-column:1/-1;padding:12px;color:var(--wm-text-dim);font-size:12px';
        list.appendChild(empty);
      }

      for (let item of imageItems) {
        const filePath = (pickerPath === '/' ? '' : pickerPath) + '/' + item.name;
        var content = await fs.read(filePath);
        if (content == null) continue;
        var mime = item.mime && item.mime.startsWith('image/') ? item.mime : ({
          png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg', gif:'image/gif', webp:'image/webp', svg:'image/svg+xml'
        })[item.name.split('.').pop().toLowerCase()] || 'image/png';
        let dataUrl;
        if (content.toLowerCase().startsWith('data:image/')) dataUrl = content;
        else if (mime === 'image/svg+xml' && item.encoding !== 'base64') dataUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(content);
        else dataUrl = 'data:' + mime + ';base64,' + content.replaceAll(' ', '').replaceAll('\n', '').replaceAll('\r', '');

        var fileBtn = document.createElement('button');
        fileBtn.type = 'button';
        fileBtn.title = filePath;
        fileBtn.style.cssText = 'display:flex;align-items:center;gap:8px;padding:6px;text-align:left;border:1px solid var(--wm-border);border-radius:6px;background:var(--wm-hover);color:var(--wm-text);cursor:pointer;min-width:0';
        var preview = document.createElement('img');
        preview.src = dataUrl;
        preview.alt = '';
        preview.style.cssText = 'width:42px;height:42px;object-fit:cover;border-radius:4px;flex-shrink:0';
        var fileLabel = document.createElement('span');
        fileLabel.textContent = item.name;
        fileLabel.style.cssText = 'font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
        fileBtn.appendChild(preview);
        fileBtn.appendChild(fileLabel);
        fileBtn.onclick = async function() {
          await settings.set('wallpaper', 'fs:' + filePath);
          kernel.broadcast('themeChanged', settings.getTheme());
          chooseWallpaper.textContent = 'Choose picture from Files';
          wallpaperPicker.style.display = 'none';
        };
        list.appendChild(fileBtn);
      }
    }

    chooseWallpaper.onclick = function() {
      if (wallpaperPicker.style.display === 'none') showWallpaperFolder('/');
      else wallpaperPicker.style.display = 'none';
    };

    // Dark mode
    main.appendChild(row('Dark Mode', 'Switch between dark and light themes',
      toggle(theme.darkMode, async function(val) {
        var changes = { darkMode: val };
        if ([DEFAULT_THEME.id, DEFAULT_LIGHT_THEME.id].includes(settings.get('themeId'))) {
          var preset = val ? DEFAULT_THEME : DEFAULT_LIGHT_THEME;
          changes.themeId = preset.id;
          if ([DEFAULT_THEME.wallpaper, DEFAULT_LIGHT_THEME.wallpaper].includes(settings.get('wallpaper'))) changes.wallpaper = preset.wallpaper;
        }
        await settings.setMany(changes);
        wm.applyTheme(settings.getTheme());
        kernel.broadcast('themeChanged', settings.getTheme());
        if (changes.themeId) {
          // Keep the switch mounted so its thumb can finish moving.
          theme = settings.getAll();
          themeGrid.querySelectorAll('[data-theme-id]').forEach(function(card) {
            var selected = card.dataset.themeId === theme.themeId;
            card.setAttribute('aria-pressed', String(selected));
            card.style.borderColor = selected ? 'var(--wm-accent)' : 'var(--wm-control-border)';
          });
          wpGrid.querySelectorAll('[data-wallpaper]').forEach(function(card) {
            var preset = WALLPAPERS.find(function(item) { return item.label === card.dataset.wallpaper; });
            var selected = preset?.val === theme.wallpaper;
            card.setAttribute('aria-pressed', String(selected));
            card.style.borderColor = selected ? 'var(--wm-accent)' : 'transparent';
          });
        }
      })
    ));

    // Transparency
    main.appendChild(row('Transparency', 'Allow translucent window frames, menus, and widgets',
      toggle(settings.get('transparency') !== false, async function(val) {
        await settings.set('transparency', val);
        refreshGlassControls();
      })
    ));
    var refreshGlassControls = renderClearIce(main);
  }

  function renderClearIce(main) {
    var group = document.createElement('section');
    group.setAttribute('aria-label', 'Clear Ice appearance');
    var switchButton = createGlassSwitch(settings.get('clearIce') !== false, 'Clear Ice');
    switchButton.id = 'bos-clear-ice-toggle';
    group.appendChild(row('Clear Ice', 'Reflective rims, soft highlights, and translucent depth', switchButton));
    var preview = document.createElement('div');
    preview.className = 'bos-ice-demo-stage';
    preview.setAttribute('aria-label', 'Live Clear Ice preview');
    var surface = document.createElement('div');
    surface.className = 'bos-ice-demo-surface';
    var name = document.createElement('strong'); name.textContent = 'Clear Ice';
    var detail = document.createElement('span'); detail.textContent = 'Windows, menus, and widgets';
    detail.style.cssText = 'font-size:12px;color:var(--wm-text-dim)';
    surface.append(name, detail); preview.appendChild(surface); group.appendChild(preview);
    var controls = document.createElement('div');
    var ranges = [];
    var blur = makeRange('Blur', 'glassBlur', 0, 40, 16, 'Clearer', 'Blurrier', ' px');
    var tint = makeRange('Surface tint', 'glassTint', 0, 100, 44, 'More transparent', 'More solid', '%');
    var lensButton = createGlassSwitch(settings.get('glassMagnification') === true, 'Glass magnification');
    lensButton.id = 'bos-glass-magnification-toggle';
    controls.appendChild(row('Glass magnification', 'Curved glass with a gentle center zoom and rounded edge refraction in Chrome and Edge. On by default; turn off for better performance.', lensButton));
    lensButton.onclick = async function() {
      lensButton.disabled = true;
      lensButton.setAttribute('aria-busy', 'true');
      setGlassSwitch(lensButton, settings.get('glassMagnification') !== true);
      try { await settings.set('glassMagnification', settings.get('glassMagnification') !== true); }
      catch (_) { wm.notify('Could not save glass magnification setting'); }
      finally { lensButton.removeAttribute('aria-busy'); refresh(); }
    };
    group.appendChild(controls); main.appendChild(group);

    function previewPreferences() {
      wm.applyGlassPreferences({ ...settings.getTheme(), glassBlur: blur.valueAsNumber, glassTint: tint.valueAsNumber });
    }
    function makeRange(label, key, min, max, fallback, startLabel, endLabel, unit) {
      var wrap = document.createElement('div'); wrap.style.cssText = 'padding:10px 0';
      var heading = document.createElement('div'); heading.style.cssText = 'display:flex;justify-content:space-between;margin-bottom:8px;font-size:13px;color:var(--wm-text)';
      var title = document.createElement('label'); title.textContent = label;
      var output = document.createElement('output'); output.style.color = 'var(--wm-text-dim)';
      var input = document.createElement('input');
      input.type = 'range'; input.className = 'bos-ice-range'; input.id = 'bos-' + key;
      input.min = min; input.max = max; input.step = 1;
      input.value = boundedNumber(settings.get(key), fallback, min, max);
      title.htmlFor = input.id;
      output.setAttribute('for', input.id);
      var showValue = function() { output.value = input.value + unit; input.setAttribute('aria-valuetext', input.value + (unit === '%' ? ' percent' : ' pixels')); };
      showValue();
      ranges.push({ input: input, key: key, fallback: fallback, min: min, max: max, showValue: showValue });
      input.oninput = function() { showValue(); previewPreferences(); };
      input.onchange = async function() {
        try { await settings.set(key, input.valueAsNumber); }
        catch (_) { wm.notify('Could not save Clear Ice setting'); }
      };
      var ends = document.createElement('div'); ends.style.cssText = 'display:flex;justify-content:space-between;margin-top:5px;font-size:11px;color:var(--wm-text-dim)';
      var left = document.createElement('span'); left.textContent = startLabel;
      var right = document.createElement('span'); right.textContent = endLabel;
      ends.append(left, right); heading.append(title, output); wrap.append(heading, input, ends); controls.appendChild(wrap);
      return input;
    }
    function refresh() {
      var transparent = settings.get('transparency') !== false;
      var enabled = settings.get('clearIce') !== false;
      switchButton.disabled = !transparent;
      setGlassSwitch(switchButton, enabled);
      blur.disabled = tint.disabled = !transparent || !enabled;
      lensButton.disabled = !transparent || !enabled;
      setGlassSwitch(lensButton, settings.get('glassMagnification') === true);
      controls.classList.toggle('bos-ice-disabled', !transparent || !enabled);
      ranges.forEach(function(range) {
        range.input.value = boundedNumber(settings.get(range.key), range.fallback, range.min, range.max);
        range.showValue();
      });
    }
    switchButton.onclick = async function() {
      switchButton.disabled = true;
      switchButton.setAttribute('aria-busy', 'true');
      setGlassSwitch(switchButton, settings.get('clearIce') === false);
      try { await settings.set('clearIce', settings.get('clearIce') === false); }
      catch (_) { wm.notify('Could not save Clear Ice setting'); }
      finally { switchButton.removeAttribute('aria-busy'); refresh(); }
    };
    refresh();
    var onSetting = function(_theme, key) {
      if (key == null || ['transparency', 'clearIce', 'glassBlur', 'glassTint', 'glassMagnification'].includes(key)) refresh();
    };
    settings.onChange(onSetting);
    main._iceCleanup = function() { settings.offChange(onSetting); };
    return refresh;
  }

  // ── Display ──────────────────────────────────────────────────────────────────

  function renderWidgets(main) {
    main.appendChild(h2('Desktop widgets'));
    var description = document.createElement('p');
    description.textContent = 'Add live cards from compatible apps. Move them using the grip, or focus the grip and use the arrow keys. Your layout is saved automatically.';
    description.style.cssText = 'font-size:13px;line-height:1.5;color:var(--wm-text-dim);margin-bottom:16px';
    main.appendChild(description);
    availableWidgets(wm).forEach(function(widget) {
      var current = settings.get('desktopWidgets');
      var enabled = Array.isArray(current) && current.some(item => item?.id === widget.id);
      var button = document.createElement('button');
      button.type = 'button';
      button.textContent = enabled ? 'Remove' : 'Add';
      button.setAttribute('aria-label', (enabled ? 'Remove ' : 'Add ') + widget.title + ' widget');
      button.style.cssText = 'padding:7px 12px;border:1px solid var(--wm-control-border);border-radius:7px;background:var(--wm-control-bg);color:var(--wm-text);cursor:pointer;font:inherit;flex-shrink:0;margin-left:12px';
      button.onclick = async function() {
        button.disabled = true;
        try {
          var layout = settings.get('desktopWidgets');
          var active = Array.isArray(layout) && layout.some(item => item?.id === widget.id);
          await setWidgetEnabled(settings, widget.id, !active);
          main.replaceChildren(); renderWidgets(main);
        } catch (_) { wm.notify('Could not save widget layout'); button.disabled = false; }
      };
      main.appendChild(row(widget.icon + ' ' + widget.title, widget.description, button));
    });
    var gallery = document.createElement('button');
    gallery.type = 'button';
    gallery.textContent = 'Open widget gallery';
    gallery.style.cssText = 'margin-top:18px;padding:9px 12px;border:1px solid var(--wm-control-border);border-radius:7px;background:var(--wm-control-bg);color:var(--wm-text);cursor:pointer;font:inherit';
    gallery.onclick = function() { document.dispatchEvent(new CustomEvent('bos:showWidgets')); };
    main.appendChild(gallery);
  }

  function renderDisplay(main) {
    main.appendChild(h2('Display'));

    var theme = settings.getAll();
    var FONTS = [
      { label:'Segoe UI',    val:"'Segoe UI', system-ui, sans-serif" },
      { label:'Arial',       val:'Arial, sans-serif' },
      { label:'Georgia',     val:'Georgia, serif' },
      { label:'Courier New', val:"'Courier New', monospace" },
      { label:'Verdana',     val:'Verdana, sans-serif' },
      { label:'Trebuchet',   val:"'Trebuchet MS', sans-serif" },
    ];

    var fontLabel = document.createElement('div');
    fontLabel.style.cssText = 'font-size:14px;color:var(--wm-text);margin-bottom:10px';
    fontLabel.textContent = 'UI Font';
    main.appendChild(fontLabel);

    var fontGrid = document.createElement('div');
    fontGrid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:20px';
    FONTS.forEach(function(f) {
      var el = document.createElement('div');
      var isActive = theme.font === f.val;
      el.style.cssText = 'padding:10px 14px;border-radius:6px;cursor:pointer;border:1px solid ' + (isActive ? 'var(--wm-accent)' : 'rgba(255,255,255,0.1)') + ';background:' + (isActive ? 'rgba(0,120,212,0.15)' : 'rgba(255,255,255,0.04)') + ';font-family:' + f.val + ';transition:all 0.15s';
      el.innerHTML = '<div style="font-size:15px;color:var(--wm-text)">' + f.label + '</div><div style="font-size:11px;opacity:0.5;margin-top:2px">The quick brown fox</div>';
      el.onclick = async function() {
        await settings.set('font', f.val);
        document.documentElement.style.setProperty('--wm-font', f.val);
        document.body.style.fontFamily = f.val;
        fontGrid.querySelectorAll('div').forEach(function(s) {
          s.style.borderColor = 'rgba(255,255,255,0.1)';
          s.style.background = 'rgba(255,255,255,0.04)';
        });
        el.style.borderColor = 'var(--wm-accent)';
        el.style.background = 'rgba(0,120,212,0.15)';
        kernel.broadcast('themeChanged', settings.getTheme());
      };
      fontGrid.appendChild(el);
    });
    main.appendChild(fontGrid);

    main.appendChild(row('Show Clock', 'Display clock in taskbar',
      toggle(settings.get('showClock') !== false, async function(val) {
        await settings.set('showClock', val);
        var clock = document.getElementById('wm-clock');
        if (clock) clock.style.display = val ? '' : 'none';
      })
    ));
  }

  // ── Accessibility ───────────────────────────────────────────────────────────

  function renderAccessibility(main) {
    main.appendChild(h2('Accessibility'));

    var scale = document.createElement('select');
    scale.setAttribute('aria-label', 'Interface size');
    scale.style.cssText = 'padding:8px 10px;border:1px solid var(--wm-border);border-radius:6px;background:var(--wm-hover);color:var(--wm-text);font:inherit;min-width:110px';
    [100, 115, 130].forEach(function(value) {
      var option = document.createElement('option');
      option.value = String(value);
      option.textContent = value + '%';
      scale.appendChild(option);
    });
    scale.value = String(settings.get('interfaceScale') || 100);
    scale.onchange = function() {
      settings.set('interfaceScale', Number(scale.value));
    };
    main.appendChild(row('Interface Size', 'Scale the BrowserOS desktop and its controls', scale));

    main.appendChild(row('Reduce Motion', 'Limit animations and transitions throughout BrowserOS',
      toggle(settings.get('reduceMotion') === true, async function(value) {
        await settings.set('reduceMotion', value);
      })
    ));
  }

  // ── Apps ─────────────────────────────────────────────────────────────────────

  async function renderApps(main) {
    main.appendChild(h2('Installed Apps'));

    var allApps = await db.apps.all();
    if (!allApps.length) {
      main.innerHTML += '<div style="color:var(--wm-text-dim);font-size:13px">No apps installed</div>';
      return;
    }

    allApps.forEach(function(app) {
      var el = document.createElement('div');
      el.style.cssText = 'display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid rgba(255,255,255,0.05)';

      var icon = document.createElement('div');
      icon.style.cssText = 'width:36px;height:36px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0;background:rgba(255,255,255,0.05)';
      if (app.icon && app.icon.startsWith('data:')) {
        var img = document.createElement('img');
        img.src = app.icon; img.style.cssText = 'width:28px;height:28px;border-radius:4px';
        icon.appendChild(img);
      } else {
        icon.textContent = app.emoji || '⚡';
      }

      var info = document.createElement('div');
      info.style.cssText = 'flex:1';
      info.innerHTML = '<div style="font-size:14px;color:var(--wm-text)">' + app.name + '</div>' +
        '<div style="font-size:11px;color:var(--wm-text-dim)">v' + app.version + (app.protected ? ' \u2022 \uD83D\uDD12 Protected' : '') + '</div>';

      el.appendChild(icon);
      el.appendChild(info);

      if (!app.protected) {
        var uninstallBtn = document.createElement('button');
        uninstallBtn.textContent = 'Uninstall';
        uninstallBtn.style.cssText = 'background:rgba(200,50,50,0.15);border:1px solid rgba(200,50,50,0.3);color:#ff8888;border-radius:4px;padding:5px 10px;cursor:pointer;font-size:12px';
        uninstallBtn.onclick = async function() {
          if (!confirm('Uninstall ' + app.name + '?')) return;
          if (app.storageId) await db.appData.clear(app.storageId);
          await db.apps.delete(app.id);
          el.remove();
          wm.onAppUninstalled(app.id);
        };
        el.appendChild(uninstallBtn);
      }

      main.appendChild(el);
    });
  }

  // ── Storage ──────────────────────────────────────────────────────────────────

  async function renderStorage(main) {
    main.appendChild(h2('Storage'));

    // Count IDB usage estimate
    var estimate = { usage: 0, quota: 0 };
    if (navigator.storage && navigator.storage.estimate) {
      estimate = await navigator.storage.estimate();
    }
    var usedMB  = (estimate.usage  / 1024 / 1024).toFixed(1);
    var totalMB = (estimate.quota  / 1024 / 1024).toFixed(0);
    var pct     = estimate.quota ? Math.round((estimate.usage / estimate.quota) * 100) : 0;

    main.appendChild(row('IndexedDB Usage', 'Storage used by BrowserOS filesystem',
      document.createTextNode(usedMB + ' MB of ' + totalMB + ' MB')
    ));

    var bar = document.createElement('div');
    bar.style.cssText = 'height:8px;background:rgba(255,255,255,0.1);border-radius:4px;overflow:hidden;margin:12px 0';
    bar.innerHTML = '<div style="height:100%;background:var(--wm-accent);width:' + pct + '%;border-radius:4px;transition:width 0.3s"></div>';
    main.appendChild(bar);

    main.appendChild(h2('Backup and restore'));
    var backupNote = document.createElement('p');
    backupNote.textContent = 'Save a copy of one file, or export your complete BrowserOS profile. A full backup includes files, settings, installed apps, app permissions, and supported app data.';
    backupNote.style.cssText = 'font-size:13px;line-height:1.5;color:var(--wm-text-dim);margin:-10px 0 12px';
    main.appendChild(backupNote);

    function backupButton(label) {
      var button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.style.cssText = 'padding:8px 12px;border:1px solid var(--wm-border);border-radius:6px;background:var(--wm-hover);color:var(--wm-text);cursor:pointer;margin:0 8px 8px 0';
      return button;
    }
    function downloadBlob(blob, filename) {
      var url = URL.createObjectURL(blob);
      var link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
    }
    function safeFilename(name) {
      return String(name || 'browseros-backup').replace(/[^a-z0-9._-]/gi, '_');
    }

    var fullBackupBtn = backupButton('Download full profile (.zip)');
    fullBackupBtn.onclick = async function() {
      if (typeof JSZip === 'undefined') {
        alert('The ZIP library is unavailable. Reload BrowserOS and try again.');
        return;
      }
      fullBackupBtn.disabled = true;
      fullBackupBtn.textContent = 'Creating backup…';
      try {
        var snapshot = await db.exportSnapshot();
        var zip = new JSZip();
        zip.file('manifest.json', JSON.stringify({
          format: 'browseros-backup',
          version: 1,
          createdAt: snapshot.exportedAt,
          contents: ['files', 'settings', 'installed-apps', 'app-data', 'app-permissions'],
        }, null, 2));
        zip.file('profile.json', JSON.stringify(snapshot));
        var archive = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
        downloadBlob(archive, 'BrowserOS-backup-' + new Date().toISOString().slice(0, 10) + '.zip');
      } catch (error) {
        console.error('[settings] Profile backup failed:', error);
        alert('Could not create the BrowserOS backup. Check available browser storage and try again.');
      } finally {
        fullBackupBtn.disabled = false;
        fullBackupBtn.textContent = 'Download full profile (.zip)';
      }
    };
    main.appendChild(fullBackupBtn);

    var restoreInput = document.createElement('input');
    restoreInput.type = 'file';
    restoreInput.accept = '.zip,application/zip';
    restoreInput.style.cssText = 'display:block;margin:4px 0 8px;color:var(--wm-text-dim)';
    main.appendChild(restoreInput);
    var restoreMode = document.createElement('select');
    restoreMode.style.cssText = 'padding:7px;border:1px solid var(--wm-border);border-radius:6px;background:var(--wm-bg);color:var(--wm-text);margin-right:8px';
    [['replace', 'Replace current profile'], ['merge', 'Merge into current profile']].forEach(function(option) {
      var el = document.createElement('option');
      el.value = option[0];
      el.textContent = option[1];
      restoreMode.appendChild(el);
    });
    main.appendChild(restoreMode);
    var restoreBtn = backupButton('Restore profile from .zip');
    restoreBtn.onclick = async function() {
      var archiveFile = restoreInput.files && restoreInput.files[0];
      if (!archiveFile) { alert('Choose a BrowserOS backup .zip first.'); return; }
      if (archiveFile.size > 128 * 1024 * 1024) { alert('This backup is larger than the 128 MB restore limit.'); return; }
      var mode = restoreMode.value;
      var prompt = mode === 'replace'
        ? 'Replace this BrowserOS profile with the backup? Current files, apps, app data, and settings will be overwritten.'
        : 'Merge this backup into the current profile? Matching files, apps, and settings will be overwritten.';
      if (!confirm(prompt + ' BrowserOS will reload after the restore.')) return;
      restoreBtn.disabled = true;
      restoreBtn.textContent = 'Restoring…';
      try {
        if (typeof JSZip === 'undefined') throw new Error('The ZIP library is unavailable');
        var zip = await JSZip.loadAsync(archiveFile, { checkCRC32: true });
        var manifestFile = zip.file('manifest.json');
        var profileFile = zip.file('profile.json');
        if (!manifestFile || !profileFile) throw new Error('This ZIP is missing the BrowserOS backup files');
        var manifest = JSON.parse(await manifestFile.async('string'));
        if (manifest.format !== 'browseros-backup' || manifest.version !== 1) throw new Error('Unsupported BrowserOS backup format');
        var profileText = await profileFile.async('string');
        if (profileText.length > 128 * 1024 * 1024) throw new Error('Backup profile is too large');
        var snapshot = JSON.parse(profileText);
        await db.restoreSnapshot(snapshot, mode);
        location.reload();
      } catch (error) {
        console.error('[settings] Profile restore failed:', error);
        alert('Could not restore this backup: ' + (error.message || String(error)));
        restoreBtn.disabled = false;
        restoreBtn.textContent = 'Restore profile from .zip';
      }
    };
    main.appendChild(restoreBtn);

    main.appendChild(h2('Single file backup'));
    var pathInput = document.createElement('input');
    pathInput.type = 'text';
    pathInput.placeholder = '/Documents/example.txt';
    pathInput.setAttribute('aria-label', 'BrowserOS file path');
    pathInput.style.cssText = 'width:min(100%,360px);padding:8px;border:1px solid var(--wm-border);border-radius:6px;background:var(--wm-bg);color:var(--wm-text);margin:0 8px 8px 0';
    main.appendChild(pathInput);
    var exportFileBtn = backupButton('Download file');
    exportFileBtn.onclick = async function() {
      var path = pathInput.value.trim();
      if (!path) { alert('Enter a BrowserOS file path first.'); return; }
      try {
        var node = await fs._raw(path);
        if (!node || node.type !== 'file') throw new Error('File not found');
        var bytes;
        if (node.encoding === 'base64') {
          var binary = atob(node.content || '');
          bytes = new Uint8Array(binary.length);
          for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        } else {
          bytes = new Blob([node.content || '']);
        }
        downloadBlob(new Blob([bytes], { type: node.mime || 'application/octet-stream' }), safeFilename(path.split('/').pop()));
      } catch (error) {
        alert('Could not download that file: ' + (error.message || String(error)));
      }
    };
    main.appendChild(exportFileBtn);

    var importFileInput = document.createElement('input');
    importFileInput.type = 'file';
    importFileInput.setAttribute('aria-label', 'Choose a file to restore');
    importFileInput.style.cssText = 'display:block;margin:4px 0 8px;color:var(--wm-text-dim)';
    importFileInput.onchange = function() {
      var chosen = importFileInput.files && importFileInput.files[0];
      if (chosen) pathInput.value = '/Downloads/' + chosen.name;
    };
    main.appendChild(importFileInput);
    var restoreFileBtn = backupButton('Restore selected file to path');
    restoreFileBtn.onclick = async function() {
      var chosen = importFileInput.files && importFileInput.files[0];
      var path = pathInput.value.trim();
      if (!chosen || !path) { alert('Choose a file and enter its BrowserOS destination path.'); return; }
      if (!path.startsWith('/') || path.split('/').includes('..')) { alert('Use a valid absolute BrowserOS path.'); return; }
      try {
        var buffer = await chosen.arrayBuffer();
        var mime = chosen.type || 'application/octet-stream';
        var textual = mime.startsWith('text/') || ['application/json', 'application/javascript', 'image/svg+xml', 'application/beep'].includes(mime);
        var value;
        if (textual) value = new TextDecoder().decode(buffer);
        else {
          var data = new Uint8Array(buffer);
          var binary = '';
          for (var offset = 0; offset < data.length; offset += 0x8000) {
            binary += String.fromCharCode.apply(null, data.subarray(offset, offset + 0x8000));
          }
          value = btoa(binary);
        }
        var existing = await fs._raw(path);
        if (existing) {
          var parts = path.split('/');
          var filename = parts.pop();
          var folder = parts.join('/') || '/';
          path = (folder === '/' ? '' : folder) + '/' + filename;
          var dot = filename.lastIndexOf('.');
          var stem = dot > 0 ? filename.slice(0, dot) : filename;
          var ext = dot > 0 ? filename.slice(dot) : '';
          var suffix = 1;
          while (await fs._raw(path)) {
            path = (folder === '/' ? '' : folder) + '/' + stem + '(' + suffix++ + ')' + ext;
          }
        }
        var result = await fs.write(path, value);
        if (!result.ok) throw new Error(result.error || 'Could not write file');
        alert('File restored to ' + path);
      } catch (error) {
        alert('Could not restore that file: ' + (error.message || String(error)));
      }
    };
    main.appendChild(restoreFileBtn);

    var resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.textContent = '🗑️ Reset Filesystem';
    resetBtn.style.cssText = 'background:rgba(200,50,50,0.15);border:1px solid rgba(200,50,50,0.3);color:#ff8888;border-radius:6px;padding:8px 16px;cursor:pointer;font-size:13px;margin-top:16px';
    resetBtn.onclick = async function() {
      if (!confirm('Factory reset BrowserOS? This permanently deletes your local profile, files, installed apps, app data, and settings. BrowserOS will restart with first-run setup.')) return;
      resetBtn.disabled = true;
      resetBtn.textContent = 'Resetting…';
      try {
        await db.clearAll();
        location.reload();
      } catch (error) {
        console.error('[settings] Factory reset failed:', error);
        alert('BrowserOS could not reset its data. Check the Developer / Debug console logs for details.');
        resetBtn.disabled = false;
        resetBtn.textContent = '🗑️ Reset Filesystem';
      }
    };
    main.appendChild(resetBtn);
  }

  // ── System ───────────────────────────────────────────────────────────────────

  function renderSystem(main) {
    main.appendChild(h2('System'));

    var info = [
      { label:'OS Version',  value:'BrowserOS 2.1.2' },
      { label:'BOS API',     value:'2.0' },
      { label:'Engine',      value:'HTML5 / IndexedDB / ES Modules' },
      { label:'License',     value:'AGPL-3.0' },
    ];

    info.forEach(function(item) {
      main.appendChild(row(item.label, null, document.createTextNode(item.value)));
    });

  }
  // ── Developer / Debug ───────────────────────────────────────────────────────

  function renderDeveloper(main) {
    main.appendChild(h2('Developer / Debug'));

    var note = document.createElement('p');
    note.textContent = 'Tools for inspecting this BrowserOS session. Console history stays in memory and is cleared when the page reloads.';
    note.style.cssText = 'font-size:13px;line-height:1.5;color:var(--wm-text-dim);margin:-10px 0 18px';
    main.appendChild(note);

    main.appendChild(h2('Session inspection'));
    var details = document.createElement('div');
    details.style.cssText = 'border:1px solid var(--wm-border);border-radius:8px;padding:0 12px;margin-bottom:14px';
    main.appendChild(details);

    async function refreshInspection() {
      details.innerHTML = '';
      var appCount = 0;
      var fileCount = 0;
      try { appCount = (await db.apps.all()).length; } catch (_) {}
      try { fileCount = (await fs.ls('/')).length; } catch (_) {}
      var info = [
        ['BrowserOS', '3 Dev'],
        ['Browser', navigator.userAgent || 'Unavailable'],
        ['Platform', navigator.userAgentData?.platform || navigator.platform || 'Unavailable'],
        ['Language', navigator.language || 'Unavailable'],
        ['Viewport', window.innerWidth + ' × ' + window.innerHeight],
        ['Installed .beep apps', String(appCount)],
        ['Root filesystem entries', String(fileCount)],
      ];
      info.forEach(function(item) {
        details.appendChild(row(item[0], null, document.createTextNode(item[1])));
      });
    }
    refreshInspection();

    var refreshButton = document.createElement('button');
    refreshButton.type = 'button';
    refreshButton.textContent = 'Refresh inspection';
    refreshButton.style.cssText = 'padding:7px 10px;border:1px solid var(--wm-border);border-radius:6px;background:var(--wm-hover);color:var(--wm-text);cursor:pointer;margin-bottom:20px';
    refreshButton.onclick = refreshInspection;
    main.appendChild(refreshButton);

    main.appendChild(h2('Experiments'));
    main.appendChild(row('Show layout outlines', 'Draw outlines around interface elements to inspect layout boundaries',
      toggle(settings.get('debugLayoutOutlines') === true, async function(value) {
        await settings.set('debugLayoutOutlines', value);
      })
    ));

    main.appendChild(row('Ice Mode', 'Windows keep sliding after you release them and bounce off the desktop edges. Reduced Motion disables the effect.',
      toggle(settings.get('iceMode') === true, async function(value) {
        await settings.set('iceMode', value);
      })
    ));

    main.appendChild(h2('Recent console logs'));
    var logToolbar = document.createElement('div');
    logToolbar.style.cssText = 'display:flex;gap:8px;margin-bottom:8px';
    var logList = document.createElement('pre');
    logList.setAttribute('aria-label', 'Recent console logs');
    logList.style.cssText = 'white-space:pre-wrap;overflow:auto;max-height:220px;padding:10px;border:1px solid var(--wm-border);border-radius:7px;background:rgba(0,0,0,.18);color:var(--wm-text);font:11px/1.45 ui-monospace,Consolas,monospace';
    function renderLogs() {
      var entries = DEBUG_LOGS.slice(-100);
      logList.textContent = entries.length
        ? entries.map(function(entry) {
            return '[' + entry.time + '] ' + entry.level.toUpperCase() + ' ' + entry.message;
          }).join('\n')
        : 'No console entries captured yet.';
      logList.scrollTop = logList.scrollHeight;
    }
    function logButton(label, handler) {
      var button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.style.cssText = 'padding:6px 9px;border:1px solid var(--wm-border);border-radius:6px;background:var(--wm-hover);color:var(--wm-text);cursor:pointer';
      button.onclick = handler;
      logToolbar.appendChild(button);
    }
    logButton('Refresh', renderLogs);
    logButton('Copy logs', async function() {
      var text = DEBUG_LOGS.map(function(entry) {
        return '[' + entry.time + '] ' + entry.level.toUpperCase() + ' ' + entry.message;
      }).join('\n');
      try {
        await navigator.clipboard.writeText(text);
        alert('Console logs copied. Review them before sharing; they may contain session details.');
      } catch (_) {
        alert('Could not access the clipboard. Select and copy the log text manually.');
      }
    });
    logButton('Clear logs', function() {
      DEBUG_LOGS.length = 0;
      renderLogs();
    });
    main.appendChild(logToolbar);
    main.appendChild(logList);
    renderLogs();

    main.appendChild(h2('Reset controls'));
    var resetSettingsBtn = document.createElement('button');
    resetSettingsBtn.type = 'button';
    resetSettingsBtn.textContent = 'Reset Settings to Defaults';
    resetSettingsBtn.style.cssText = 'background:rgba(200,50,50,0.15);border:1px solid rgba(200,50,50,0.3);color:#ff8888;border-radius:6px;padding:8px 12px;cursor:pointer;font-size:13px;margin:0 8px 10px 0';
    resetSettingsBtn.onclick = async function() {
      if (!confirm('Reset all BrowserOS settings to their defaults? Your files and installed apps will remain.')) return;
      await settings.reset();
      wm.applyTheme(settings.getTheme());
      kernel.broadcast('themeChanged', settings.getTheme());
      main.innerHTML = '';
      renderDeveloper(main);
    };
    main.appendChild(resetSettingsBtn);

  }
}


