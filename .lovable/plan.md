

# App Restore: Auto-Detect Protee Screen ID from Display Name

## Overview
Instead of manually entering the cryptic `\\?\DISPLAY#BNQB870#...` device path, you will simply pick the correct monitor from a dropdown showing familiar names like "BENQ RE6504" or "LG". The system will automatically resolve the Windows device path behind the scenes and write it into the Protee config on session close.

## How It Works

1. **New "Detect Screen IDs" function** in the Electron app uses a PowerShell/WMI command to enumerate all connected monitors and retrieve both the friendly name (e.g., "BENQ RE6504") and the Windows device path (the `\\?\DISPLAY#...` string that Protee uses).

2. **In the App Restore settings UI**, a new "Protee Labs Display" section shows a dropdown of all connected displays by their label. When you select one, the system stores the corresponding device path.

3. **On session close**, the stored device path is written into the Protee config file at `C:\Users\Golf Sim\AppData\Roaming\ProTeeUnited\Configs\Config`, replacing the `CurrentStartupScreen=` line.

## Technical Details

### 1. `electron/main.js`

**New function `getDisplayDevicePaths()`**:
- Runs a PowerShell command to query `Win32_PnPEntity` or reads from the Windows registry (`HKLM\SYSTEM\CurrentControlSet\Enum\DISPLAY`) to get the full device paths in the `\\?\DISPLAY#...` format
- Maps each device path to the monitor's manufacturer/model name (parsed from the EDID hardware ID segment, e.g., `BNQB870` maps to BENQ)
- Returns an array of `{ label, devicePath }` objects

**New function `restoreProteeConfig()`**:
- Reads `C:\Users\Golf Sim\AppData\Roaming\ProTeeUnited\Configs\Config`
- Finds the `CurrentStartupScreen=` line
- Replaces the value with the stored device path
- Writes the file back
- Called alongside GSPro baseline restore on session close

**Updated `baselineConfig`** -- add two new fields:
- `proteeDisplayLabel`: The friendly display name selected (e.g., "BENQ RE6504")
- `proteeScreenId`: The resolved `\\?\DISPLAY#...` device path

**Updated `restoreBaselineFiles()`** -- after restoring GSPro files, also call `restoreProteeConfig()`

**New IPC handlers**:
- `get-display-device-paths` -- returns all displays with friendly names and Windows device paths
- `set-protee-display` -- saves the selected display label and its device path
- `read-protee-current-screen` -- reads the live Protee config and returns the current `CurrentStartupScreen` value

### 2. `electron/preload.js`

Expose three new methods:
- `getDisplayDevicePaths()` -- returns display list with device paths
- `setProteeDisplay(label, devicePath)` -- saves the selection
- `readProteeCurrentScreen()` -- reads current value from Protee config

### 3. `src/types/electron.d.ts`

Add TypeScript declarations for the three new methods and update the baseline config return type to include `proteeDisplayLabel` and `proteeScreenId`.

### 4. Rename `GSProBaselineSettings.tsx` to `AppRestoreSettings.tsx`

- Rename component export
- Change title to "App Restore"
- Add a new **Protee Labs Monitor** section:
  - Dropdown listing all connected displays by name (fetched via `getDisplayDevicePaths()`)
  - Shows the currently configured display with a green checkmark, or "Not Set" warning
  - A "Refresh Displays" button to re-scan
  - Shows the current `CurrentStartupScreen` value from the live Protee config for verification
- Update the "How it works" info to mention Protee restoration
- "Restore Now" button will now also patch the Protee config

### 5. `src/pages/BayController.tsx`

- Update import from `GSProBaselineSettings` to `AppRestoreSettings`
- Update the collapsible section title to "App Restore"

### Device Path Resolution Approach

The PowerShell command to get device paths:

```text
powershell -Command "Get-PnpDevice -Class Monitor -Status OK | Select-Object InstanceId, FriendlyName | ConvertTo-Json"
```

This returns data like:
```text
{
  "InstanceId": "DISPLAY\\BNQB870\\5&2a4b1e4&0&UID4353",
  "FriendlyName": "BenQ RE6504"
}
```

The `InstanceId` is then converted to the `\\?\DISPLAY#BNQB870#5&2a4b1e4&0&UID4353#{e6f07b5f-ee97-4a90-b076-33f57bf4eaa7}` format by replacing backslashes with hashes and appending the standard monitor device interface GUID (`{e6f07b5f-ee97-4a90-b076-33f57bf4eaa7}`).

The friendly name from PowerShell is matched against Electron's `display.label` to create the mapping.

### Restore Flow on Session Close

```text
1. GSPro process detected as closed
2. Wait for file handles to release
3. Restore GSPro baseline files (existing)
4. Restore Protee config (NEW):
   a. Read Protee config file
   b. Replace CurrentStartupScreen= with stored device path
   c. Write file back
   d. Log result
5. Report all results to UI
```

### Files to Modify
- `electron/main.js` -- device path detection, Protee config patching, new IPC handlers
- `electron/preload.js` -- expose new methods
- `src/types/electron.d.ts` -- new type declarations
- `src/components/bay-controller/GSProBaselineSettings.tsx` -- rename to AppRestoreSettings, add Protee display picker
- `src/pages/BayController.tsx` -- update import and title

