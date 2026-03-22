# 🖥️ BrowserOS

**A fully functional operating system that runs in a single HTML file.**

BrowserOS is a browser-based OS with a real window manager, a persistent virtual filesystem, a custom executable format, and a growing suite of built-in apps. No server, no install, no dependencies — open the file and it just works.

> Built by [jg-tech-aosp](https://github.com/jg-tech-aosp)

---

## ✨ Features

- **Window Manager** — draggable, resizable windows with minimize, maximize, close. Alt+F4 works. Double-click titlebar to maximize.
- **Virtual Filesystem** — full directory tree persisted to `localStorage`. Survives page reloads.
- **File Manager** — browse, create, rename, delete files and folders. Import files from your host OS.
- **Text Editor** — open, edit, and save files directly to the filesystem.
- **Terminal** — 15+ real commands with tab-autocomplete and command history.
- **Paint** — canvas-based drawing app with 7 tools, flood fill, undo/redo, and save to `/Pictures/`.
- **Calculator** — full keyboard support.
- **Browser** — iframe-based web browser inside the OS.
- **Settings** — live theme changes: accent color, wallpaper, font, dark/light mode, transparency.
- **Start Menu** — searchable app launcher.
- **Desktop Icons** — draggable, right-clickable, drag-and-drop into folders.
- **`.beep` Executable Format** — install and run third-party apps with a single file.
- **App-specific right-click menus** — apps register their own context menus via the BOS API.

---

## 🚀 Getting Started

### Option 1 — Just open it
Download `BrowserOS.html` and open it in any modern browser. Everything runs locally.

> ⚠️ **For persistent storage:** either open the GitHub Pages link, or run it from a local server. Do not open the file directly from disk — different filenames = different `localStorage` origins in some browsers.

```bash
python3 -m http.server 8080
# then open http://localhost:8080/BrowserOS.html
```

### Option 2 — GitHub Pages
Fork this repo and enable GitHub Pages. Your OS will be live at:
```
https://yourusername.github.io/BrowserOS/BrowserOS.html
```
Storage will persist across sessions automatically since the origin is always the same URL.

---

## 🗂️ Filesystem Structure

The virtual filesystem mirrors a Unix-like layout, stored entirely in `localStorage`:

```
/
├── Desktop/          ← files and folders you put on the desktop
├── Documents/        ← default location for text files
│   ├── Welcome.txt
│   └── Notes.txt
├── Pictures/         ← Paint saves images here
├── Downloads/        ← import destination suggestion
├── Music/
└── Apps/             ← installed .beep applications
    ├── paint.beep
    ├── calculator.beep
    ├── browser.beep
    └── about.beep
```

### Terminal Commands

| Command | Description |
|---------|-------------|
| `ls [path]` | List directory contents |
| `cd <path>` | Change directory |
| `pwd` | Print working directory |
| `mkdir <path>` | Create directory |
| `touch <path>` | Create empty file |
| `rm <path>` | Delete file |
| `cat <path>` | Print file contents |
| `echo <text>` | Print text |
| `cp <src> <dst>` | Copy file |
| `mv <src> <dst>` | Move file |
| `find [path]` | List all files recursively |
| `wc <path>` | Word/line/char count |
| `date` | Current date and time |
| `whoami` | Current user |
| `uname [-a]` | OS info |
| `clear` | Clear terminal |
| `help` | List all commands |

**Tab autocomplete** and **↑↓ command history** are supported.

### Importing Files from Your Host OS

Open **File Manager** and either:
- Click **⬆ Import** in the toolbar to open a file picker (supports multi-select)
- **Drag and drop** files from your host OS directly onto the file grid

Text files (`.txt`, `.md`, `.js`, `.json`, `.html`, `.css`, `.beep`, etc.) are stored as plain text and are fully editable. Everything else (images, binaries) is stored as a base64 dataURL and viewable in the image viewer.

---

## ⚡ The `.beep` Format

**.beep** stands for **BrowserOS Extended Executable Program**.

It is the native executable format of BrowserOS. A `.beep` file is a JSON document describing an application — its metadata and its JavaScript source code. Drop a `.beep` file into `/Apps/` and it becomes a launchable, first-class application.

### File Structure

```json
{
  "name": "My App",
  "version": "1.0",
  "icon": "🚀",
  "author": "yourname",
  "width": 640,
  "height": 480,
  "main": "... javascript source code ..."
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | ✅ | Display name shown in title bar and Start menu |
| `version` | string | — | Version string shown in title bar |
| `icon` | string | — | Emoji icon for title bar and desktop |
| `author` | string | — | Author name (informational) |
| `width` | number | — | Initial window width in px (default: 640) |
| `height` | number | — | Initial window height in px (default: 480) |
| `main` | string | ✅ | JavaScript source code of the application |

### The `main` Function

The `main` string is executed as a JavaScript function with three arguments available in scope:

```
container  — the window's content DOM element. Mount your UI here.
winId      — unique string ID of this window instance.
BOS        — the BrowserOS standard library (see below).
```

### Minimal Example

```json
{
  "name": "Hello World",
  "version": "1.0",
  "icon": "👋",
  "width": 400,
  "height": 200,
  "main": "container.innerHTML = '<h1 style=\"color:white;padding:20px\">Hello from .beep!</h1>'"
}
```

Save this as `hello.beep`, drop it into `/Apps/` via File Manager, and it appears in the Start menu immediately.

---

## 📚 BOS Standard Library

The `BOS` object is the bridge between your `.beep` app and the operating system. It is passed as the third argument to `main`.

### `BOS.fs` — Filesystem Access

Full read/write access to the virtual filesystem.

```js
// Read a file
const node = BOS.fs.resolve('/Documents/notes.txt');
if (node) console.log(node.content);

// Write a file
BOS.fs.touch('/Documents/output.txt', 'Hello world');

// Overwrite existing file
BOS.fs.write('/Documents/output.txt', 'Updated content');

// Create a directory
BOS.fs.mkdir('/Documents/myapp-data');

// List directory
const items = BOS.fs.ls('/Documents');
// returns: [{ name, type, content, size }, ...]

// Delete
BOS.fs.rm('/Documents/output.txt');

// Rename
BOS.fs.rename('/Documents/old.txt', 'new.txt');
```

### `BOS.notify(message)` — Desktop Notifications

Shows a toast notification in the bottom-right corner of the screen.

```js
BOS.notify('File saved successfully!');
```

### `BOS.open(appId)` — Open System Apps

Opens a built-in system application by ID.

```js
BOS.open('filemanager');
BOS.open('texteditor');
BOS.open('terminal');
BOS.open('settings');
```

### `BOS.showContextMenu(x, y, items)` — Display a Context Menu

Renders the OS-standard context menu at the given coordinates with your custom items.

```js
BOS.showContextMenu(x, y, [
  { label: '📋 Copy', action: function() { /* ... */ } },
  { label: '📌 Paste', action: function() { /* ... */ } },
  'sep',
  { label: '🗑️ Delete', action: function() { /* ... */ } },
]);
```

Use `'sep'` as a string item to insert a separator line.

### `BOS.onContextMenu(handler)` — Register App Context Menu

Call this once during `main()` to register a right-click handler for your app's window. When the user right-clicks inside your window, your handler is called instead of the OS default.

```js
BOS.onContextMenu(function(x, y) {
  BOS.showContextMenu(x, y, [
    { label: '🔧 My Action', action: function() { doSomething(); } },
  ]);
});
```

> **Important:** call `BOS.onContextMenu` only once, at the end of `main()`. The OS picks it up after `main` finishes executing.

### `BOS.theme` — Current Theme Info

Read-only object with the current OS theme settings.

```js
const t = BOS.theme;
// t.accent   — e.g. '#0078d4'
// t.font     — e.g. "'Segoe UI', system-ui, sans-serif"
// t.darkMode — true/false
```

Use this to style your app consistently with the OS theme.

---

## 🛠️ Writing a Real `.beep` App

Here's a complete, working note-taking app as a `.beep`:

```json
{
  "name": "Quick Notes",
  "version": "1.0",
  "icon": "🗒️",
  "width": 500,
  "height": 400,
  "main": "
    var FILE = '/Documents/quicknotes.txt';
    var existing = BOS.fs.resolve(FILE);

    container.style.cssText = 'display:flex;flex-direction:column;height:100%';

    var toolbar = document.createElement('div');
    toolbar.style.cssText = 'padding:6px 8px;background:var(--sidebar-bg);border-bottom:1px solid var(--win-border);display:flex;gap:6px';

    var saveBtn = document.createElement('button');
    saveBtn.textContent = '💾 Save';
    saveBtn.style.cssText = 'background:rgba(0,120,212,0.2);border:1px solid rgba(0,120,212,0.4);color:#66aaff;border-radius:4px;padding:4px 10px;cursor:pointer';
    toolbar.appendChild(saveBtn);
    container.appendChild(toolbar);

    var ta = document.createElement('textarea');
    ta.style.cssText = 'flex:1;background:transparent;border:none;color:var(--text);padding:12px;font-family:monospace;font-size:13px;resize:none;outline:none';
    ta.value = existing ? existing.content : '';
    container.appendChild(ta);

    saveBtn.onclick = function() {
      if (BOS.fs.resolve(FILE)) BOS.fs.write(FILE, ta.value);
      else BOS.fs.touch(FILE, ta.value);
      BOS.notify('Notes saved!');
    };

    BOS.onContextMenu(function(x, y) {
      BOS.showContextMenu(x, y, [
        { label: '💾 Save', action: function() { saveBtn.click(); } },
        { label: '🗑️ Clear', action: function() { ta.value = ''; } }
      ]);
    });
  "
}
```

### Tips

- Use `var` instead of `let`/`const` if your app uses nested functions — scoping behaves more predictably inside `new Function()`.
- All DOM elements you create are scoped to `container`, so IDs may conflict if the user opens multiple instances. Prefer `container.querySelector()` over `document.getElementById()`.
- Use CSS variables (`var(--accent)`, `var(--win-bg)`, `var(--text)`, `var(--sidebar-bg)`, `var(--win-border)`, `var(--text-dim)`) to match the OS theme automatically.
- Clean up global event listeners when the window closes by checking `container.isConnected`:
  ```js
  document.addEventListener('keydown', function handler(e) {
    if (!container.isConnected) { document.removeEventListener('keydown', handler); return; }
    // handle key
  });
  ```

---

## 🏗️ Architecture

BrowserOS is a single HTML file (~2500 lines). No build step, no bundler, no framework.

### Core Components

| Component | Description |
|-----------|-------------|
| `FileSystem` class | Virtual filesystem backed by `localStorage`. Full CRUD, path resolution, directory traversal. |
| `createWindow()` | Window factory. Handles z-index, drag, resize, minimize/maximize/close, taskbar registration. |
| `launchBeep()` | `.beep` executor. Parses JSON manifest, creates window, runs `main` via `new Function()`, wires up context menu handler. |
| `BOS` object | Standard library exposed to `.beep` apps. |
| `showCtxMenu()` | Unified context menu renderer used by both OS and apps. |
| `APPS` registry | Built-in system apps (File Manager, Text Editor, Terminal, Settings). |
| Settings | Persisted to `localStorage` separately from the filesystem. Applied on load. |

### Storage

| Key | Contents |
|-----|----------|
| `bos_fs` | Entire virtual filesystem as JSON |
| `bos_settings` | Theme settings (accent, wallpaper, font, dark mode, etc.) |

### Built-in vs `.beep` Apps

| App | Type | Path |
|-----|------|------|
| File Manager | Native | — |
| Text Editor | Native | — |
| Terminal | Native | — |
| Settings | Native | — |
| Paint | `.beep` | `/Apps/paint.beep` |
| Calculator | `.beep` | `/Apps/calculator.beep` |
| Browser | `.beep` | `/Apps/browser.beep` |
| About | `.beep` | `/Apps/about.beep` |

Native apps are compiled into the HTML. `.beep` apps live in the filesystem and can be edited, moved, deleted, or replaced.

---

## 🗺️ Roadmap

- [ ] `BOS.fetch()` — let `.beep` apps make network requests
- [ ] Package manager — `BOS.install('appname')` fetches from a `.beep` repository
- [ ] Multi-window app support — one `.beep` opens multiple windows
- [ ] Export files to host OS from File Manager
- [ ] More bundled `.beep` apps — Snake, Markdown viewer, Music player
- [ ] `.beep` SDK documentation site

---

## 📄 License

BrowserOS is licensed under the **GNU Affero General Public License v3.0 (AGPL-3.0)**.

You are free to use, modify, and distribute this software. Any modifications must be released under the same license. If you run a modified version as a hosted service, you must make your source code available.

Commercial use requires written permission from the author.

See [LICENSE](LICENSE) for full terms.

---

## 👤 Author

Made by **jg-tech-aosp**  
[github.com/jg-tech-aosp](https://github.com/jg-tech-aosp)

> *The `.beep` (BrowserOS Extended Executable Program) format is an open standard invented for this project. Anyone is free to implement `.beep` loaders in their own projects under the terms of the AGPL-3.0 license.*
