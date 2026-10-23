/**
 * BrowserOS — Filesystem
 * src/fs/fs.js
 *
 * Implements all filesystem operations defined in SPEC.md §5 BOS.fs.
 * Built on top of the IndexedDB wrapper (db.js).
 * This is the authoritative filesystem — nothing reads/writes IDB directly.
 */

import { DB } from './db.js';
import { OS_VERSION } from '../version.js';

// ─── Mime detection ───────────────────────────────────────────────────────────

const MIME_MAP = {
  txt:  'text/plain',
  md:   'text/markdown',
  js:   'text/javascript',
  json: 'application/json',
  html: 'text/html',
  css:  'text/css',
  csv:  'text/csv',
  xml:  'text/xml',
  svg:  'image/svg+xml',
  writer: 'application/json',
  png:  'image/png',
  jpg:  'image/jpeg',
  jpeg: 'image/jpeg',
  gif:  'image/gif',
  webp: 'image/webp',
  mp3:  'audio/mpeg',
  wav:  'audio/wav',
  ogg:  'audio/ogg',
  mp4:  'video/mp4',
  webm: 'video/webm',
  m4v:  'video/mp4',
  mov:  'video/quicktime',
  ogv:  'video/ogg',
  pdf:  'application/pdf',
  beep: 'application/beep',
  zip:  'application/zip',
};

function getMime(name) {
  const ext = name.split('.').pop().toLowerCase();
  return MIME_MAP[ext] || 'application/octet-stream';
}

function getEncoding(mime) {
  if (mime.startsWith('text/')) return 'utf8';
  if (mime === 'application/json') return 'utf8';
  if (mime === 'application/javascript') return 'utf8';
  if (mime === 'image/svg+xml') return 'utf8';
  if (mime === 'application/beep') return 'utf8';
  return 'base64';
}

// ─── Default filesystem seed ──────────────────────────────────────────────────

const DEFAULT_DIRS = [
  '/',
  '/Desktop',
  '/Documents',
  '/Pictures',
  '/Music',
  '/Downloads',
  '/Apps',
];

const DEFAULT_FILES = [
  {
    path:    '/Documents/Welcome.txt',
    content: [
      'Welcome to BrowserOS!',
      '',
      'Your desktop, in a browser tab.',
      '',
      'Open Help from Start for the shortcut manual and a tour of your desktop.',
      'Open Info to discover what is new in version ' + OS_VERSION + '.',
      '',
      '- Clear Ice themes, wallpapers, and desktop widgets',
      '- Window snapping, app switching, and taskbar previews',
      '- Recycle Bin and Open with for your virtual files',
      '- Native Calendar, Clock, and Video Player',
      '- More Settings, Developer tools, and Terminal commands',
      '- Writer, Stage, and Cells available from the App Store',
      '',
      'Settings > Storage lets you download a full profile backup.',
      'Your files stay in this browser profile. Keep backups somewhere safe.',
      '',
      'Make yourself at home.',
    ].join('\n'),
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function now() { return Date.now(); }

function makeDir(path) {
  return {
    path,
    type:     'dir',
    content:  null,
    encoding: null,
    size:     0,
    mime:     null,
    created:  now(),
    modified: now(),
  };
}

function makeFile(path, content, mime) {
  const enc = getEncoding(mime);
  return {
    path,
    type:     'file',
    content,
    encoding: enc,
    size:     content.length,
    mime,
    created:  now(),
    modified: now(),
  };
}

function normPath(path) {
  // Normalize slashes, remove trailing slash (except root)
  let p = path.replace(/\/+/g, '/');
  if (p !== '/' && p.endsWith('/')) p = p.slice(0, -1);
  return p;
}

function parentPath(path) {
  const p = normPath(path);
  if (p === '/') return null;
  const parts = p.split('/').filter(Boolean);
  parts.pop();
  return '/' + parts.join('/') || '/';
}

function fileName(path) {
  return normPath(path).split('/').filter(Boolean).pop() || '';
}

// ─── FileSystem class ─────────────────────────────────────────────────────────

export class FileSystem {
  /** @param {import('./db.js').DB} db */
  constructor(db) {
    this._db = db;
  }

  /**
   * Boot the filesystem.
   * Seeds default structure if this is a fresh install.
   */
  async boot() {
    const root = await this._db.fs.get('/');
    if (!root) {
      console.log('[fs] Fresh install — seeding default filesystem');
      await this._seed();
    } else {
      console.log('[fs] Filesystem found — skipping seed');
    }
  }

  async _seed() {
    for (const path of DEFAULT_DIRS) {
      await this._db.fs.put(makeDir(path));
    }
    for (const { path, content } of DEFAULT_FILES) {
      const mime = getMime(path.split('/').pop());
      await this._db.fs.put(makeFile(path, content, mime));
    }
  }

  // ── Core API ────────────────────────────────────────────────────────────────

  /**
   * Read file contents.
   * @returns {Promise<string|null>}
   */
  async read(path) {
    const node = await this._db.fs.get(normPath(path));
    if (!node || node.type !== 'file') return null;
    return node.content;
  }

  /**
   * Get metadata for a file or directory.
   * @returns {Promise<{type,size,name,created,modified,mime,encoding}|null>}
   */
  async stat(path) {
    const node = await this._db.fs.get(normPath(path));
    if (!node) return null;
    const { type, size, created, modified, mime, encoding } = node;
    return { type, size, name: fileName(path), created, modified, mime, encoding };
  }

  /**
   * List direct children of a directory.
   * @returns {Promise<Array<{type,size,name,created,modified,mime}>>|null}
   */
  async ls(path) {
    const node = await this._db.fs.get(normPath(path));
    if (!node || node.type !== 'dir') return null;
    const children = await this._db.fs.list(normPath(path));
    // The recycle area is implementation storage, not a user-visible folder.
    return children.filter(n => !(normPath(path) === '/' && n.path === '/.RecycleBin')).map(n => ({
      type:     n.type,
      size:     n.size,
      name:     fileName(n.path),
      created:  n.created,
      modified: n.modified,
      mime:     n.mime,
      encoding: n.encoding,
    }));
  }

  /**
   * Write a file. Creates it if it doesn't exist, overwrites if it does.
   * @returns {Promise<{ok:boolean, error?:string}>}
   */
  async write(path, content) {
    path = normPath(path);
    const parent = parentPath(path);

    // Ensure parent directory exists
    const parentNode = await this._db.fs.get(parent);
    if (!parentNode || parentNode.type !== 'dir') {
      return { ok: false, error: `Parent directory does not exist: ${parent}` };
    }

    const existing = await this._db.fs.get(path);
    const mime = getMime(fileName(path));

    if (existing && existing.type === 'dir') {
      return { ok: false, error: `${path} is a directory` };
    }

    const node = existing
      ? { ...existing, content, size: content.length, modified: now() }
      : makeFile(path, content, mime);

    await this._db.fs.put(node);

    // Update parent modified time
    await this._touchDir(parent);

    return { ok: true };
  }

  /**
   * Create a new file without replacing an existing file.
   * Conflicts receive a numbered suffix before the extension.
   * @returns {Promise<{ok:boolean, path?:string, error?:string}>}
   */
  async writeUnique(path, content) {
    path = normPath(path);
    const parent = parentPath(path);
    const parentNode = await this._db.fs.get(parent);
    if (!parentNode || parentNode.type !== 'dir') {
      return { ok: false, error: `Parent directory does not exist: ${parent}` };
    }

    const name = fileName(path);
    const dot = name.lastIndexOf('.');
    const stem = dot > 0 ? name.slice(0, dot) : name;
    const extension = dot > 0 ? name.slice(dot) : '';

    for (let suffix = 0; suffix < 10000; suffix++) {
      const candidateName = suffix === 0 ? name : `${stem}(${suffix})${extension}`;
      const candidatePath = (parent === '/' ? '' : parent) + '/' + candidateName;
      if (await this._db.fs.get(candidatePath)) continue;

      try {
        await this._db.fs.add(makeFile(candidatePath, content, getMime(candidateName)));
      } catch (error) {
        // Another create may have claimed this name between the lookup and insert.
        if (error?.name === 'ConstraintError') continue;
        return { ok: false, error: error?.message || String(error) };
      }

      await this._touchDir(parent);
      return { ok: true, path: candidatePath };
    }

    return { ok: false, error: `Could not find an available name for ${path}` };
  }

  /**
   * Create a directory.
   * @returns {Promise<{ok:boolean, error?:string}>}
   */
  async mkdir(path) {
    path = normPath(path);
    const existing = await this._db.fs.get(path);
    if (existing) return { ok: false, error: `${path} already exists` };

    const parent = parentPath(path);
    if (parent) {
      const parentNode = await this._db.fs.get(parent);
      if (!parentNode || parentNode.type !== 'dir') {
        return { ok: false, error: `Parent directory does not exist: ${parent}` };
      }
    }

    await this._db.fs.put(makeDir(path));
    if (parent) await this._touchDir(parent);
    return { ok: true };
  }

  /**
   * Move a file or folder into the recycle bin.
   * @returns {Promise<{ok:boolean, error?:string, id?:string}>}
   */
  async rm(path) {
    return this.trash(path);
  }

  async trash(path) {
    path = normPath(path);
    const protectedPaths = ['/', '/.RecycleBin', '/Desktop', '/Documents', '/Pictures', '/Music', '/Downloads', '/Apps'];
    if (protectedPaths.includes(path) || path.startsWith('/.RecycleBin/')) {
      return { ok: false, error: 'This system folder cannot be moved to the recycle bin; delete its contents instead' };
    }
    const node = await this._db.fs.get(path);
    if (!node) return { ok: false, error: `${path} does not exist` };

    let bin = await this._db.fs.get('/.RecycleBin');
    if (bin && bin.type !== 'dir') return { ok: false, error: 'Recycle Bin storage is unavailable' };
    if (!bin) {
      bin = makeDir('/.RecycleBin');
      await this._db.fs.put(bin);
    }

    const id = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
    const destination = '/.RecycleBin/' + id;
    const info = {
      originalPath: path,
      originalName: fileName(path),
      originalType: node.type,
      deletedAt: now(),
    };
    const all = node.type === 'dir' ? [node, ...await this._db.fs.listAll(path)] : [node];

    for (const entry of all) {
      const nextPath = destination + entry.path.slice(path.length);
      const moved = { ...entry, path: nextPath, modified: now() };
      if (entry.path === path) moved.trashInfo = info;
      await this._db.fs.put(moved);
    }
    for (const entry of all) await this._db.fs.delete(entry.path);

    const parent = parentPath(path);
    if (parent) await this._touchDir(parent);
    return { ok: true, id };
  }

  async listTrash() {
    const entries = await this._db.fs.list('/.RecycleBin');
    return entries
      .filter(entry => entry.trashInfo && entry.path !== '/.RecycleBin')
      .map(entry => ({ id: entry.path.split('/').pop(), ...entry.trashInfo }))
      .sort((a, b) => b.deletedAt - a.deletedAt);
  }

  async restoreTrash(id) {
    if (typeof id !== 'string' || !/^[a-z0-9-]+$/i.test(id)) return { ok: false, error: 'Invalid recycle bin item' };
    const storedPath = '/.RecycleBin/' + id;
    const node = await this._db.fs.get(storedPath);
    if (!node || !node.trashInfo) return { ok: false, error: 'Recycle bin item not found' };

    const info = node.trashInfo;
    const originalPath = info.originalPath;
    const originalName = info.originalName;
    if (typeof originalPath !== 'string' || !originalPath.startsWith('/') ||
        originalPath.split('/').includes('..') || originalPath === '/' ||
        originalPath === '/.RecycleBin' || originalPath.startsWith('/.RecycleBin/') ||
        typeof originalName !== 'string' || !originalName || originalName.includes('/') || originalName.includes('\\')) {
      return { ok: false, error: 'Recycle Bin item has invalid restore information' };
    }
    let parent = parentPath(originalPath);
    if (!parent || parent === '/.RecycleBin' || parent.startsWith('/.RecycleBin/')) parent = '/';
    const parts = parent.split('/').filter(Boolean);
    let current = '';
    for (const part of parts) {
      current += '/' + part;
      const existingDir = await this._db.fs.get(current);
      if (!existingDir) await this._db.fs.put(makeDir(current));
      else if (existingDir.type !== 'dir') return { ok: false, error: 'Restore location is blocked by a file: ' + current };
    }

    let destination = (parent === '/' ? '' : parent) + '/' + originalName;
    const splitName = originalName.lastIndexOf('.');
    const stem = splitName > 0 ? originalName.slice(0, splitName) : originalName;
    const extension = splitName > 0 ? originalName.slice(splitName) : '';
    let suffix = 1;
    while (await this._db.fs.get(destination)) {
      destination = (parent === '/' ? '' : parent) + '/' + stem + '(' + suffix++ + ')' + extension;
    }

    const all = node.type === 'dir' ? [node, ...await this._db.fs.listAll(storedPath)] : [node];
    for (const entry of all) {
      const restoredPath = destination + entry.path.slice(storedPath.length);
      const restored = { ...entry, path: restoredPath, modified: now() };
      delete restored.trashInfo;
      await this._db.fs.put(restored);
    }
    for (const entry of all) await this._db.fs.delete(entry.path);
    await this._touchDir(parent);
    return { ok: true, path: destination };
  }

  async permanentlyDeleteTrash(id) {
    if (typeof id !== 'string' || !/^[a-z0-9-]+$/i.test(id)) return { ok: false, error: 'Invalid recycle bin item' };
    const path = '/.RecycleBin/' + id;
    const node = await this._db.fs.get(path);
    if (!node || !node.trashInfo) return { ok: false, error: 'Recycle bin item not found' };
    const all = node.type === 'dir' ? [node, ...await this._db.fs.listAll(path)] : [node];
    for (const entry of all) await this._db.fs.delete(entry.path);
    return { ok: true };
  }

  async emptyTrash() {
    const entries = await this.listTrash();
    for (const entry of entries) await this.permanentlyDeleteTrash(entry.id);
    return { ok: true };
  }

  /**
   * Rename a file or directory in place.
   * newName is just the name component, not a full path.
   * @returns {Promise<{ok:boolean, error?:string}>}
   */
  async rename(path, newName) {
    path = normPath(path);
    const node = await this._db.fs.get(path);
    if (!node) return { ok: false, error: `${path} does not exist` };

    const parent  = parentPath(path);
    const newPath = (parent === '/' ? '' : parent) + '/' + newName;

    return this.move(path, newPath);
  }

  /**
   * Move a file or directory to a new path.
   * @returns {Promise<{ok:boolean, error?:string}>}
   */
  async move(src, dest) {
    src  = normPath(src);
    dest = normPath(dest);

    if (src === dest) return { ok: true };
    if (src === '/.RecycleBin' || src.startsWith('/.RecycleBin/') ||
        dest === '/.RecycleBin' || dest.startsWith('/.RecycleBin/')) {
      return { ok: false, error: 'Recycle Bin storage cannot be moved directly' };
    }

    const node = await this._db.fs.get(src);
    if (!node) return { ok: false, error: `${src} does not exist` };

    if (node.type === 'dir' && (src === '/' || dest.startsWith(src + '/'))) {
      return { ok: false, error: 'Cannot move a folder into itself, a subfolder, or move the filesystem root' };
    }

    const destParent = parentPath(dest);
    const destParentNode = await this._db.fs.get(destParent);
    if (!destParentNode || destParentNode.type !== 'dir') {
      return { ok: false, error: `Destination parent does not exist: ${destParent}` };
    }

    const existing = await this._db.fs.get(dest);
    if (existing) return { ok: false, error: `${dest} already exists` };

    if (node.type === 'file') {
      // Simple file move — write to new path, delete old
      await this._db.fs.put({ ...node, path: dest, modified: now() });
      await this._db.fs.delete(src);
    } else {
      // Directory move — move all children recursively
      const all = [node, ...await this._db.fs.listAll(src)];
      for (const n of all) {
        const newPath = dest + n.path.slice(src.length);
        await this._db.fs.put({ ...n, path: newPath, modified: now() });
        await this._db.fs.delete(n.path);
      }
    }

    const srcParent = parentPath(src);
    if (srcParent) await this._touchDir(srcParent);
    if (destParent) await this._touchDir(destParent);

    return { ok: true };
  }

  // ── Internal helpers ────────────────────────────────────────────────────────

  /** Update a directory's modified timestamp */
  async _touchDir(path) {
    const node = await this._db.fs.get(normPath(path));
    if (node && node.type === 'dir') {
      await this._db.fs.put({ ...node, modified: now() });
    }
  }

  // ── Utility (used by OS internals, not exposed via BOS) ────────────────────

  /** Check if a path exists */
  async exists(path) {
    const node = await this._db.fs.get(normPath(path));
    return !!node;
  }

  /** Get raw node (used by kernel for permission path matching) */
  async _raw(path) {
    return this._db.fs.get(normPath(path));
  }

  /** Get N most recently modified files (used by Ctrl+Space search) */
  async recent(limit = 20) {
    return this._db.fs.recent(limit);
  }
}
