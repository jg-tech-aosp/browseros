# BrowserOS 3.0.0

Release preparation is staged in `browseros3dev`. The merge and rollout to `jg-tech-aosp/browseros` are deliberately pending.

## New in this release

- First-run setup with a local profile and Clear Ice dark/light defaults.
- Clear Ice themes, wallpapers, adjustable glass, selected controls and switches, plus widgets for supported native apps.
- Window animations, reduced motion, snapping, app switching, grouped pinned taskbar buttons and window previews.
- Expanded Settings, storage and backup tools, Developer / Debug controls and an upgraded Terminal.
- File associations and Open with, Recycle Bin with restore and permanent deletion, and full profile ZIP backup/restore.
- Native Calendar and Clock with the taskbar date/time panel, and local Video Player.
- Refreshed Info and a native Help app with shortcuts, recovery guidance and browser limitations.
- Writer, Stage and Cells are available separately from the Store. The OS supports their file associations and document close guards.

## Release identity

The product name is **BrowserOS** in onboarding and ordinary UI. Settings, System Monitor, Terminal system information and the BOS OS-version API report **3.0.0**. Terminal remains **v3.0**. BOS API compatibility stays at **2.0**; database schema and backup-format versions are independent and have not been relabeled as OS versions.

The bundled Info package is version 3.0.0. At boot, older protected Info installs are refreshed while preserving their storage identity and installation date. Other installed apps and profile data are not reset.

## Before the main-site rollout

1. Review this development build and download a full backup from Settings → Storage.
2. Review the destination repository and its profile database name before merging. The development database remains `BrowserOS3Dev` to preserve isolation; changing this without a migration decision could make existing files appear missing or expose the wrong profile.
3. Decide how existing main-site BrowserOS 2 profiles should upgrade. Keep the old profile recoverable, and do not treat a database-name change as a migration.
4. Merge and publish only at the release moment. Repository-relative resource paths allow the app to run under the main repository’s Pages path.

No main-repository merge, GitHub release or database migration is performed by this cleanup.

## Known browser limits

Firefox supports ordinary Clear Ice blur, but not the curved backdrop displacement used for magnification. Embedded websites may reject framing. Media codecs and audio playback depend on the browser. Office imports for DOCX, PPTX and XLSX are not implemented.

