/**
 * BrowserOS native Image Viewer.
 * Displays images stored in the BrowserOS virtual filesystem.
 */

export const IMAGE_EXTENSIONS = new Set([
  'apng', 'avif', 'bmp', 'gif', 'ico', 'jfif', 'jpeg', 'jpg', 'png', 'svg', 'webp',
]);

export function isImageFile(pathOrName) {
  const name = String(pathOrName || '').split('/').pop();
  const dot = name.lastIndexOf('.');
  return dot > 0 && IMAGE_EXTENSIONS.has(name.slice(dot + 1).toLowerCase());
}

const IMAGE_MIME_TYPES = {
  apng: 'image/apng',
  avif: 'image/avif',
  bmp: 'image/bmp',
  gif: 'image/gif',
  ico: 'image/x-icon',
  jfif: 'image/jpeg',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  png: 'image/png',
  svg: 'image/svg+xml',
  webp: 'image/webp',
};

function mimeFor(path, metadata) {
  if (metadata?.mime && metadata.mime !== 'application/octet-stream') return metadata.mime;
  const ext = String(path).split('.').pop().toLowerCase();
  return IMAGE_MIME_TYPES[ext] || 'application/octet-stream';
}

export function registerImageViewer({ wm, fs }) {
  wm.registerSystemApp('imageviewer', {
    title: 'Image Viewer',
    icon: '🖼️',
    width: 760,
    height: 560,

    mount(container, instanceId, args = {}) {
      container.style.cssText = 'display:flex;flex-direction:column;height:100%;overflow:hidden;background:var(--wm-bg);color:var(--wm-text)';

      const toolbar = document.createElement('div');
      toolbar.style.cssText = 'display:flex;align-items:center;gap:7px;padding:7px 10px;background:rgba(0,0,0,0.18);border-bottom:1px solid var(--wm-border);flex-shrink:0';
      container.appendChild(toolbar);

      const makeButton = (label, title, action) => {
        const button = document.createElement('button');
        button.textContent = label;
        button.title = title;
        button.style.cssText = 'background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.12);border-radius:5px;color:var(--wm-text);padding:5px 9px;cursor:pointer;font-size:12px';
        button.onclick = action;
        toolbar.appendChild(button);
        return button;
      };

      makeButton('📂 Open', 'Open Pictures in File Manager', () => {
        wm.openSystemApp('filemanager', { path: '/Pictures' });
      });
      makeButton('−', 'Zoom out', () => setZoom(zoom / 1.2));
      makeButton('Fit', 'Fit image to window', () => { fitMode = true; updateImageSize(); });
      makeButton('100%', 'Show image at actual size', () => { fitMode = false; setZoom(1); });
      makeButton('+', 'Zoom in', () => setZoom(zoom * 1.2));

      const filename = document.createElement('div');
      filename.style.cssText = 'margin-left:auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;color:var(--wm-text-dim)';
      filename.textContent = args.file ? String(args.file).split('/').pop() : 'No image open';
      toolbar.appendChild(filename);

      const viewport = document.createElement('div');
      viewport.style.cssText = 'flex:1;min-height:0;overflow:auto;background-color:#242424;background-image:linear-gradient(45deg,#303030 25%,transparent 25%),linear-gradient(-45deg,#303030 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#303030 75%),linear-gradient(-45deg,transparent 75%,#303030 75%);background-size:24px 24px;background-position:0 0,0 12px,12px -12px,-12px 0';
      container.appendChild(viewport);

      const stage = document.createElement('div');
      stage.style.cssText = 'box-sizing:border-box;display:flex;align-items:center;justify-content:center;min-width:100%;min-height:100%;width:max-content;padding:18px';
      viewport.appendChild(stage);

      const image = document.createElement('img');
      image.alt = '';
      image.style.cssText = 'display:none;flex:none;max-width:none;max-height:none;object-fit:contain;box-shadow:0 3px 18px rgba(0,0,0,0.35)';
      stage.appendChild(image);

      const placeholder = document.createElement('div');
      placeholder.style.cssText = 'max-width:360px;padding:24px;text-align:center;color:#ddd;background:rgba(0,0,0,0.55);border:1px solid rgba(255,255,255,0.12);border-radius:10px;line-height:1.5';
      placeholder.textContent = 'Open an image from File Manager to view it here.';
      stage.appendChild(placeholder);

      const status = document.createElement('div');
      status.style.cssText = 'padding:4px 10px;font-size:11px;color:var(--wm-text-dim);background:rgba(0,0,0,0.16);border-top:1px solid var(--wm-border);flex-shrink:0';
      status.textContent = 'Ready';
      container.appendChild(status);

      let zoom = 1;
      let fitMode = true;
      let naturalWidth = 0;
      let naturalHeight = 0;
      let objectUrl = null;
      let loadToken = 0;

      function updateImageSize() {
        if (!naturalWidth || !naturalHeight) return;
        if (fitMode) {
          const availableWidth = Math.max(1, viewport.clientWidth - 52);
          const availableHeight = Math.max(1, viewport.clientHeight - 52);
          zoom = Math.min(1, availableWidth / naturalWidth, availableHeight / naturalHeight);
        }
        image.style.width = Math.max(1, Math.round(naturalWidth * zoom)) + 'px';
        image.style.height = Math.max(1, Math.round(naturalHeight * zoom)) + 'px';
        status.textContent = naturalWidth + ' × ' + naturalHeight + ' px  •  ' + Math.round(zoom * 100) + '%';
      }

      function setZoom(nextZoom) {
        fitMode = false;
        zoom = Math.min(5, Math.max(0.1, nextZoom));
        updateImageSize();
      }

      const resizeObserver = typeof ResizeObserver === 'function'
        ? new ResizeObserver(() => { if (fitMode) updateImageSize(); })
        : null;
      if (resizeObserver) resizeObserver.observe(viewport);

      async function loadImage(path) {
        const token = ++loadToken;
        if (objectUrl) {
          URL.revokeObjectURL(objectUrl);
          objectUrl = null;
        }
        image.onload = null;
        image.onerror = null;
        image.removeAttribute('src');
        image.style.display = 'none';
        placeholder.style.display = 'block';
        naturalWidth = 0;
        naturalHeight = 0;

        if (!path) {
          filename.textContent = 'No image open';
          placeholder.textContent = 'Open an image from File Manager to view it here.';
          status.textContent = 'Ready';
          return;
        }

        filename.textContent = String(path).split('/').pop();
        placeholder.textContent = 'Loading image…';
        status.textContent = String(path);

        try {
          const [content, metadata] = await Promise.all([fs.read(path), fs.stat(path)]);
          if (token !== loadToken) return;
          if (content === null || !metadata || metadata.type !== 'file') {
            throw new Error('Image file not found');
          }

          const mime = mimeFor(path, metadata);
          let source = content;
          if (!source.startsWith('data:') && mime === 'image/svg+xml' && metadata.encoding === 'utf8') {
            objectUrl = URL.createObjectURL(new Blob([source], { type: mime }));
            source = objectUrl;
          } else if (!source.startsWith('data:') && !source.startsWith('blob:')) {
            source = 'data:' + mime + ';base64,' + source;
          }

          image.onload = () => {
            if (token !== loadToken) return;
            naturalWidth = image.naturalWidth;
            naturalHeight = image.naturalHeight;
            fitMode = true;
            image.style.display = 'block';
            placeholder.style.display = 'none';
            updateImageSize();
          };
          image.onerror = () => {
            if (token !== loadToken) return;
            image.style.display = 'none';
            placeholder.style.display = 'block';
            placeholder.textContent = 'This image could not be displayed.';
            status.textContent = filename.textContent;
          };
          image.src = source;
        } catch (error) {
          if (token !== loadToken) return;
          placeholder.textContent = error.message || 'Could not open this image.';
          status.textContent = 'Unable to display image';
        }
      }

      loadImage(args.file);

      return () => {
        loadToken++;
        if (resizeObserver) resizeObserver.disconnect();
        if (objectUrl) URL.revokeObjectURL(objectUrl);
      };
    },
  });
}
