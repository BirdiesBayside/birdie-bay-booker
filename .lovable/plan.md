

# Fix: Bay Controller Update Download Stuck / Silent Failures

## The Problem

When a user clicks "Check for updates" and an update is found, a toast says "downloading..." but then nothing happens. The download either:
- Fails silently (the error handler in the Electron main process only logs to console, never tells the UI)
- Succeeds but the "update downloaded" event doesn't reach the UI
- Takes a long time with no progress feedback

## The Fix (2 files)

### 1. Forward update errors to the renderer (`electron/main.js`)

Currently the `autoUpdater.on('error')` handler only does `console.error`. We need to also send the error to the renderer window so the UI can show it.

Also forward `update-available` so the UI knows downloading has started.

### 2. Handle errors and show progress in the UI (`src/pages/BayController.tsx`)

- Add an `updateError` state so failed downloads show an error toast
- Listen for `onUpdateAvailable` to confirm download is in progress
- Show a persistent "Downloading update..." indicator (not just a fleeting toast)

## Technical Details

### `electron/main.js` -- forward error and available events

```javascript
autoUpdater.on('error', (err) => {
  console.error('[AutoUpdater] Error:', err.message);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-error', err.message);
  }
});
```

### `electron/preload.js` -- expose error listener

```javascript
onUpdateError: (callback) => {
  ipcRenderer.on('update-error', (event, error) => callback(error));
  return () => ipcRenderer.removeAllListeners('update-error');
},
```

### `src/types/electron.d.ts` -- add type

```typescript
onUpdateError: (callback: (error: string) => void) => () => void;
```

### `src/pages/BayController.tsx` -- listen for errors and show feedback

- Add listener for `onUpdateError` that shows `toast.error("Update failed: ...")`
- Change the "Check for updates" button handler to show the error if download fails
- This way users see either "Update downloaded - Install and Restart" or "Update failed: [reason]"

## Files Changed

1. `electron/main.js` -- send `update-error` event to renderer
2. `electron/preload.js` -- expose `onUpdateError` listener
3. `src/types/electron.d.ts` -- add type for new listener
4. `src/pages/BayController.tsx` -- listen for error events and display feedback

