/**
 * BrowserOS v2 — Settings
 * src/ui/settings.js
 *
 * Manages OS settings stored in IndexedDB.
 * Provides getTheme(), set(), get() and an onChange() callback system
 * so the rest of the OS can react to setting changes live.
 */

import { themeColors, resolveWallpaper } from './themes.js';

const DEFAULTS = {
  themeId: 'classic',
  desktopWidgets: [],
  accent:     '#0078d4',
  wallpaper:  'linear-gradient(135deg, #0f0c29, #302b63, #24243e)',
  font:       "'Segoe UI', system-ui, sans-serif",
  darkMode:   true,
  transparency: true,
  showClock:  true,
  interfaceScale: 100,
  reduceMotion: false,
  debugLayoutOutlines: false,
  iceMode: false,
  fileAssociations: {},
  pinnedApps: ['filemanager', 'texteditor', 'terminal', 'calculator', 'browser', 'paint', 'appstore', 'musicplayer', 'markdownviewer', 'sysmonitor'],
  userProfile: { name: 'User', avatar: null },
};

export class Settings {
  /** @param {import('../fs/db.js').DB} db */
  constructor(db) {
    this._db       = db;
    this._cache    = { ...DEFAULTS };
    this._handlers = []; // onChange listeners
  }

  async boot() {
    const saved = await this._db.settings.all();
    // Merge saved over defaults
    this._cache = { ...DEFAULTS, ...saved };
    this.applyAccessibility();
    this.applyDeveloperSettings();
    console.log('[settings] Loaded');
  }

  // ─── Read ──────────────────────────────────────────────────────────────────

  get(key) {
    return this._cache[key] ?? DEFAULTS[key];
  }

  getTheme() {
    return {
      themeId: this._cache.themeId,
      colors: themeColors(this._cache.themeId, this._cache.darkMode),
      accent:    this._cache.accent,
      wallpaper: resolveWallpaper(this._cache.wallpaper),
      font:      this._cache.font,
      darkMode:  this._cache.darkMode,
      transparency: this._cache.transparency,
    };
  }

  getAll() {
    return { ...this._cache };
  }

  applyAccessibility() {
    const scale = [100, 115, 130].includes(Number(this._cache.interfaceScale))
      ? Number(this._cache.interfaceScale) : 100;
    document.documentElement.style.zoom = scale === 100 ? '' : scale + '%';
    document.documentElement.classList.toggle('bos-reduce-motion', !!this._cache.reduceMotion);
    let style = document.getElementById('bos-accessibility-styles');
    if (!style) {
      style = document.createElement('style');
      style.id = 'bos-accessibility-styles';
      style.textContent = 'html.bos-reduce-motion *,html.bos-reduce-motion *::before,html.bos-reduce-motion *::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important;scroll-behavior:auto!important}';
      document.head.appendChild(style);
    }
  }

  applyDeveloperSettings() {
    document.documentElement.classList.toggle('bos-debug-layout', this._cache.debugLayoutOutlines === true);
    let style = document.getElementById('bos-debug-layout-styles');
    if (!style) {
      style = document.createElement('style');
      style.id = 'bos-debug-layout-styles';
      style.textContent = 'html.bos-debug-layout * { outline: 1px solid rgba(255, 0, 128, .28) !important; }';
      document.head.appendChild(style);
    }
  }

  // ─── Write ─────────────────────────────────────────────────────────────────

  async set(key, value) {
    this._cache[key] = value;
    await this._db.settings.set(key, value);
    this.applyAccessibility();
    this.applyDeveloperSettings();
    // Fire onChange with new theme
    const theme = this.getTheme();
    this._handlers.forEach(fn => fn(theme, key, value));
  }

  async setMany(obj) {
    for (const [key, value] of Object.entries(obj)) {
      this._cache[key] = value;
      await this._db.settings.set(key, value);
    }
    this.applyAccessibility();
    this.applyDeveloperSettings();
    const theme = this.getTheme();
    this._handlers.forEach(fn => fn(theme, null, null));
  }

  async reset() {
    for (const [key, value] of Object.entries(DEFAULTS)) {
      await this._db.settings.set(key, value);
    }
    this._cache = { ...DEFAULTS };
    this.applyAccessibility();
    this.applyDeveloperSettings();
    const theme = this.getTheme();
    this._handlers.forEach(fn => fn(theme, null, null));
  }

  // ─── Change listeners ──────────────────────────────────────────────────────

  onChange(fn) {
    this._handlers.push(fn);
  }

  offChange(fn) {
    this._handlers = this._handlers.filter(h => h !== fn);
  }
}


