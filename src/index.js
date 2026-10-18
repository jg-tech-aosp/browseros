/**
 * BrowserOS v2 — Boot Sequence
 * src/index.js
 *
 * Wires all modules together and boots the OS in the correct order:
 * 1. IndexedDB
 * 2. Filesystem
 * 3. Settings
 * 4. Window Manager
 * 5. Kernel
 * 6. Launcher
 * 7. Shell + Desktop
 * 8. Taskbar
 * 9. Search
 * 10. Seed inbox apps
 * 11. Restore desktop state
 */

import { DB }            from './fs/db.js';
import { FileSystem }    from './fs/fs.js';
import { Kernel }        from './kernel/kernel.js';
import { WindowManager } from './wm/wm.js';
import { Launcher }      from './apps/launcher.js';
import { Settings }       from './ui/settings.js';
import { Notifications }  from './ui/notifications.js';
import { registerSettingsApp }  from './ui/settings-app.js';
import { registerFileManager }  from './shell/filemanager.js';
import { registerBrowser }      from './shell/browser.js';
import { registerAppStore }     from './shell/appstore.js';
import { registerMusicPlayer }  from './shell/musicplayer.js';
import { registerTextEditor }   from './shell/texteditor.js';
import { registerTerminal }     from './shell/terminal.js';
import { registerSysMonitor }   from './shell/sysmonitor.js';
import { registerPaint }        from './shell/paint.js';
import { registerImageViewer } from './shell/imageviewer.js';
import { Desktop }        from './shell/desktop.js';
import { Taskbar }       from './shell/taskbar.js';
import { StartMenu }  from './shell/startmenu.js';
import { Search }     from './shell/search.js';

// ─── Inbox app paths ──────────────────────────────────────────────────────────
// These .beep files must exist in the filesystem at boot.
// They are installed as protected apps on first run.

const INBOX_APPS = [
  'calculator',
  'markdownviewer',
  'info',
];

// ─── Boot ─────────────────────────────────────────────────────────────────────


function showFirstRunOnboarding(settings) {
  if (settings.get('onboardingComplete')) return Promise.resolve();

  return new Promise(resolve => {
    const style = document.createElement('style');
    style.textContent = `
      #bos-onboarding { position:fixed; inset:0; z-index:200000; display:flex; align-items:center; justify-content:center; padding:24px; background:rgba(5,10,24,.76); backdrop-filter:blur(16px); font-family:var(--wm-font,system-ui,sans-serif); color:#f7f9ff; }
      #bos-onboarding * { box-sizing:border-box; }
      #bos-onboarding .ob-card { width:min(540px,100%); padding:34px; border:1px solid rgba(255,255,255,.16); border-radius:20px; background:linear-gradient(145deg,rgba(25,35,58,.98),rgba(13,19,34,.98)); box-shadow:0 24px 90px rgba(0,0,0,.5); }
      #bos-onboarding .ob-mark { font-size:13px; letter-spacing:.12em; text-transform:uppercase; color:#9fcaff; font-weight:700; }
      #bos-onboarding h1 { margin:12px 0 10px; font-size:30px; line-height:1.15; }
      #bos-onboarding p { color:#c1cadb; font-size:14px; line-height:1.55; }
      #bos-onboarding .ob-muted { margin-top:10px; font-size:12px; color:#98a5ba; }
      #bos-onboarding .ob-progress { display:flex; gap:6px; margin:24px 0; }
      #bos-onboarding .ob-progress span { height:4px; flex:1; border-radius:4px; background:rgba(255,255,255,.15); }
      #bos-onboarding .ob-progress span.active { background:#4da3ff; }
      #bos-onboarding label { display:block; margin:8px 0; color:#eaf0fa; font-size:13px; }
      #bos-onboarding input { width:100%; padding:12px 14px; border-radius:9px; border:1px solid rgba(255,255,255,.2); background:rgba(0,0,0,.24); color:#fff; font:inherit; outline:none; }
      #bos-onboarding input:focus { border-color:#4da3ff; box-shadow:0 0 0 3px rgba(77,163,255,.18); }
      #bos-onboarding .ob-themes { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-top:18px; }
      #bos-onboarding .ob-theme { min-height:112px; border:2px solid rgba(255,255,255,.14); border-radius:12px; padding:14px; color:#fff; cursor:pointer; text-align:left; font:inherit; }
      #bos-onboarding .ob-theme[aria-pressed="true"] { border-color:#4da3ff; box-shadow:0 0 0 3px rgba(77,163,255,.18); }
      #bos-onboarding .ob-theme.dark { background:linear-gradient(135deg,#101827,#29364d); }
      #bos-onboarding .ob-theme.light { background:linear-gradient(135deg,#edf4ff,#b8d5f4); color:#172033; }
      #bos-onboarding .ob-theme strong { display:block; margin-bottom:7px; font-size:15px; }
      #bos-onboarding .ob-actions { display:flex; justify-content:space-between; gap:10px; margin-top:26px; }
      #bos-onboarding button.ob-btn { border:1px solid rgba(255,255,255,.2); border-radius:9px; padding:10px 16px; background:rgba(255,255,255,.08); color:#fff; font:inherit; cursor:pointer; }
      #bos-onboarding button.ob-primary { border-color:#1687ed; background:#0878d1; font-weight:700; }
      #bos-onboarding button:focus-visible { outline:3px solid #8cc7ff; outline-offset:2px; }
      @media(max-width:520px) { #bos-onboarding .ob-card { padding:24px; } #bos-onboarding h1 { font-size:25px; } }
    `;
    const overlay = document.createElement('div');
    overlay.id = 'bos-onboarding';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'ob-title');
    overlay.innerHTML = `
      <section class="ob-card">
        <div class="ob-mark">BrowserOS 3</div>
        <div class="ob-progress" aria-hidden="true"><span></span><span></span><span></span></div>
        <div class="ob-page" data-page="0">
          <h1 id="ob-title">A fresh start.</h1>
          <p>Welcome to BrowserOS 3 Dev. Let’s set up your local profile and make the desktop feel like yours.</p>
          <p class="ob-muted">Your files and preferences stay in this browser.</p>
          <div class="ob-actions"><span></span><button class="ob-btn ob-primary" data-next>Get started</button></div>
        </div>
        <div class="ob-page" data-page="1" hidden>
          <h1 id="ob-title-profile">What should we call you?</h1>
          <p>This name appears in your Start menu as your local profile.</p>
          <label for="ob-name">Profile name</label>
          <input id="ob-name" maxlength="32" autocomplete="nickname" placeholder="Your name">
          <p class="ob-muted">This is a profile for this browser, not a password or online account.</p>
          <div class="ob-actions"><button class="ob-btn" data-back>Back</button><button class="ob-btn ob-primary" data-next>Continue</button></div>
        </div>
        <div class="ob-page" data-page="2" hidden>
          <h1 id="ob-title-theme">Choose your look.</h1>
          <p>You can change this later in Settings.</p>
          <div class="ob-themes">
            <button type="button" class="ob-theme dark" data-theme="dark" aria-pressed="true"><strong>🌙 Dark</strong>Easy on the eyes</button>
            <button type="button" class="ob-theme light" data-theme="light" aria-pressed="false"><strong>☀️ Light</strong>Bright and clear</button>
          </div>
          <div class="ob-actions"><button class="ob-btn" data-back>Back</button><button class="ob-btn ob-primary" data-finish>Enter BrowserOS</button></div>
        </div>
      </section>`;
    document.head.appendChild(style);
    document.body.appendChild(overlay);

    let page = 0;
    let darkMode = true;
    const pages = [...overlay.querySelectorAll('.ob-page')];
    const progress = [...overlay.querySelectorAll('.ob-progress span')];
    const nameInput = overlay.querySelector('#ob-name');
    function render() {
      pages.forEach((item, i) => { item.hidden = i !== page; });
      progress.forEach((item, i) => item.classList.toggle('active', i <= page));
      if (page === 1) nameInput.focus();
      else overlay.querySelector(page === 0 ? '[data-next]' : '[data-finish]')?.focus();
    }
    overlay.querySelectorAll('[data-next]').forEach(button => button.addEventListener('click', () => {
      if (page === 1 && !nameInput.value.trim()) {
        nameInput.setCustomValidity('Enter a profile name to continue.');
        nameInput.reportValidity();
        nameInput.addEventListener('input', () => nameInput.setCustomValidity(''), { once: true });
        return;
      }
      page = Math.min(2, page + 1);
      render();
    }));
    overlay.querySelectorAll('[data-back]').forEach(button => button.addEventListener('click', () => {
      page = Math.max(0, page - 1);
      render();
    }));
    overlay.querySelectorAll('[data-theme]').forEach(button => button.addEventListener('click', () => {
      darkMode = button.dataset.theme === 'dark';
      overlay.querySelectorAll('[data-theme]').forEach(choice => choice.setAttribute('aria-pressed', String(choice === button)));
    }));
    overlay.querySelector('[data-finish]').addEventListener('click', async () => {
      const name = nameInput.value.trim().slice(0, 32);
      if (!name) { page = 1; render(); nameInput.reportValidity(); return; }
      const profile = settings.get('userProfile') || { avatar: null };
      await settings.setMany({
        userProfile: { ...profile, name },
        darkMode,
        wallpaper: darkMode
          ? settings.get('wallpaper')
          : 'linear-gradient(135deg,#b8d4e3,#d9ecf7)',
        onboardingComplete: true,
      });
      document.dispatchEvent(new CustomEvent('bos:profileChanged', { detail: { name } }));
      overlay.remove();
      style.remove();
      resolve();
    });
    render();
  });
}

async function boot() {
  console.log('[bos] Booting BrowserOS v2...');

  try {

    // ── 1. IndexedDB ──────────────────────────────────────────────────────────
    console.log('[bos] Opening database...');
    const db = await DB.open();

    // ── 2. Filesystem ─────────────────────────────────────────────────────────
    console.log('[bos] Booting filesystem...');
    const fs = new FileSystem(db);
    await fs.boot(); // seeds default dirs/files on fresh install

    // ── 3. Settings ───────────────────────────────────────────────────────────
    console.log('[bos] Loading settings...');
    const settings = new Settings(db);
    await settings.boot(); // loads saved settings, applies defaults if fresh

    // ── 4. Window Manager ─────────────────────────────────────────────────────
    console.log('[bos] Booting window manager...');
    const wm = new WindowManager({
      settings,
      fs,
      onStart: () => search.toggle(),
    });
    wm.boot();

    // Apply saved theme immediately
    const theme = await settings.getTheme();
    wm.applyTheme(theme);

    // ── 5. Kernel ─────────────────────────────────────────────────────────────
    console.log('[bos] Booting kernel...');
    const kernel = new Kernel({ fs, db, wm, settings, launcher: null });
    wm.setKernel(kernel);
    kernel.boot();

    // ── 6. Launcher ───────────────────────────────────────────────────────────
    console.log('[bos] Booting launcher...');
    const launcher = new Launcher({ fs, db, wm, kernel, settings });

    // Wire launcher into kernel (circular ref resolved here)
    kernel._launcher = launcher;

    // Register native system apps
    registerSettingsApp({ wm, settings, kernel, db, fs });
    registerFileManager({ wm, fs, db, launcher, kernel, settings });
    registerBrowser({ wm, fs, db });
    registerAppStore({ wm, fs, db, launcher });
    registerMusicPlayer({ wm, fs });
    registerTextEditor({ wm, fs });
    registerTerminal({ wm, fs, launcher, kernel, settings, db });
    registerSysMonitor({ wm, db, kernel, settings, fs });
    registerPaint({ wm, fs });
    registerImageViewer({ wm, fs });

    // ── 7. Shell + Desktop ────────────────────────────────────────────────────
    console.log('[bos] Booting notifications...');
    const notifications = new Notifications({ wm });
    notifications.boot();

    console.log('[bos] Booting desktop...');
    const desktop = new Desktop({ fs, db, wm, launcher, kernel, settings });
    await desktop.boot();

    // ── 8. Taskbar ────────────────────────────────────────────────────────────
    console.log('[bos] Booting taskbar...');
    const taskbar = new Taskbar({ wm, db, launcher, settings, kernel, notifications });
    await taskbar.boot();

    // ── 9. Start Menu + Search ────────────────────────────────────────────────
    console.log('[bos] Booting start menu...');
    const startMenu = new StartMenu({ fs, db, wm, launcher, kernel, settings });
    startMenu.boot();

    // Keep search as a separate Ctrl+Space power-user shortcut
    const search = new Search({ fs, db, wm, launcher, kernel });
    search.boot();

    // Start button opens start menu
    wm._onStart = () => startMenu.toggle();

    // Ctrl+Space opens search overlay
    document.addEventListener('keydown', e => {
      if (e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey && e.code === 'Space') {
        e.preventDefault();
        search.toggle();
      }
    });

    // ── 10. Seed inbox apps ───────────────────────────────────────────────────
    console.log('[bos] Seeding inbox apps...');
    await launcher.seedInboxApps(INBOX_APPS);
    await desktop.refreshAppIcons();
    await taskbar.refreshPinnedApps();

    // ── 11. Theme change broadcast ────────────────────────────────────────────
    // When settings change, broadcast to all running apps
    settings.onChange(async (newTheme) => {
      wm.applyTheme(newTheme);
      kernel.broadcast('themeChanged', newTheme);
    });

    // Set up the local profile and theme on first launch.
    await showFirstRunOnboarding(settings);

    // ── Done ──────────────────────────────────────────────────────────────────
    console.log('[bos] BrowserOS v2 ready ✓');

  } catch (err) {
    // Boot failure — show a readable error screen
    console.error('[bos] Boot failed:', err);
    document.body.innerHTML = `
      <div style="
        display:flex;flex-direction:column;align-items:center;justify-content:center;
        height:100vh;background:#0a0010;color:#ff8888;font-family:monospace;
        gap:16px;padding:32px;text-align:center;
      ">
        <div style="font-size:48px">💥</div>
        <div style="font-size:20px;color:#fff">BrowserOS failed to boot</div>
        <pre style="
          background:rgba(255,255,255,0.05);border-radius:8px;padding:16px;
          font-size:12px;color:#ffaaaa;white-space:pre-wrap;max-width:600px;text-align:left;
        ">${err.stack || err.message}</pre>
        <button onclick="location.reload()" style="
          background:#0078d4;border:none;color:#fff;padding:10px 24px;
          border-radius:6px;cursor:pointer;font-size:14px;
        ">Retry</button>
      </div>
    `;
  }
}

boot();
