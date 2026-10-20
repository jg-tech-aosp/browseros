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

## Clear Ice material

In **Settings → Appearance**, scroll to **Clear Ice** below the transparency
switch. It adds a translucent tinted surface, saturated backdrop, directional
highlights, a rounded reflective rim, and inset shading to shell surfaces.
It applies across themes and works in both dark and light mode.

- **Blur** runs from 0 to 40 pixels: clearer to blurrier.
- **Surface tint** controls how much the theme colors the glass: more transparent
  to more solid. A small tint remains at the transparent end for readability.
- The preview and shell update while dragging. Values save when the slider is
  released, and are included with other settings in backups.
- **Clear Ice off** returns to the simpler frosted appearance.
- **Transparency off** uses solid surfaces and disables the material controls.

Window frames, taskbar buttons, Start, context menus, search, flyouts,
notifications, and widgets share the material. App documents and iframe content
are not filtered. The rim is a decorative layer with pointer events disabled.
Maximized and snapped windows have no floating frame inset. The effect adds no
continuous animation and respects reduced motion and forced colors.

The material uses CSS backdrop filters, layered gradients, masks, and shadows;
it does not require screen capture or access to sandboxed app content. Browsers
without backdrop filters receive solid surfaces. Masked rims have a shadow-only
fallback when mask compositing is unavailable.

Implementation references: [backdrop-filter](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/backdrop-filter)
and [mask-composite](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/mask-composite).

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

