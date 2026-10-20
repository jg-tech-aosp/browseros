/** A static 2% lens applied only to backdrop pixels, never foreground DOM. */
const SVG = 'http://www.w3.org/2000/svg';
const CONTRACTION = 1 - 1 / 1.02;
let manager = null;
let cachedField = null;

function svg(tag, attributes) {
  const node = document.createElementNS(SVG, tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  return node;
}

function displacementField() {
  // Generate a mathematical two-channel coordinate field; no page is captured.
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Coordinate field unavailable');
  const image = context.createImageData(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const offset = (y * size + x) * 4;
    image.data[offset] = Math.round(255 * (1 - x / (size - 1)));
    image.data[offset + 1] = Math.round(255 * (1 - y / (size - 1)));
    image.data[offset + 2] = 128;
    image.data[offset + 3] = 255;
  }
  context.putImageData(image, 0, 0);
  return canvas.toDataURL();
}

class IceLens {
  constructor(selector) {
    this.selector = selector;
    this.entries = new Map();
    this.serial = 0;
    this.field = cachedField ||= displacementField();
    this.root = svg('svg', { width: 0, height: 0, 'aria-hidden': 'true', focusable: 'false', id: 'bos-ice-lenses' });
    this.root.style.cssText = 'position:fixed;width:0;height:0;pointer-events:none';
    this.defs = svg('defs', {}); this.root.append(this.defs); document.body.append(this.root);
    this.resize = new ResizeObserver(records => {
      for (const record of records) this.fit(record.target);
    });
    this.mutations = new MutationObserver(records => {
      let removed = false;
      for (const record of records) {
        if (record.target.namespaceURI === SVG) continue;
        for (const node of record.addedNodes) {
          if (node.nodeType !== 1 || node.namespaceURI === SVG) continue;
          this.scan(node);
        }
        if ([...record.removedNodes].some(node => node.nodeType === 1 && node.namespaceURI !== SVG)) removed = true;
      }
      if (removed) for (const [target, entry] of this.entries) {
        if (!target.isConnected) this.remove(target, entry);
      }
    });
    this.scan(document.body);
    this.mutations.observe(document.body, { childList: true, subtree: true });
  }

  scan(node) {
    if (node.matches(this.selector)) this.add(node);
    node.querySelectorAll(this.selector).forEach(target => this.add(target));
  }

  add(target) {
    if (this.entries.has(target)) return;
    const id = 'bos-ice-lens-' + ++this.serial;
    const filter = svg('filter', { id, x: 0, y: 0, width: 1, height: 1, filterUnits: 'objectBoundingBox', primitiveUnits: 'objectBoundingBox', 'color-interpolation-filters': 'sRGB' });
    const field = svg('feImage', { href: this.field, x: 0, y: 0, width: 1, height: 1, preserveAspectRatio: 'none', result: 'coordinates' });
    const transfer = svg('feComponentTransfer', { in: 'coordinates', result: 'sized-coordinates' });
    const red = svg('feFuncR', { type: 'linear' });
    const green = svg('feFuncG', { type: 'linear' });
    transfer.append(red, green);
    const lens = svg('feDisplacementMap', { in: 'SourceGraphic', in2: 'sized-coordinates', xChannelSelector: 'R', yChannelSelector: 'G', scale: 0 });
    filter.append(field, transfer, lens); this.defs.append(filter);
    this.entries.set(target, { filter, red, green, lens });
    this.fit(target);
    target.style.setProperty('--wm-ice-lens', 'url("#' + id + '")');
    this.resize.observe(target);
  }

  fit(target) {
    const entry = this.entries.get(target);
    if (!entry) return;
    const { width, height } = target.getBoundingClientRect();
    if (!width || !height) { entry.lens.setAttribute('scale', 0); return; }
    const longest = Math.max(width, height);
    // SVG displacement scale uses the box width for both axes. Correct the
    // channels for aspect ratio so a wide taskbar is not magnified vertically.
    for (const [channel, ratio] of [[entry.red, width / longest], [entry.green, height / longest]]) {
      channel.setAttribute('slope', ratio);
      channel.setAttribute('intercept', (1 - ratio) / 2);
    }
    entry.lens.setAttribute('scale', CONTRACTION * longest / width);
  }

  remove(target, entry) {
    this.resize.unobserve(target);
    target.style.removeProperty('--wm-ice-lens');
    entry.filter.remove(); this.entries.delete(target);
  }

  destroy() {
    this.mutations.disconnect(); this.resize.disconnect();
    for (const [target, entry] of this.entries) this.remove(target, entry);
    this.root.remove();
  }
}

export function syncIceLens(enabled, selector) {
  // SVG backdrop URLs are not rendered consistently by non-Chromium engines,
  // even when CSS.supports accepts them. Preserve their normal frosted backdrop.
  const svgBackdrop = /\b(?:Chrome|Chromium|Edg)\//.test(navigator.userAgent) &&
    typeof ResizeObserver !== 'undefined' && typeof MutationObserver !== 'undefined';
  if (enabled && svgBackdrop && !manager) {
    try { manager = new IceLens(selector); }
    catch (_) { manager = null; }
  } else if ((!enabled || !svgBackdrop) && manager) {
    manager.destroy(); manager = null;
  }
}

