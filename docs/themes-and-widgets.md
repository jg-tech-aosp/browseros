# Themes and desktop widgets

Choose a coordinated theme in **Settings → Appearance**: Clear Ice, Clear Ice
Light, Galaxy, Arctic, Midnight, Forest, Rose, or Ember. Each preset supplies a wallpaper,
accent, and coordinated window, menu, taskbar, and control colors. Every palette
has light and dark variants. Accent, wallpaper, and transparency can still be
changed individually after selecting a preset.

New profiles default to Clear Ice with its dark wallpaper and blue accent.
Onboarding's Dark and Light choices apply Clear Ice and Clear Ice Light
respectively, including the matching wallpaper, palette, and accent. The Dark
Mode switch also pairs these presets and their built-in wallpapers; custom
pictures and accent overrides are kept. Existing saved preferences are preserved.

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

Clear Ice offers an experimental **Glass magnification** switch in Appearance,
on by default for new profiles. It simulates **curved glass refraction** in Chromium browsers
(including Chrome and Edge): gentle center magnification and a nonlinear bend
near the rounded rim. The bend follows each surface's dimensions and corner
radii, tapers to zero at the boundary, and stays within 6.4 CSS pixels. Center
zoom displacement is smoothly limited to 2 pixels per axis so long titlebars
do not produce a large sideways shift. SVG displacement can make window movement
and menu animations stutter; leave it off for the normal CSS glass rendering. Disabling
the switch removes the lens filters and their observers immediately. Text,
controls, and pointer hit areas are unchanged.
It is easiest to see at lower Blur settings. Other browser engines retain the
normal glass backdrop because SVG backdrop filters are not enabled there.
Each surface's filter is released when the surface is removed. Coordinate maps
are generated from rounded rectangle geometry on creation or size changes,
with up to 16 recent sizes cached. Nothing is regenerated just because a window
moves. No screen pixels or sandboxed app DOM are copied. This is a stylized
optical effect, not a physical glass simulation.

Implementation references: [backdrop-filter](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/backdrop-filter)
and [mask-composite](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/mask-composite).

## Clear Ice switches

Settings switches share `src/ui/glass-switch.js`: a slim accent-colored track
and a larger raised thumb with a slight white tint, rounded reflective rim,
highlight and small backdrop blur while Clear Ice is enabled. The thumb glides
between states and expands slightly while pressed. With transparency or Clear
Ice disabled, it uses an opaque thumb. Keyboard activation, focus indicators,
switch names, checked states, reduced motion and forced colors are supported.
The same control is used for Clear Ice and magnification themselves.

## Native app sidebar islands

File Manager and Settings use the shared `src/ui/native-layout.js` styles.
Their sidebars sit inside the app with rounded corners, a subtle border and
shadow, and an opaque shade mixed from the current palette. The content area
keeps its solid app background. Navigation buttons follow the accent and retain
visible keyboard focus. File Manager's toolbar uses the same rounded controls.
The layout narrows its sidebar in small windows and scrolls each pane separately.
The islands stay opaque. Selected navigation buttons have a soft accent tint,
reflective highlight, border and shadow, plus a small 8-pixel backdrop blur when
Clear Ice is enabled. Pressing gently compresses a button; selection fades
between items. File Manager keeps navigation nodes alive across folder changes
so transitions and keyboard focus persist. Reduced motion removes the press
transform. No magnification or continuous animation is added inside these apps.

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

