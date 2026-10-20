/** Coordinated shell palettes, also shared with sandboxed apps through BOS.os.theme(). */
import { iceVariables } from './clear-ice.js';
export function resolveWallpaper(value, darkMode = true) {
  if (value !== 'builtin:clear-ice' && value !== 'builtin:clear-ice-light') return value;
  const light = value === 'builtin:clear-ice-light' || darkMode === false;
  const liquid = new URL(light
    ? '../../assets/wallpapers/clear-ice-light.png'
    : '../../assets/wallpapers/clear-ice.png', import.meta.url).href;
  return 'url("' + liquid + '") center / cover no-repeat fixed';
}

export const THEMES = [
  { id: 'classic', name: 'Galaxy', description: 'The original BrowserOS purple.', darkMode: true, accent: '#6857cf', wallpaper: 'linear-gradient(135deg,#0f0c29,#302b63,#24243e)', dark: ['#1e1e2e','#2a2a4a','#e0e0ff','#a6a6c5','#2d2d4e','#0f0c28','#141428'], light: ['#f0f0f5','#e0e0f0','#171724','#646475','#dddde9','#ebebf5','#fafaff'] },
  { id: 'clear-ice', name: 'Clear Ice', description: 'Liquid obsidian and ice-blue light.', darkMode: true, accent: '#1979ac', wallpaper: 'builtin:clear-ice', dark: ['#101923','#1b2d3d','#edf7ff','#a4bacb','#253b4e','#09121c','#142330'], light: ['#edf6fb','#d4e8f4','#162a38','#4c697a','#d3e6f2','#e2f0f8','#f6fbff'] },
  { id: 'arctic', name: 'Arctic', description: 'A bright, quiet blue workspace.', darkMode: false, accent: '#086fa9', wallpaper: 'linear-gradient(135deg,#b8d4e3,#d9ecf7)', dark: ['#15232e','#223a4a','#eef8ff','#a6c1d1','#2b495d','#0d1b25','#192d3a'], light: ['#f1f8fc','#dcecf5','#183344','#557182','#d8eaf5','#e6f2f9','#fbfdff'] },
  { id: 'midnight', name: 'Midnight', description: 'Deep navy with a blue accent.', darkMode: true, accent: '#4a6bc2', wallpaper: 'radial-gradient(ellipse at 72% 65%,#263e6c 0%,#101d35 42%,#050a15 100%)', dark: ['#111b2e','#1a2b47','#edf2ff','#a3b2d0','#263b5d','#080f20','#14213a'], light: ['#f0f4fd','#dce5fa','#192c4d','#536989','#dae4f6','#e7edfa','#fafcff'] },
  { id: 'forest', name: 'Forest', description: 'Evergreen surfaces and soft mint.', darkMode: true, accent: '#287b54', wallpaper: 'radial-gradient(ellipse at 70% 40%,#335f52,#112c26 55%,#071511)', dark: ['#15251f','#223c30','#eef8f0','#a3bfac','#2d4b3c','#0c1a14','#192e23'], light: ['#f0f7f0','#dcebdd','#1b3525','#57745e','#d8e8d8','#e6f1e6','#f9fcf7'] },
  { id: 'rose', name: 'Rose', description: 'Warm porcelain with a rose accent.', darkMode: false, accent: '#b43d66', wallpaper: 'linear-gradient(130deg,#edc6ce,#f8e8dc 50%,#cfbfdc)', dark: ['#2b1c26','#412b39','#fff0f5','#c7a7b9','#513445','#1f121b','#32202c'], light: ['#fcf3f3','#f1dfe3','#432534','#856271','#eddae1','#f6e8eb','#fff9f9'] },
  { id: 'ember', name: 'Ember', description: 'Charcoal, copper, and warm light.', darkMode: true, accent: '#a95e30', wallpaper: 'radial-gradient(ellipse at 75% 70%,#794228,#2d201e 50%,#100e12)', dark: ['#27211f','#3c2e27','#fff3e9','#c3ab97','#4d382e','#1a1412','#30251e'], light: ['#fbf3e9','#efdfca','#402e21','#7e6855','#ecdbc5','#f5e9d8','#fffaf3'] },
];

export const WALLPAPERS = [
  { label: 'Clear Ice', val: THEMES[1].wallpaper },
  { label: 'Clear Ice Light', val: 'builtin:clear-ice-light' },
  { label: 'Galaxy', val: THEMES[0].wallpaper },
  { label: 'Sunset', val: 'linear-gradient(135deg,#f093fb,#f5576c,#fda085)' },
  { label: 'Ocean', val: 'linear-gradient(135deg,#2193b0,#6dd5ed)' },
  { label: 'Forest', val: 'linear-gradient(135deg,#134e5e,#71b280)' },
  { label: 'Midnight', val: THEMES[3].wallpaper },
  { label: 'Neon', val: 'linear-gradient(135deg,#1a0533,#2d0d5e,#0d1b2a)' },
  { label: 'Lava', val: 'linear-gradient(135deg,#200122,#6f0000)' },
  { label: 'Arctic', val: THEMES[2].wallpaper },
];

export function themeColors(themeId = 'classic', darkMode = true) {
  const theme = THEMES.find(item => item.id === themeId) || THEMES[0];
  const [bg, titlebar, text, textDim, hover, taskbar, panel] = theme[darkMode ? 'dark' : 'light'];
  return { bg, titlebar, text, textDim, hover, taskbar, panel, border: darkMode ? '#516174' : '#b6bcc7' };
}

function translucent(hex, alpha) {
  const value = hex.slice(1);
  return 'rgba(' + [0, 2, 4].map(i => parseInt(value.slice(i, i + 2), 16)).join(',') + ',' + alpha + ')';
}

export function themeVariables({ themeId, darkMode = true, transparency = true, clearIce = true, glassBlur = 16, glassTint = 44 }) {
  const colors = themeColors(themeId, darkMode);
  const glass = transparency !== false;
  return {
    '--wm-bg': colors.bg,
    '--wm-titlebar': colors.titlebar,
    '--wm-titlebar-bg': glass ? translucent(colors.titlebar, .72) : colors.titlebar,
    '--wm-window-bg': glass ? 'transparent' : colors.bg,
    '--wm-titlebar-txt': colors.text,
    '--wm-text': colors.text,
    '--wm-text-dim': colors.textDim,
    '--wm-border': glass ? (darkMode ? 'rgba(255,255,255,.22)' : 'rgba(0,0,0,.18)') : colors.border,
    '--wm-hover': colors.hover,
    '--wm-taskbar-bg': glass ? translucent(colors.taskbar, .74) : colors.taskbar,
    '--wm-panel-bg': glass ? translucent(colors.panel, .82) : colors.panel,
    '--wm-panel-border': darkMode ? 'rgba(255,255,255,.16)' : 'rgba(0,0,0,.15)',
    '--wm-control-bg': darkMode ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.05)',
    '--wm-control-border': darkMode ? 'rgba(255,255,255,.15)' : 'rgba(0,0,0,.15)',
    '--wm-control-hover': darkMode ? 'rgba(255,255,255,.14)' : 'rgba(0,0,0,.09)',
    '--wm-separator': darkMode ? 'rgba(255,255,255,.12)' : 'rgba(0,0,0,.12)',
    '--wm-backdrop-filter': glass ? 'blur(24px)' : 'none',
    '--wm-radius': '8px',
    ...(glass && clearIce !== false ? iceVariables({ colors, darkMode, glassBlur, glassTint }) : {}),
  };
}

