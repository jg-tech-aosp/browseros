# Themes and desktop widgets

Choose a coordinated theme in **Settings → Appearance**: Galaxy, Clear Ice,
Arctic, Midnight, Forest, Rose, or Ember. Each preset supplies a wallpaper,
accent, and coordinated window, menu, taskbar, and control colors. Every palette
has light and dark variants. Accent, wallpaper, and transparency can still be
changed individually after selecting a preset.

Clear Ice includes the bundled black liquid wallpaper with ice-blue lighting.
The wallpaper is stored as `builtin:clear-ice` in preferences and resolved
relative to the theme module, so saved settings do not embed a deployment URL.
Custom pictures still come from files already in the BrowserOS filesystem.

## Desktop widgets

Right-click the desktop and choose **Add widgets**, or use **Settings → Widgets**.
The first compatible apps provide:

- Clock: local time and date.
- Calendar: the next three events from today onward. Click an event to open its day.
- File Manager: recently changed files, opened through existing file associations.
- System Monitor: open windows and browser storage usage, when supported.

Drag a widget's grip to move it. The grip also supports arrow keys. Click its
title to open the associated app, or × to remove the widget. A single instance
of each widget can be shown. Widgets stay behind app windows, and their layout
is saved in `desktopWidgets` with other settings, including system backups.

Widgets are optional and start disabled. Polling pauses while the browser page
is hidden; removing a widget disposes its timers and event handlers.

## Native widget providers

Trusted native apps can include a `widgets` array in `wm.registerSystemApp`:

```js
widgets: [{
  id: 'summary',
  title: 'App summary',
  description: 'What this widget shows.',
  height: 220,
  mount(container, { wm, settings, fs, db, fileAssociations }) {
    // Render with DOM nodes and textContent. Inherit --wm-* theme colors.
    // Return a cleanup function for timers, subscriptions, and listeners.
    return () => {};
  },
}],
```

The desktop combines the native app ID and widget ID into a stable key, such as
`calendar:agenda`. Preferences contain only these IDs and normalized positions;
they never contain executable widget code. The first implementation accepts only
native providers registered by the OS. Installing a .beep app does not grant it
desktop DOM access or new permissions. Supporting third-party widget views later
requires a sandboxed view and an explicit data bridge.

## App themes

The sandbox launcher updates `--bg`, `--text`, `--text-dim`, `--sidebar-bg`,
`--hover`, `--win-bg`, `--input-bg`, `--border`, `--win-border`, `--accent`, and
`--font` at launch and on `themeChanged`. Apps using these variables follow the
selected palette. Apps with hardcoded colors must opt into these variables.
`BOS.os.theme()` includes a `colors` object in the boot payload; the same
structure is sent with theme change events. Existing permissions are unchanged.

## Manual checks

1. Select a theme; check an open native app, Start, taskbar, and Settings.
2. Toggle light mode and transparency, then choose a custom picture from Files.
3. Open a compatible .beep app and switch themes while it is running.
4. Add the four widgets, drag one, reload, and confirm the layout returns.
5. Add a Calendar event and check the Calendar widget; open it from the widget.
6. Open a recent file from its widget, then remove and re-add a widget.
7. Test a smaller window and a larger interface scale; widgets stay within the desktop.

