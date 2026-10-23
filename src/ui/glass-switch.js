/** Shared Clear Ice switch: a raised glass thumb over a colored track. */
const STYLES = `
  .bos-glass-switch {
    --bos-switch-offset:0px;
    position:relative; isolation:isolate; display:inline-block;
    flex:0 0 66px; width:66px; height:40px; margin-left:12px;
    padding:0; border:0; border-radius:999px; background:transparent;
    color:var(--wm-text); cursor:pointer; vertical-align:middle;
    -webkit-tap-highlight-color:transparent;
  }
  .bos-glass-switch::before {
    content:''; position:absolute; inset:8px 3px; border-radius:999px;
    background-color:var(--wm-hover);
    background-color:color-mix(in srgb,var(--wm-text) 18%,var(--wm-bg));
    background-image:linear-gradient(180deg,rgba(0,15,30,.1),rgba(255,255,255,.06));
    border:1px solid var(--wm-control-border);
    box-shadow:inset 0 1px 3px rgba(0,12,28,.16);
    transition:background-color .22s ease,box-shadow .22s ease;
  }
  .bos-glass-switch[aria-checked="true"] { --bos-switch-offset:24px; }
  .bos-glass-switch[aria-checked="true"]::before {
    background-color:var(--wm-accent);
    box-shadow:inset 0 1px 3px rgba(0,12,28,.14),0 0 0 1px color-mix(in srgb,var(--wm-accent) 16%,transparent);
  }
  .bos-glass-switch-thumb {
    position:absolute; left:3px; top:4px; width:36px; height:32px;
    border-radius:999px; border:1px solid rgba(255,255,255,.8);
    background:linear-gradient(145deg,#fff,#e6f2fa);
    box-shadow:inset 0 1px 1px rgba(255,255,255,.8),inset 0 -1px 2px rgba(12,40,66,.12),0 2px 5px rgba(0,12,30,.22);
    pointer-events:none; transform:translateX(var(--bos-switch-offset));
    transition:transform .25s cubic-bezier(.2,.8,.25,1),background-color .22s ease,box-shadow .22s ease;
  }
  .bos-clear-ice .bos-glass-switch-thumb {
    background-color:rgba(255,255,255,.2);
    background-image:linear-gradient(145deg,rgba(255,255,255,.64),rgba(255,255,255,.14) 45%,rgba(238,249,255,.27));
    -webkit-backdrop-filter:blur(5px) saturate(140%);
    backdrop-filter:blur(5px) saturate(140%);
  }
  .bos-glass-switch-thumb::after {
    content:''; position:absolute; inset:2px 4px 55%; border-radius:999px;
    background:linear-gradient(180deg,rgba(255,255,255,.62),rgba(255,255,255,0));
    pointer-events:none;
  }
  .bos-glass-switch:hover:not(:disabled) .bos-glass-switch-thumb {
    box-shadow:inset 0 1px 1px rgba(255,255,255,.85),inset 0 -1px 2px rgba(12,40,66,.12),0 3px 7px rgba(0,12,30,.25);
  }
  .bos-glass-switch:active:not(:disabled) .bos-glass-switch-thumb {
    transform:translateX(var(--bos-switch-offset)) scale(1.07,1.04);
  }
  .bos-glass-switch:focus-visible { outline:2px solid var(--wm-accent); outline-offset:3px; }
  .bos-glass-switch:disabled { opacity:.45; cursor:default; }
  .bos-glass-switch[aria-busy="true"]:disabled { opacity:1; cursor:progress; }
  .bos-reduce-motion .bos-glass-switch:active .bos-glass-switch-thumb { transform:translateX(var(--bos-switch-offset)); }
  @media(prefers-reduced-motion:reduce) {
    .bos-glass-switch::before,.bos-glass-switch-thumb { transition:none; }
    .bos-glass-switch:active .bos-glass-switch-thumb { transform:translateX(var(--bos-switch-offset)); }
  }
  @media(forced-colors:active) {
    .bos-glass-switch::before { background:Canvas; border-color:ButtonText; box-shadow:none; }
    .bos-glass-switch[aria-checked="true"]::before { background:Highlight; box-shadow:none; }
    .bos-glass-switch-thumb,.bos-clear-ice .bos-glass-switch-thumb { background:ButtonText; border-color:Canvas; box-shadow:none; -webkit-backdrop-filter:none; backdrop-filter:none; }
    .bos-glass-switch-thumb::after { display:none; }
  }
`;

export function setGlassSwitch(button, checked) {
  button.setAttribute('aria-checked', String(Boolean(checked)));
}

export function createGlassSwitch(checked, label) {
  if (!document.getElementById('bos-glass-switch-styles')) {
    const style = document.createElement('style');
    style.id = 'bos-glass-switch-styles'; style.textContent = STYLES;
    document.head.appendChild(style);
  }
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'bos-glass-switch';
  button.setAttribute('role', 'switch');
  if (label) button.setAttribute('aria-label', label);
  const thumb = document.createElement('span');
  thumb.className = 'bos-glass-switch-thumb'; thumb.setAttribute('aria-hidden', 'true');
  button.appendChild(thumb); setGlassSwitch(button, checked);
  return button;
}

