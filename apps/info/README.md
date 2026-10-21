# Bundled Info app

Info is a protected `.beep` app installed with BrowserOS. It shares the guide renderer and content in `src/ui/guide.js` with the native Help app.

Run `python apps/info/build.py` from any working directory to rebuild `apps/info.beep`. Python's standard library is sufficient. The builder reads the release version from `src/version.js`, packages the guide as a standalone script, and includes a root-level manifest. Info requests no filesystem, network or private-storage permissions; it subscribes only to theme changes.

When shipping an Info update, keep the expected protected-bundle version passed to `seedInboxApps` aligned with the package. BrowserOS currently uses `OS_VERSION` for this. Existing protected Info installs upgrade on boot, preserving their storage identity. Ordinary installed apps continue to use their normal update flow.

