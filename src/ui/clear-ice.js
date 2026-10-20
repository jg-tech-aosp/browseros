/** Clear Ice shell material. Filters affect the backdrop, never app content. */
import { syncIceLens } from './ice-lens.js';
export function boundedNumber(value, fallback, min, max) {
  if (value == null || value === '' || typeof value === 'boolean') return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

function rgba(hex, opacity) {
  return 'rgba(' + [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16)).join(',') + ',' + opacity.toFixed(3) + ')';
}

export function iceVariables({ colors, darkMode, glassBlur, glassTint }) {
  const blur = boundedNumber(glassBlur, 16, 0, 40);
  const tint = boundedNumber(glassTint, 44, 0, 100) / 100;
  const opacity = darkMode ? .22 + tint * .64 : .34 + tint * .58;
  const rim = darkMode ? 'rgba(205,225,240,.18)' : 'rgba(32,62,84,.18)';
  return {
    '--wm-backdrop-filter': 'blur(' + blur + 'px) saturate(165%) contrast(104%)',
    '--wm-titlebar-bg': rgba(colors.titlebar, opacity),
    '--wm-taskbar-bg': rgba(colors.taskbar, opacity + .04),
    '--wm-panel-bg': rgba(colors.panel, opacity),
    '--wm-control-bg': darkMode ? 'rgba(255,255,255,.075)' : 'rgba(255,255,255,.3)',
    '--wm-control-hover': darkMode ? 'rgba(255,255,255,.18)' : 'rgba(255,255,255,.64)',
    '--wm-panel-border': rim,
    '--wm-radius': '16px',
    '--wm-ice-frame': rgba(colors.titlebar, .09 + tint * .12),
    '--wm-ice-rim': rim,
    '--wm-ice-sheen': 'linear-gradient(135deg,rgba(255,255,255,' + (darkMode ? '.15' : '.48') + '),rgba(255,255,255,.025) 38%,transparent 62%,rgba(160,215,255,.09))',
    '--wm-ice-edge': darkMode
      ? 'linear-gradient(135deg,rgba(255,255,255,.38),rgba(200,235,255,.1) 24%,transparent 49%,rgba(4,17,29,.26) 72%,rgba(218,242,255,.14))'
      : 'linear-gradient(135deg,rgba(255,255,255,.72),rgba(255,255,255,.2) 24%,transparent 49%,rgba(20,40,60,.2) 72%,rgba(255,255,255,.25))',
    '--wm-ice-shadow': 'inset 0 1px 0 rgba(255,255,255,' + (darkMode ? '.12' : '.48') + '),inset 0 -1px 0 rgba(7,25,42,.2),0 2px 5px rgba(3,14,25,' + (darkMode ? '.2' : '.1') + '),0 9px 22px -5px rgba(3,14,25,' + (darkMode ? '.44' : '.24') + ')',
    '--wm-ice-control-shadow': 'inset 0 1px 0 rgba(255,255,255,' + (darkMode ? '.12' : '.42') + '),inset 0 -1px 0 rgba(0,20,40,.12),0 2px 5px rgba(0,10,25,.08)',
    '--wm-ice-text-shadow': darkMode ? '0 1px 3px rgba(0,8,18,.55)' : '0 1px 1px rgba(255,255,255,.55)',
  };
}

const panels = ':is(#bos-startmenu,#bos-startmenu-app-menu,#bos-ctx-menu,#bos-calendar-clock-panel,#bos-taskbar-preview,#bos-notif-panel,#bos-qs-panel,#bos-search-box,.wm-switcher-panel,.wm-toast,.bos-widget,#bos-widget-gallery section,.bos-ice-demo-surface)';

const STYLES = `
  /* The shell already uses translucent colors and backdrop-filter variables.
     These optical layers add a subtle rim, directional reflections, and depth.
     Fixed selectors intentionally override existing shell inline decoration. */
  .bos-clear-ice .wm-window {
    padding:2px; background-color:var(--wm-ice-frame); background-image:var(--wm-ice-sheen);
    border-color:var(--wm-ice-rim); box-shadow:var(--wm-ice-shadow);
  }
  .bos-clear-ice .wm-window.focused { box-shadow:var(--wm-ice-shadow),0 0 0 1px color-mix(in srgb,var(--wm-accent) 30%,transparent); }
  .bos-clear-ice .wm-window:is(.maximized,.wm-snapped) { padding:0; border-radius:0; }
  .bos-clear-ice .wm-titlebar {
    position:relative; border-radius:13px 13px 0 0; background-image:var(--wm-ice-sheen);
    border-bottom-color:var(--wm-separator); box-shadow:inset 0 1px 0 rgba(255,255,255,.1);
    -webkit-backdrop-filter:var(--wm-backdrop-filter); text-shadow:var(--wm-ice-text-shadow);
  }
  .bos-clear-ice .wm-window:is(.maximized,.wm-snapped) .wm-titlebar { border-radius:0; }
  .bos-clear-ice .wm-window > [id^="wm-body-"] { border-radius:0 0 13px 13px; }
  .bos-clear-ice .wm-window:is(.maximized,.wm-snapped) > [id^="wm-body-"] { border-radius:0; }
  .bos-clear-ice #wm-taskbar {
    background-image:var(--wm-ice-sheen); border-top-color:var(--wm-ice-rim);
    box-shadow:inset 0 1px 0 rgba(255,255,255,.12),0 -3px 12px rgba(0,15,30,.16);
    -webkit-backdrop-filter:var(--wm-backdrop-filter);
  }
  .bos-clear-ice ${panels} {
    background-image:var(--wm-ice-sheen)!important;
    border-color:var(--wm-ice-rim)!important; box-shadow:var(--wm-ice-shadow)!important;
    -webkit-backdrop-filter:var(--wm-backdrop-filter); backdrop-filter:var(--wm-backdrop-filter);
  }
  .bos-clear-ice :is(.wm-titlebar,#wm-taskbar,${panels})[style*="--wm-ice-lens"] {
    -webkit-backdrop-filter:var(--wm-ice-lens) var(--wm-backdrop-filter)!important;
    backdrop-filter:var(--wm-ice-lens) var(--wm-backdrop-filter)!important;
  }
  /* An inset masked rim stays above content without intercepting pointer events.
     It needs no copied app DOM, screen capture, or animation loop. */
  @supports (mask-composite:exclude) or (-webkit-mask-composite:xor) {
  .bos-clear-ice :is(.wm-window,${panels})::after {
    content:''; position:absolute; inset:0; border-radius:inherit; padding:1px;
    background:var(--wm-ice-edge); pointer-events:none; z-index:4;
    -webkit-mask:linear-gradient(#fff 0 0) content-box,linear-gradient(#fff 0 0);
    mask:linear-gradient(#fff 0 0) content-box,linear-gradient(#fff 0 0);
    -webkit-mask-composite:xor; mask-composite:exclude;
  }
  }
  .bos-clear-ice :is(.wm-switcher-panel,#bos-widget-gallery section,#bos-search-box,.wm-toast) { position:relative; }
  .bos-clear-ice :is(.wm-btn,.wm-taskbar-btn) {
    position:relative; border:1px solid var(--wm-control-border); border-radius:10px;
    background-image:var(--wm-ice-sheen); box-shadow:var(--wm-ice-control-shadow);
  }
  .bos-clear-ice .wm-taskbar-btn.active { background-color:color-mix(in srgb,var(--wm-accent) 27%,transparent); }
  .bos-clear-ice .wm-btn.wm-btn-close:hover { background:#c42b1c; color:#fff; }
  .bos-clear-ice .bos-widget-header { text-shadow:var(--wm-ice-text-shadow); }
  .bos-clear-ice .bos-widget { border-radius:20px; }
  .bos-clear-ice :is(.bos-widget-event,.bos-widget-file,.bos-widget-action) { box-shadow:var(--wm-ice-control-shadow); }
  .bos-ice-demo-stage { position:relative; height:136px; overflow:hidden; border-radius:14px; margin:12px 0; background:radial-gradient(ellipse at 22% 85%,#80c8f1 0,transparent 48%),radial-gradient(ellipse at 80% 5%,#8d90dc 0,transparent 55%),#244e6b; }
  .bos-ice-demo-surface { position:absolute; inset:17px 28px 17px 46px; padding:18px; border-radius:18px; border:1px solid var(--wm-panel-border); background-color:var(--wm-panel-bg); color:var(--wm-text); display:flex; flex-direction:column; justify-content:center; gap:5px; }
  .bos-clear-ice .bos-ice-demo-surface { position:absolute; }
  .bos-ice-range { width:100%; accent-color:var(--wm-accent); cursor:pointer; }
  .bos-ice-range:disabled { cursor:default; opacity:.4; }
  .bos-ice-range:focus-visible { outline:2px solid var(--wm-accent); outline-offset:4px; border-radius:8px; }
  .bos-ice-disabled { opacity:.5; }
  @media (forced-colors:active) {
    .bos-clear-ice :is(.wm-titlebar,#wm-taskbar,${panels})[style*="--wm-ice-lens"] { -webkit-backdrop-filter:none!important; backdrop-filter:none!important; }
    .bos-clear-ice :is(.wm-window,.wm-titlebar,#wm-taskbar,${panels}) { background:Canvas!important; color:CanvasText!important; box-shadow:none!important; border-color:CanvasText!important; -webkit-backdrop-filter:none!important; backdrop-filter:none!important; }
    .bos-clear-ice :is(.wm-window,${panels})::after { display:none; }
  }
`;

export function syncClearIce(theme) {
  let style = document.getElementById('bos-clear-ice-styles');
  if (!style) {
    style = document.createElement('style'); style.id = 'bos-clear-ice-styles';
    style.textContent = STYLES; document.head.appendChild(style);
  }
  const supported = typeof CSS !== 'undefined' &&
    (CSS.supports('backdrop-filter', 'blur(1px)') || CSS.supports('-webkit-backdrop-filter', 'blur(1px)'));
  const enabled = supported && theme.transparency !== false && theme.clearIce !== false;
  document.documentElement.classList.toggle('bos-clear-ice', enabled);
  document.documentElement.dataset.clearIce = enabled ? 'on' : 'off';
  syncIceLens(enabled, '.wm-titlebar,#wm-taskbar,' + panels);
  // A browser with no backdrop filters receives readable solid surfaces.
  return supported ? theme : { ...theme, transparency: false };
}

