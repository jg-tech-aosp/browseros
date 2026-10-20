/** Opaque native app islands, with small glass layers on selected navigation. */
const STYLES = `
  .bos-native-app {
    --bos-island-bg:var(--wm-titlebar);
    --bos-island-bg:color-mix(in srgb,var(--wm-titlebar) 68%,var(--wm-bg));
    display:flex; flex:1; flex-direction:row; position:relative; height:100%; min-width:0; min-height:0; overflow:hidden;
    background:var(--wm-bg); color:var(--wm-text); container-type:inline-size;
  }
  .bos-native-settings { gap:12px; padding:12px; }
  .bos-native-files { flex-direction:column; }
  .bos-native-file-layout { display:flex; flex:1; min-height:0; min-width:0; gap:12px; padding:12px; overflow:hidden; }
  .bos-native-sidebar {
    flex:0 0 168px; width:168px; min-height:0; padding:9px;
    overflow-y:auto; overscroll-behavior:contain;
    background:var(--bos-island-bg); border:1px solid var(--wm-separator);
    border-radius:18px;
    box-shadow:0 3px 9px rgba(0,8,18,.08),inset 0 1px 0 rgba(255,255,255,.06);
  }
  .bos-native-settings > .bos-native-sidebar { flex-basis:188px; width:188px; }
  .bos-native-nav-item {
    position:relative; isolation:isolate;
    display:block; width:100%; min-height:38px; margin:0 0 4px;
    padding:9px 10px; border:1px solid transparent; border-radius:11px;
    background:transparent; color:var(--wm-text); text-align:left;
    font:inherit; font-size:13px; line-height:1.35; cursor:pointer;
    overflow-wrap:anywhere;
    box-shadow:inset 0 1px 0 transparent,inset 0 -1px 0 transparent,0 2px 5px transparent;
    transition:background-color .2s ease,border-color .2s ease,box-shadow .2s ease,transform .16s cubic-bezier(.2,.75,.25,1);
  }
  .bos-native-nav-item::before {
    content:''; position:absolute; inset:0; border-radius:inherit; z-index:-1;
    pointer-events:none; opacity:0;
    background:var(--wm-ice-sheen,linear-gradient(135deg,rgba(255,255,255,.18),transparent 65%));
    transition:opacity .2s ease;
  }
  .bos-native-nav-item:hover { background:var(--wm-hover); }
  .bos-native-nav-item:active { transform:scale(.975); }
  .bos-native-nav-item[aria-current="page"] {
    background:var(--wm-hover);
    background:color-mix(in srgb,var(--wm-accent) 16%,var(--bos-island-bg));
    border-color:color-mix(in srgb,var(--wm-accent) 28%,var(--wm-control-border));
    box-shadow:var(--wm-ice-control-shadow,inset 0 1px 0 rgba(255,255,255,.2),inset 0 -1px 0 rgba(0,20,40,.12),0 2px 5px rgba(0,10,25,.08));
  }
  .bos-native-nav-item[aria-current="page"]::before { opacity:1; }
  .bos-clear-ice .bos-native-nav-item[aria-current="page"]::before {
    -webkit-backdrop-filter:blur(8px) saturate(125%); backdrop-filter:blur(8px) saturate(125%);
  }
  .bos-native-settings-main { flex:1; min-width:0; min-height:0; overflow:auto; padding:10px 10px 20px; }
  .bos-native-file-content { flex:1; min-width:0; min-height:0; overflow:auto; display:flex; flex-direction:column; position:relative; border-radius:12px; }
  .bos-native-toolbar {
    display:flex; flex-wrap:wrap; align-items:center; gap:6px; padding:10px 12px;
    flex-shrink:0; border-bottom:1px solid var(--wm-separator);
  }
  .bos-native-toolbar button {
    min-height:30px; padding:5px 9px; border:1px solid var(--wm-control-border);
    border-radius:9px; background:var(--wm-control-bg); color:var(--wm-text);
    font:inherit; font-size:12px; cursor:pointer; transition:background-color .12s;
  }
  .bos-native-toolbar button:hover { background:var(--wm-control-hover); }
  .bos-native-toolbar .bos-native-path {
    flex:1 1 120px; min-width:80px; min-height:30px; padding:5px 10px;
    border:1px solid var(--wm-control-border); border-radius:9px;
    background:var(--bos-island-bg); color:var(--wm-text); font:inherit; font-size:12px;
  }
  .bos-native-status { flex-shrink:0; padding:6px 14px; font-size:11px; color:var(--wm-text-dim); border-top:1px solid var(--wm-separator); }
  .bos-native-app :is(.bos-native-nav-item,.bos-native-toolbar button,.bos-native-path):focus-visible {
    outline:2px solid var(--wm-accent); outline-offset:2px;
  }
  @container (max-width:540px) {
    .bos-native-app .bos-native-sidebar { flex-basis:138px; width:138px; padding:6px; border-radius:14px; }
    .bos-native-nav-item { padding:9px 6px; font-size:12px; }
    .bos-native-settings-main { padding:8px 4px; }
  }
  @media (forced-colors:active) {
    .bos-native-app .bos-native-sidebar { background:Canvas; border-color:CanvasText; box-shadow:none; }
    .bos-native-nav-item[aria-current="page"] { background:Highlight; color:HighlightText; border-color:Highlight; box-shadow:none; }
    .bos-native-nav-item::before { display:none; }
  }
  .bos-reduce-motion .bos-native-nav-item:active { transform:none; }
  @media (prefers-reduced-motion:reduce) {
    .bos-native-nav-item,.bos-native-nav-item::before { transition:none; }
    .bos-native-nav-item:active { transform:none; }
  }
`;

export function styleNativeApp(container, layout) {
  if (!document.getElementById('bos-native-layout-styles')) {
    const style = document.createElement('style');
    style.id = 'bos-native-layout-styles'; style.textContent = STYLES;
    document.head.appendChild(style);
  }
  // Replace the window manager's generic inline column layout at app mount.
  container.style.cssText = '';
  container.classList.add('bos-native-app', 'bos-native-' + layout);
}

