# Document close guards

Sandboxed document apps may opt into a close decision with
`BOS.ui.onBeforeClose(async () => boolean)`. Returning `true` permits closing;
`false`, cancellation or failure keeps the window open. A handler may present
Save / Discard / Cancel in its own iframe. Its unsubscribe function removes the
guard. `BOS.ui.setDocumentDirty(boolean)` separately reports whether a browser
reload or navigation should trigger the standard unsaved-changes warning.

The window manager identifies signals by the exact registered iframe's
`contentWindow`. App IDs and opaque origins are not used as proof of ownership.
A decision must match the outstanding request ID for that window. These APIs
grant no access to other windows, the parent DOM, files or settings; no new
permission is needed to protect an app's own document. The kernel ignores the
three fixed non-RPC signals handled by the window manager.

All window close actions use the guard, including taskbar Close all. Clean
documents also receive the request so a pending cell/formula edit can be flushed
before the decision. There is no automatic timeout that discards work. If a guard
hangs, a further close action after ten seconds offers an explicit force-close
confirmation. Before-unload behavior is the browser's standard warning, subject
to the browser's user-interaction rules; no asynchronous save is attempted there.

Writer 2.0.1, Stage 2.0.1 and Cells 1.0.1 use the shared Office controller to
register the guard. Save As cancellation, save failure, edits arriving while a
save is in progress, and a pending save/open all prevent a premature close.
Reload the OS before updating the apps so their frames receive the new BOS API.

