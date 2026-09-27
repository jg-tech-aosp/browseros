# BrowserOS v2

> BrowserOS is a browser-based desktop environment with a virtual filesystem, native system components, sandboxed `.beep` applications, persistent settings, and an application installation system.

This document describes the **implemented BrowserOS v2 architecture** as it exists in the repository. It is both a technical reference and a readable overview. Where the original March 2026 design differed from the implementation, this document describes the implementation.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [Boot Process](#3-boot-process)
4. [Window Manager and Shell](#4-window-manager-and-shell)
5. [Virtual Filesystem](#5-virtual-filesystem)
6. [.beep Applications](#6-beep-applications)
7. [postMessage IPC](#7-postmessage-ipc)
8. [Permissions](#8-permissions)
9. [BOS API](#9-bos-api)
10. [IndexedDB](#10-indexeddb)
11. [Native and Sandboxed Components](#11-native-and-sandboxed-components)
12. [App Store](#12-app-store)
13. [Drag and Drop](#13-drag-and-drop)
14. [Current Application Model](#14-current-application-model)
15. [Design Notes and Limitations](#15-design-notes-and-limitations)
16. [Project History](#16-project-history)

---

# 1. Overview

## What is BrowserOS?

BrowserOS is an experimental operating-system-like environment implemented entirely with web technologies.

It runs inside a normal web browser but provides many concepts normally associated with a desktop operating system:

- Desktop and wallpaper
- Windows
- Taskbar
- Start menu
- Application launcher
- Search
- Notifications
- Virtual filesystem
- Persistent settings
- File Manager
- Terminal
- Browser
- Paint
- Text Editor
- Music Player
- System Monitor
- Calculator
- Markdown Viewer
- App Store
- Sandboxed third-party applications

The project is a successor to BrowserOS v1.

### What changed from v1?

The largest architectural change is application isolation.

In v1, applications shared the OS JavaScript environment. A .beep application could access objects such as `OS`, `document`, and `localStorage` directly.

BrowserOS v2 instead places .beep applications inside sandboxed iframes. Applications communicate with the operating system through a small asynchronous API called **BOS**, which is implemented on top of `postMessage`.

This gives v2 a much clearer separation between the OS and applications.

## In simple terms

BrowserOS can be thought of as:

> **A desktop operating system simulated inside a web page, with its own filesystem and application model.**

The browser provides the underlying runtime. BrowserOS provides the desktop environment and virtual operating-system abstractions.

---

# 2. Architecture

BrowserOS is divided into several major layers.

```
┌──────────────────────────────────────────┐
│              Browser / Web                │
│                                           │
│  ┌─────────────────────────────────────┐  │
│  │           BrowserOS Core            │  │
│  │                                     │  │
│  │  Window Manager   Shell   Settings  │  │
│  │  Kernel / IPC     Filesystem         │  │
│  │  IndexedDB        Launcher           │  │
│  └──────────────────────┬──────────────┘  │
│                         │                  │
│                    postMessage             │
│                         │                  │
│       ┌─────────────────┼─────────────┐    │
│       │                 │             │    │
│   ┌───▼────┐        ┌───▼────┐    ┌───▼──┐ │
│   │ Paint  │        │ Calc   │    │ .beep│ │
│   │ iframe │        │ iframe │    │ apps │ │
│   └────────┘        └────────┘    └──────┘ │
└──────────────────────────────────────────┘
```

### Core components

| Component | Responsibility |
|---|---|
| Database layer | IndexedDB access |
| Filesystem | Virtual files and directories |
| Kernel | IPC routing, permissions and app registry |
| Window Manager | Windows, focus, z-order, dragging and resizing |
| Launcher | Installing and launching .beep applications |
| Settings | Persistent OS configuration |
| Desktop | Wallpaper, desktop icons and shell interactions |
| Taskbar | Running/pinned applications, clock and system UI |
| Start Menu | Application and system launcher |
| Search | Keyboard-driven application/file search |
| Notifications | Notification history and UI |

The implementation is assembled by `src/index.js`, which creates these components and wires their dependencies together during boot.

---

# 3. Boot Process

BrowserOS starts from the minimal root `index.html`.

The page loads:

- JSZip
- `src/index.js`

The main boot sequence is:

1. Open the BrowserOS IndexedDB database.
2. Create the virtual filesystem.
3. Seed the default filesystem if this is a fresh installation.
4. Load persistent settings.
5. Create and boot the Window Manager.
6. Create and boot the IPC kernel.
7. Create the .beep launcher.
8. Register native system applications.
9. Boot notifications.
10. Boot the Desktop.
11. Boot the Taskbar.
12. Boot the Start Menu.
13. Boot Search.
14. Seed the inbox .beep applications.
15. Restore/update the pinned application state.
16. Register theme-change broadcasting.
17. Mark BrowserOS as ready.

If boot fails, BrowserOS replaces the document with a readable error screen containing the failure and a reload button.

---

# 4. Window Manager and Shell

The Window Manager is responsible for the browser-based desktop's window system.

It handles:

- Window creation
- Window movement
- Window resizing
- Focus
- Z-index ordering
- Window closing
- Window titles
- Window icons
- Window progress indicators
- Drag operations
- System application registration
- .beep application windows

A .beep application is rendered inside a sandboxed iframe placed inside a BrowserOS window.

Native system components instead mount their UI directly into BrowserOS-managed windows.

## Desktop

The Desktop manages the background environment and desktop icons.

It can interact with the virtual filesystem and launch applications.

## Taskbar

The Taskbar provides:

- Pinned applications
- Running application buttons
- System tray elements
- Clock
- Notifications
- Application state updates

## Start Menu

The Start Menu provides a graphical application launcher and access to system functionality.

## Search

Search is also available through a keyboard shortcut:

```
Ctrl + Space
```

It can search across applications, files and other BrowserOS objects.

---

# 5. Virtual Filesystem

BrowserOS has its own filesystem implemented on top of IndexedDB.

It is not the user's real computer filesystem.

The default structure is:

```
/
├── Desktop/
├── Documents/
├── Pictures/
├── Music/
├── Downloads/
└── Apps/
```

A default `/Documents/Welcome.txt` file is created on a fresh installation.

## Filesystem operations

The filesystem implements:

- `read`
- `stat`
- `ls`
- `write`
- `mkdir`
- `rm`
- `rename`
- `move`

Files can contain text or base64-encoded binary data.

The filesystem automatically derives MIME types from filenames for common formats.

## Move operation

Moving a file changes its stored path and preserves its contents and metadata.

Moving a directory recursively moves its children as well.

The filesystem refuses to overwrite an existing destination and refuses to remove non-empty directories.

---

# 6. .beep Applications

A `.beep` file is a ZIP archive used as an installable BrowserOS application.

Typical structure:

```
myapp.beep
├── manifest.json
├── main.js
├── icon.png
└── assets/
```

The entry point does not have to be called `main.js`; the manifest specifies the actual entry file.

## Manifest

Example:

```json
{
  "name": "Paint",
  "version": "2.0",
  "icon": "icon.png",
  "author": "jg-tech-aosp",
  "bos": "2.0",
  "width": 820,
  "height": 560,
  "permissions": [
    "fs:/Pictures:read",
    "fs:/Pictures:write",
    "ui.passive"
  ],
  "events": [
    "themeChanged"
  ],
  "entry": "main.js"
}
```

### Manifest fields

| Field | Required | Purpose |
|---|---|---|
| `name` | Yes | Display name |
| `version` | Yes | Application version |
| `icon` | No in implementation | Icon path inside the archive |
| `author` | No | Author |
| `bos` | Yes | Required BOS version |
| `width` | No | Initial window width, default 640 |
| `height` | No | Initial window height, default 480 |
| `permissions` | Yes | Requested permissions |
| `events` | Yes | OS events requested by the app |
| `entry` | Yes | JavaScript entry point |
| `emoji` | No | Text/emoji fallback icon |

The launcher validates the required fields, checks the BOS version, extracts the icon when possible, and stores the application metadata in IndexedDB.

## Launching an application

When a .beep application is launched:

1. BrowserOS obtains the ZIP data.
2. JSZip extracts the archive in memory.
3. `manifest.json` is parsed.
4. The required BOS version is checked.
5. The application icon is extracted.
6. The application is registered in the application database if necessary.
7. A BrowserOS window is created.
8. A sandboxed iframe is created inside the window.
9. The BOS client library is injected into the iframe.
10. The application's entry script is injected.
11. The application is registered with the kernel.
12. A boot message containing OS information, theme, environment and manifest information is sent to the iframe.

The launcher can also cache the raw ZIP data for applications seeded with the OS.

## Application isolation

The iframe uses:

```html
<iframe sandbox="allow-scripts">
```

The application therefore does not receive the normal privileges of the surrounding BrowserOS page.

The application communicates with its parent through `postMessage`.

---

# 7. postMessage IPC

The BrowserOS kernel acts as the communication layer between sandboxed applications and the operating system.

## Request

An application sends:

```json
{
  "reqId": 42,
  "type": "fs.read",
  "payload": {
    "path": "/Documents/notes.txt"
  }
}
```

## Successful response

```json
{
  "reqId": 42,
  "ok": true,
  "result": "hello"
}
```

## Error response

```json
{
  "reqId": 42,
  "ok": false,
  "error": "Permission denied"
}
```

Each application instance has its own incrementing request counter.

The kernel identifies the application instance from the message source and uses the registered application's permissions and metadata when processing the request.

## Events

OS events do not use request IDs.

Example:

```json
{
  "type": "event.themeChanged",
  "payload": {
    "accent": "#0078d4",
    "font": "...",
    "darkMode": true
  }
}
```

The kernel broadcasts events only to applications that declared the corresponding event in their manifest.

## Additional UI IPC

The implemented kernel also supports drag-related UI messages:

- `ui.startDrag`
- `ui.dragMove`
- `ui.endDrag`

These allow sandboxed applications to participate in BrowserOS's window/file dragging system.

---

# 8. Permissions

Permissions are attached to .beep application instances and checked by the kernel before the requested operation is performed.

## Filesystem permissions

```
fs:{path}:read
fs:{path}:write
```

For example:

```
fs:/Documents:read
```

allows access to files underneath `/Documents`.

Root permissions can be granted with:

```
fs:/:read
fs:/:write
```

Path matching is based on the requested path and the declared permission scope.

## UI permissions

```
ui.passive
ui.interactive
```

Passive UI operations include:

- Notifications
- Window title
- Window icon
- Window progress

Interactive UI operations include:

- Alert
- Confirm
- Prompt

## Network permission

```
network
```

This allows the application to use:

```
BOS.net.fetch()
```

The kernel performs the actual browser `fetch()` call.

## Persistent app storage permission

`app.storage` grants access to a private key/value store through `BOS.storage`. The manifest requests this permission; the user approves it during installation. Only approved permissions are saved as the app's grants and passed to the kernel.

Each installation receives an OS-generated storage namespace. Apps cannot choose or read another app's namespace. Windows of the same installation share the store. Reinstalling creates a fresh namespace, and uninstalling clears the previous namespace.

Storage is separate from the virtual filesystem and does not grant file access. Each value is limited to 64 KiB and each installation to 256 KiB total. Keys must be 1–128 characters.

---

# 9. BOS API

The **BrowserOS API (BOS)** is the JavaScript API exposed to sandboxed applications.

Applications are intended to use `BOS.*` rather than calling `postMessage` directly.

## BOS.fs

```js
await BOS.fs.read(path)
await BOS.fs.stat(path)
await BOS.fs.ls(path)
await BOS.fs.write(path, content)       // create or overwrite at an exact path
await BOS.fs.writeUnique(path, content) // create without replacing; returns the chosen path
await BOS.fs.mkdir(path)
await BOS.fs.rm(path)
await BOS.fs.rename(path, newName)
await BOS.fs.move(src, dest)
```

## BOS.storage

Available when the user granted `app.storage`:

```js
await BOS.storage.get(key, defaultValue) // missing keys return defaultValue (null by default)
await BOS.storage.set(key, value)       // JSON-compatible values
await BOS.storage.remove(key)
await BOS.storage.keys()
```

Storage is private to the installation and persists across app windows, launches, and BrowserOS reloads. Uninstalling clears it; reinstalling starts with an empty store.

## BOS.ui

```js
await BOS.ui.notify(message)
await BOS.ui.setTitle(title)
await BOS.ui.setIcon(icon)
await BOS.ui.setProgress(value)

await BOS.ui.alert(message)
await BOS.ui.confirm(message)
await BOS.ui.prompt(message, defaultValue)
```

The implemented API also exposes drag operations to applications:

```js
await BOS.ui.startDrag(path, name, icon)
await BOS.ui.dragMove(x, y)
await BOS.ui.endDrag(dropped)
```

## BOS.app

```js
await BOS.app.open(appId)
await BOS.app.launch(path)
await BOS.app.install(path)
await BOS.app.uninstall(id)
await BOS.app.self()
```

System applications are opened through the Window Manager. .beep applications are launched through the launcher.

Protected applications cannot be uninstalled.

## BOS.net

```js
await BOS.net.fetch(url, options)
```

The returned object contains the HTTP status, success state, headers and response body.

The current implementation exposes the response body as text.

## BOS.os

```js
BOS.os.version()
BOS.os.theme()
BOS.os.env()
```

These provide:

- BrowserOS version
- Current theme
- Locale
- Time zone
- BrowserOS viewport/screen dimensions

## BOS.on

Applications can register event handlers:

```js
BOS.on('themeChanged', callback)
BOS.on('focus', callback)
BOS.on('blur', callback)
```

Event delivery is controlled by the manifest's `events` list.

---

# 10. IndexedDB

BrowserOS uses an IndexedDB database named:

```
BrowserOS
```

The current database version is 3.

The major object stores are:

- `fs`
- `apps`
- `settings`
- `appData` (private persistent storage for installed .beep apps)

## fs store

Primary key:

```
path
```

A filesystem record resembles:

```js
{
  path: "/Documents/notes.txt",
  type: "file",
  content: "hello world",
  encoding: "utf8",
  size: 11,
  mime: "text/plain",
  created: 1700000000000,
  modified: 1700000000000
}
```

Directories use `type: "dir"` and have no content.

The database layer provides listing and recent-file queries used by the filesystem and search components.

## apps store

The application store contains installed .beep metadata.

Typical fields include:

```js
{
  id,
  path,
  name,
  version,
  icon,
  emoji,
  permissions,
  requestedPermissions,
  storageId,
  permissionDecisionVersion,
  events,
  entry,
  bos,
  width,
  height,
  installedAt,
  protected
}
```

Inbox applications may additionally store their raw ZIP data for later launching.

The app record also stores the granted permissions and an OS-generated `storageId`. Storage records are keyed by that private ID and app key; app code never supplies the ID.

## appData store

Private key/value records use the compound key `[storageId, key]`. Each app installation has a separate OS-generated `storageId`; values are JSON-serialized, limited to 64 KiB each and 256 KiB total per installation.

## settings store

Settings are stored as key/value records.

Examples include:

- Accent color
- Dark mode
- Font
- Wallpaper
- Pinned applications
- User profile

---

# 11. Native and Sandboxed Components

The original design described most built-in applications as .beep applications. The implementation has since evolved into a more explicit split.

## Native components

These run directly inside BrowserOS and have access to OS internals.

Currently registered native system applications/components include:

- Settings
- File Manager
- Browser
- App Store
- Music Player
- Text Editor
- Terminal
- System Monitor
- Paint

The core shell also contains:

- Desktop
- Taskbar
- Start Menu
- Search
- Notifications

Native components are useful when an application needs direct access to BrowserOS internals or when it forms part of the shell itself.

## Sandboxed .beep applications

The .beep system remains the application format for isolated applications.

The current boot sequence seeds these inbox .beep applications:

- Calculator
- Markdown Viewer

Additional .beep applications can be installed through the application system.

This means BrowserOS v2 currently uses a **hybrid application model** rather than making every built-in application a .beep package.

---

# 12. App Store

BrowserOS includes an App Store integrated with the launcher and virtual filesystem.

The App Store is currently implemented as a native BrowserOS system application.

Its purpose is to discover and install .beep applications rather than to replace the underlying launcher.

The installation flow is conceptually:

```
App Store
   ↓
download .beep
   ↓
BrowserOS filesystem
   ↓
Launcher
   ↓
manifest validation
   ↓
application registration
   ↓
sandboxed launch
```

The App Store is therefore an application distribution interface on top of the .beep system.

The repository's current runtime has a functioning App Store, while the exact catalogue can change independently of the operating-system core.

The App Store compares each catalog version with the version saved from the installed package manifest. A newer catalog version is shown as an available update. Before replacing an install, the Store checks that the downloaded package's manifest version matches its catalog entry. App updates keep the existing private app data only when both installed and updated versions have the already-granted `app.storage` permission; manual reinstalls start with fresh app data.

---

# 13. Drag and Drop

BrowserOS implements its own desktop drag system in addition to normal browser drag-and-drop.

The Window Manager can track an internal drag operation, including:

- Source application/window
- Virtual filesystem path
- File name
- Icon
- Drag ghost position
- Drop completion

The File Manager supports dragging files outward and dropping items onto folders.

For example:

```
/Documents/example.txt
        ↓ drag
Desktop
        ↓
/Desktop/example.txt
```

The File Manager also implements folder drop targets for moving BrowserOS files.

Host operating-system files are handled separately through the browser's normal `File` drag/drop mechanism and can be imported into the virtual filesystem.

Because BrowserOS has both host-file drag/drop and internal virtual-file drag/drop, these two paths are intentionally distinct.

---

# 14. Current Application Model

BrowserOS currently has two application categories.

### Native system applications

These are JavaScript modules loaded by the operating system itself.

They have direct access to BrowserOS internals and are registered through the Window Manager.

### .beep applications

These are packaged applications loaded from ZIP-based `.beep` archives.

They run in sandboxed iframes and communicate through BOS.

This distinction is important:

> **Native does not mean "more important" and .beep does not mean "less capable." They are different execution environments.**

Native applications are appropriate for components that need OS-level access. .beep applications are appropriate for isolated applications using the public BOS interface.

---

# 15. Design Notes and Limitations

BrowserOS is an experimental browser operating environment rather than a replacement for a conventional operating system.

## Browser dependency

The system depends on browser APIs including:

- IndexedDB
- iframe sandboxing
- postMessage
- Fetch
- Web Audio/media APIs where applicable
- DOM and CSS

Its capabilities are therefore bounded by the browser.

## Virtual filesystem

The BrowserOS filesystem is independent of the host filesystem.

A BrowserOS file such as:

```
/Documents/notes.txt
```

is an IndexedDB record, not a file automatically visible in the host operating system.

Import/export operations are required to move data between the two environments.

## Security model

Sandboxing and permission checks provide separation between .beep applications and BrowserOS.

However, BrowserOS is still experimental. The permission model should be treated as an application-level security boundary rather than as a substitute for a native operating-system security model.

## Documentation status

The original specification was written during the design phase in March 2026.

The implementation has since diverged in several places, particularly:

- More components became native rather than .beep applications.
- The kernel gained drag-related IPC.
- The launcher gained cached ZIP data for seeded apps.
- The manifest implementation supports an emoji icon fallback.
- The App Store and other shell components are implemented directly in `src/shell/`.
- The current boot sequence seeds only the .beep applications that are actually present in the repository's inbox configuration.

This document is intended to describe the current implementation rather than preserve the original planned architecture.

---

# 16. Project History

## BrowserOS v1

BrowserOS v1 used a shared JavaScript environment for applications.

Applications could access the OS environment directly, which made development simple but provided little isolation.

## BrowserOS v2

BrowserOS v2 introduced:

- Sandboxed .beep applications
- postMessage IPC
- BOS API
- IndexedDB filesystem
- Persistent settings
- A rewritten Window Manager
- Native system applications
- Application installation
- App Store infrastructure
- Desktop and shell integration

The current project is a hybrid of the original v2 architecture and features added during implementation.

---

## Version History

| Version | Description |
|---|---|
| 2.0.0 | Initial BrowserOS v2 architecture and implementation |
| 2.x development | Expanded native shell, application system, App Store, drag/drop and other desktop features |

---

## Repository Structure

The major source areas are:

```
browseros2/
├── apps/                 # .beep application packages
├── src/
│   ├── apps/             # application launcher and related logic
│   ├── bos/              # BOS client library
│   ├── fs/               # IndexedDB and virtual filesystem
│   ├── kernel/           # IPC and permission system
│   ├── shell/            # Desktop and native system applications
│   ├── ui/               # Settings and notifications
│   └── wm/               # Window Manager
├── index.html             # Browser entry point
├── README.md              # Short project description
└── SPEC.md                # This document
```

---

*BrowserOS v2 — technical and general reference*
*Licensed under AGPL-3.0*
