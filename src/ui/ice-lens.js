/** Rounded glass refraction applied only to backdrop pixels, never app DOM. */
const SVG = 'http://www.w3.org/2000/svg';
const CONTRACTION = 1 - 1 / 1.02;
let manager = null;
const cachedFields = new Map();

function svg(tag, attributes) {
  const node = document.createElementNS(SVG, tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  return node;
}

function displacementField(width, height, radii) {
  // Map the surface's rounded rectangle in CSS pixels. Unlike a linear zoom,
  // the bevel bends around the corners and relaxes at the outer boundary.
  const key = [width, height, ...radii].join(':');
  if (cachedFields.has(key)) {
    const field = cachedFields.get(key);
    cachedFields.delete(key); cachedFields.set(key, field);
    return field;
  }
  const bevel = Math.min(22, Math.min(width, height) * .4);
  const bend = bevel * .2;
  const maxShift = 2 + bend;
  const resolution = Math.min(1, 512 / Math.max(width, height));
  const mapWidth = Math.max(32, Math.ceil(width * resolution));
  const mapHeight = Math.max(32, Math.ceil(height * resolution));
  const canvas = document.createElement('canvas');
  canvas.width = mapWidth; canvas.height = mapHeight;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Coordinate field unavailable');
  const image = context.createImageData(mapWidth, mapHeight);
  for (let y = 0; y < mapHeight; y++) for (let x = 0; x < mapWidth; x++) {
    const px = (x + .5) / mapWidth * width - width / 2;
    const py = (y + .5) / mapHeight * height - height / 2;
    const radius = radii[py < 0 ? (px < 0 ? 0 : 1) : (px < 0 ? 3 : 2)];
    const qx = Math.abs(px) - width / 2 + radius;
    const qy = Math.abs(py) - height / 2 + radius;
    const cx = Math.max(qx, 0), cy = Math.max(qy, 0);
    const cornerLength = Math.hypot(cx, cy);
    const distance = radius - cornerLength - Math.min(Math.max(qx, qy), 0);
    let nx = 0, ny = 0;
    if (cornerLength > 0) {
      nx = Math.sign(px) * cx / cornerLength;
      ny = Math.sign(py) * cy / cornerLength;
    } else if (qx > qy) nx = Math.sign(px);
    else ny = Math.sign(py);

    const t = Math.min(1, Math.max(0, distance / bevel));
    const edgeBend = bend * Math.sin(Math.PI * t);
    const centerFade = t * t * (3 - 2 * t);
    // A smooth 2 px bound prevents long taskbars producing large translations.
    const dx = -2 * Math.tanh(px * CONTRACTION / 2) * centerFade - nx * edgeBend;
    const dy = -2 * Math.tanh(py * CONTRACTION / 2) * centerFade - ny * edgeBend;
    const offset = (y * mapWidth + x) * 4;
    image.data[offset] = Math.round(255 * (.5 + dx / (2 * maxShift)));
    image.data[offset + 1] = Math.round(255 * (.5 + dy / (2 * maxShift)));
    image.data[offset + 2] = 128;
    image.data[offset + 3] = 255;
  }
  context.putImageData(image, 0, 0);
  const field = { url: canvas.toDataURL(), scale: 2 * maxShift };
  cachedFields.set(key, field);
  if (cachedFields.size > 16) cachedFields.delete(cachedFields.keys().next().value);
  return field;
}

class IceLens {
  constructor(selector) {
    this.selector = selector;
    this.entries = new Map();
    this.serial = 0;
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
    const field = svg('feImage', { x: 0, y: 0, width: 1, height: 1, preserveAspectRatio: 'none', result: 'coordinates' });
    const lens = svg('feDisplacementMap', { in: 'SourceGraphic', in2: 'coordinates', xChannelSelector: 'R', yChannelSelector: 'G', scale: 0 });
    filter.append(field, lens); this.defs.append(filter);
    this.entries.set(target, { filter, field, lens });
    this.fit(target);
    target.style.setProperty('--wm-ice-lens', 'url("#' + id + '")');
    this.resize.observe(target);
  }

  fit(target) {
    const entry = this.entries.get(target);
    if (!entry) return;
    // Layout dimensions do not wobble with opening/menu scale animations.
    const width = target.offsetWidth, height = target.offsetHeight;
    if (!width || !height) return;
    const style = getComputedStyle(target);
    const radii = [style.borderTopLeftRadius, style.borderTopRightRadius, style.borderBottomRightRadius, style.borderBottomLeftRadius]
      .map(value => Math.min(width / 2, height / 2, Math.max(0, parseFloat(value) || 0)));
    const dimensions = [width, height, ...radii].join(':');
    if (entry.dimensions === dimensions) return;
    const field = displacementField(width, height, radii);
    entry.field.setAttribute('href', field.url);
    // objectBoundingBox displacement scale uses box width for both axes.
    // Encode both channels in pixels, then divide by width exactly once.
    entry.lens.setAttribute('scale', field.scale / width);
    entry.dimensions = dimensions;
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

