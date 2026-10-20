/**
 * BrowserOS 3 — Video Player (Native System Component)
 * Plays local files from the BrowserOS virtual filesystem.
 */

const VIDEO_TYPES = ['.mp4', '.webm', '.m4v', '.mov', '.ogv'];

function mimeFor(path, stat) {
  if (stat?.mime && stat.mime !== 'application/octet-stream') return stat.mime;
  const ext = String(path).split('.').pop().toLowerCase();
  return ({
    mp4: 'video/mp4',
    webm: 'video/webm',
    m4v: 'video/mp4',
    mov: 'video/quicktime',
    ogv: 'video/ogg',
  })[ext] || 'video/mp4';
}

function fileSource(content, mime) {
  if (typeof content !== 'string' || !content) throw new Error('This file is empty.');
  if (content.startsWith('data:')) return { src: content, objectUrl: null };

  const encoded = content.replace(/\s/g, '');
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const objectUrl = URL.createObjectURL(new Blob([bytes], { type: mime }));
  return { src: objectUrl, objectUrl };
}

export function registerVideoPlayer({ wm, fs }) {
  wm.registerSystemApp('videoplayer', {
    title: 'Video Player',
    icon: '🎬',
    width: 760,
    height: 520,
    fileTypes: VIDEO_TYPES,
    mount(container, instanceId, args) {
      let objectUrl = null;
      let loadToken = 0;
      let disposed = false;

      container.style.cssText = 'display:flex;flex-direction:column;height:100%;min-height:0;overflow:hidden;background:#080a0e;color:#f5f7fa;font-family:var(--wm-font,system-ui,sans-serif)';
      const toolbar = document.createElement('div');
      toolbar.style.cssText = 'display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--wm-bg,#171a20);border-bottom:1px solid var(--wm-border,rgba(255,255,255,.12));flex-shrink:0';
      const openButton = document.createElement('button');
      openButton.type = 'button';
      openButton.textContent = '📁 Open File Manager';
      openButton.style.cssText = 'padding:7px 11px;border:1px solid var(--wm-border,rgba(255,255,255,.18));border-radius:7px;background:var(--wm-control-bg,rgba(255,255,255,.08));color:var(--wm-text,#fff);cursor:pointer;font:inherit;font-size:12px';
      const name = document.createElement('div');
      name.textContent = 'No video selected';
      name.style.cssText = 'min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--wm-text-dim,#aaa);font-size:13px';
      toolbar.append(openButton, name);

      const stage = document.createElement('div');
      stage.style.cssText = 'position:relative;display:flex;align-items:center;justify-content:center;flex:1;min-height:0;padding:12px;background:#080a0e';
      const video = document.createElement('video');
      video.controls = true;
      video.preload = 'metadata';
      video.playsInline = true;
      video.style.cssText = 'display:none;max-width:100%;max-height:100%;width:100%;height:100%;object-fit:contain';
      const message = document.createElement('div');
      message.textContent = 'Open a video from File Manager. Supported formats depend on your browser.';
      message.style.cssText = 'max-width:440px;padding:24px;text-align:center;color:#c3c9d4;font-size:14px;line-height:1.5';
      stage.append(video, message);
      container.append(toolbar, stage);

      openButton.onclick = () => wm.openSystemApp('filemanager');

      async function openFile(path) {
        const token = ++loadToken;
        name.textContent = path.split('/').pop() || path;
        message.textContent = 'Loading video…';
        message.style.display = '';
        video.style.display = 'none';
        try {
          const [content, stat] = await Promise.all([fs.read(path), fs.stat(path)]);
          if (disposed || token !== loadToken) return;
          if (content == null) throw new Error('Could not read this file from the BrowserOS filesystem.');
          const source = fileSource(content, mimeFor(path, stat));
          if (disposed || token !== loadToken) {
            if (source.objectUrl) URL.revokeObjectURL(source.objectUrl);
            return;
          }
          if (objectUrl) URL.revokeObjectURL(objectUrl);
          objectUrl = source.objectUrl;
          video.src = source.src;
          video.load();
          video.style.display = 'block';
          message.style.display = 'none';
          wm.setWindowTitle(instanceId, '🎬 ' + (path.split('/').pop() || 'Video Player'));
        } catch (error) {
          if (disposed || token !== loadToken) return;
          message.textContent = error.message || 'Could not open this video.';
          message.style.display = '';
          video.style.display = 'none';
          wm.notify('Could not open video: ' + (error.message || error));
        }
      }

      video.addEventListener('error', () => {
        if (!disposed && video.src) {
          message.textContent = 'This video format or codec is not supported by your browser.';
          message.style.display = '';
        }
      });

      if (args?.file) openFile(args.file);

      return () => {
        disposed = true;
        loadToken++;
        video.pause();
        video.removeAttribute('src');
        video.load();
        if (objectUrl) URL.revokeObjectURL(objectUrl);
      };
    },
  });
}
