const { app, BrowserWindow, Tray, Menu, ipcMain, screen, dialog, clipboard, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec, spawn } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

// State for auto-paste functionality
let autoPasteEnabled = false;
let autoPasteText = '';

let mainWindow;
let tray;
let tapoClient = null;
let isAppAuthenticated = false; // Track if user has entered correct password
let welcomeWindows = []; // Array of welcome windows (one per display)

const isDev = process.env.NODE_ENV === 'development';

// TAPO credentials - these should be set via environment or config
const TAPO_EMAIL = process.env.TAPO_EMAIL || '';
const TAPO_PASSWORD = process.env.TAPO_PASSWORD || '';

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1024,
    height: 768,
    minWidth: 800,
    minHeight: 600,
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    autoHideMenuBar: true,
    show: false,
    // Prevent closing via keyboard shortcuts
    closable: true
  });

  // Load the app
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173/bay-controller');
  } else {
    // In production, load the standalone bay controller HTML directly
    const indexPath = path.join(process.resourcesPath, 'dist', 'bay-controller.html');
    console.log('Loading bay controller from:', indexPath);
    
    mainWindow.loadFile(indexPath).catch(err => {
      console.error('Failed to load app:', err);
      mainWindow.webContents.openDevTools();
    });
  }

  // Open DevTools in development or if loading fails
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('Failed to load:', errorCode, errorDescription);
    mainWindow.webContents.openDevTools();
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Enable DevTools shortcut (Ctrl+Shift+I or F12)
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if ((input.control && input.shift && input.key.toLowerCase() === 'i') || input.key === 'F12') {
      mainWindow.webContents.toggleDevTools();
    }
  });

  // Minimize to tray instead of closing - ALWAYS prevent close
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      // Reset authentication when hiding - forces re-auth on next show
      isAppAuthenticated = false;
      mainWindow.webContents.send('request-lock');
    }
    return false;
  });
}

function createTray() {
  tray = new Tray(path.join(__dirname, 'icon.png'));
  
  const contextMenu = Menu.buildFromTemplate([
    { 
      label: 'Show Bay Controller', 
      click: () => {
        // Always reset auth and show - password will be required
        isAppAuthenticated = false;
        mainWindow.webContents.send('request-lock');
        mainWindow.show();
      }
    },
    { type: 'separator' },
    { 
      label: 'Quit', 
      click: () => {
        // Request password verification before quit
        mainWindow.webContents.send('request-quit-password');
        mainWindow.show();
      }
    }
  ]);

  tray.setToolTip('Birdies Bay Controller');
  tray.setContextMenu(contextMenu);
  
  tray.on('double-click', () => {
    // Always reset auth and show - password will be required
    isAppAuthenticated = false;
    mainWindow.webContents.send('request-lock');
    mainWindow.show();
  });
}

// Run on startup (Windows)
app.setLoginItemSettings({
  openAtLogin: true,
  path: app.getPath('exe')
});

app.whenReady().then(() => {
  createWindow();
  createTray();
  
  // Register global F7 hotkey to toggle SGT info overlay (works even when app is in tray)
  globalShortcut.register('F7', async () => {
    console.log('[GlobalShortcut] F7 pressed - toggling SGT info overlay');
    console.log('[GlobalShortcut] currentSgtDisplayLabel:', currentSgtDisplayLabel);
    if (sgtInfoWindow && !sgtInfoWindow.isDestroyed()) {
      console.log('[GlobalShortcut] Closing existing SGT info window');
      sgtInfoWindow.close();
      sgtInfoWindow = null;
    } else if (currentSgtDisplayLabel) {
      console.log('[GlobalShortcut] Opening SGT info window on:', currentSgtDisplayLabel);
      await showSgtInfoOverlay(currentSgtDisplayLabel);
    } else {
      console.log('[GlobalShortcut] No currentSgtDisplayLabel set - cannot show SGT info');
    }
  });
});

// Unregister shortcuts on quit
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  // Do nothing - prevent app from closing
  // App should only quit via authenticated quit
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Handle authenticated quit from renderer
ipcMain.handle('confirm-quit', async () => {
  app.isQuitting = true;
  app.quit();
  return { success: true };
});

// Handle authentication state update from renderer
ipcMain.handle('set-authenticated', async (event, authenticated) => {
  isAppAuthenticated = authenticated;
  return { success: true };
});

// Initialize TAPO connection
async function initTapo(email, password) {
  try {
    const { cloudLogin } = require('tp-link-tapo-connect');
    tapoClient = await cloudLogin(email, password);
    console.log('TAPO cloud login successful');
    return { success: true };
  } catch (error) {
    console.error('TAPO cloud login failed:', error.message);
    return { success: false, error: error.message };
  }
}

// Test TAPO login credentials - validates format and checks tapo_control.exe exists
async function testTapoLogin(email, password) {
  try {
    if (!email || typeof email !== 'string' || email.trim() === '') {
      return { success: false, error: 'Please enter your TAPO email address' };
    }
    if (!password || typeof password !== 'string' || password.trim() === '') {
      return { success: false, error: 'Please enter your TAPO password' };
    }
    
    const cleanEmail = email.trim();
    console.log('Testing TAPO credentials format for:', cleanEmail);
    
    // Check if tapo_control.exe exists
    const path = require('path');
    const fs = require('fs');
    
    const possiblePaths = [
      path.join(__dirname, 'tapo_control.exe'),
      path.join(process.resourcesPath || '', 'tapo_control.exe'),
      path.join(app.getAppPath(), 'tapo_control.exe'),
    ];
    
    const exePath = possiblePaths.find(p => {
      try {
        fs.accessSync(p);
        return true;
      } catch { return false; }
    });
    
    if (exePath) {
      return { 
        success: true, 
        message: 'Credentials saved. Test with a plug to verify login works.' 
      };
    } else {
      return { 
        success: false, 
        error: 'tapo_control.exe not found. Please reinstall the Bay Controller app.' 
      };
    }
  } catch (error) {
    console.error('TAPO login test failed:', error.message);
    return { success: false, error: error.message };
  }
}


// Control a specific TAPO plug using bundled tapo_control.exe
// P110 plugs require the Python 'tapo' library - bundled as standalone .exe via PyInstaller
async function controlTapoPlug(email, password, deviceIp, action) {
  const { spawn } = require('child_process');
  const path = require('path');
  const fs = require('fs');
  
  return new Promise((resolve) => {
    // Validate inputs
    if (!email || typeof email !== 'string' || email.trim() === '') {
      resolve({ success: false, error: 'Invalid email address' });
      return;
    }
    if (!password || typeof password !== 'string' || password.trim() === '') {
      resolve({ success: false, error: 'Invalid password' });
      return;
    }
    if (!deviceIp || typeof deviceIp !== 'string' || deviceIp.trim() === '') {
      resolve({ success: false, error: 'Invalid device IP address' });
      return;
    }
    
    const cleanEmail = email.trim();
    const cleanPassword = password.trim();
    const cleanIp = deviceIp.trim();
    
    console.log(`TAPO control: ${cleanIp} -> ${action}`);
    
    // Find the bundled tapo_control.exe
    const possiblePaths = [
      path.join(__dirname, 'tapo_control.exe'),
      path.join(process.resourcesPath || '', 'tapo_control.exe'),
      path.join(app.getAppPath(), 'tapo_control.exe'),
    ];
    
    const exePath = possiblePaths.find(p => {
      try {
        fs.accessSync(p);
        return true;
      } catch { return false; }
    });
    
    if (!exePath) {
      console.error('tapo_control.exe not found in:', possiblePaths);
      resolve({ success: false, error: 'tapo_control.exe not found. Please reinstall the Bay Controller app.' });
      return;
    }
    
    console.log('Using tapo_control.exe:', exePath);
    
    const proc = spawn(exePath, [cleanEmail, cleanPassword, cleanIp, action], {
      shell: false,
      windowsHide: true
    });
    
    let stdout = '';
    let stderr = '';
    
    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });
    
    proc.on('error', (err) => {
      console.error('tapo_control.exe error:', err.message);
      resolve({ success: false, error: `Failed to run tapo_control.exe: ${err.message}` });
    });
    
    proc.on('close', (code) => {
      console.log('tapo_control.exe output:', stdout);
      if (stderr) console.error('tapo_control.exe stderr:', stderr);
      
      try {
        const result = JSON.parse(stdout.trim());
        resolve(result);
      } catch (parseError) {
        console.error('Failed to parse output:', stdout);
        resolve({ 
          success: false, 
          error: stderr || stdout || `tapo_control.exe exited with code ${code}`
        });
      }
    });
  });
}

// =====================================================
// APP AUTOMATION - PowerShell-based window management
// =====================================================

// Get all connected displays with their info
async function getDisplayInfo() {
  const displays = screen.getAllDisplays();
  console.log('=== RAW DISPLAY INFO ===');
  displays.forEach((d, i) => {
    console.log(`Display ${i}:`, {
      id: d.id,
      label: d.label,
      bounds: d.bounds,
      size: d.size,
      scaleFactor: d.scaleFactor
    });
  });
  
  return displays.map((display, index) => ({
    id: display.id,
    index,
    // Use label (monitor name like "SAMSUNG", "BENQ PJ") as primary identifier
    label: display.label || `Display ${index + 1}`,
    bounds: display.bounds,
    workArea: display.workArea,
    isPrimary: display.id === screen.getPrimaryDisplay().id,
    size: display.size,
    scaleFactor: display.scaleFactor
  }));
}

// Launch an application - use cmd /c start for reliable Windows path handling
// Returns immediately without waiting for the process to complete
function launchApp(exePath) {
  console.log(`=== LAUNCH APP CALLED ===`);
  console.log(`Path received: "${exePath}"`);
  
  if (!exePath || typeof exePath !== 'string' || exePath.trim() === '') {
    console.error('ERROR: exePath is empty or invalid');
    return Promise.resolve({ success: false, error: 'Path is empty or invalid' });
  }
  
  const trimmedPath = exePath.trim();
  
  // Check if file exists
  if (!fs.existsSync(trimmedPath)) {
    console.error(`ERROR: File does not exist at path: ${trimmedPath}`);
    return Promise.resolve({ success: false, error: `File not found: ${trimmedPath}` });
  }
  
  try {
    // Use cmd /c start "" "path" - this is the most reliable way on Windows
    // The start command returns immediately and the app runs independently
    const command = `cmd /c start "" "${trimmedPath}"`;
    console.log(`Executing: ${command}`);
    
    // exec but don't wait for callback - fire and forget
    exec(command, (error, stdout, stderr) => {
      // This callback fires later but we don't wait for it
      if (error) {
        console.error(`Background exec error for ${trimmedPath}:`, error.message);
      } else {
        console.log(`Background exec completed for ${trimmedPath}`);
      }
    });
    
    // Return success immediately without waiting
    console.log(`Launch initiated (fire-and-forget) for: ${trimmedPath}`);
    return Promise.resolve({ success: true, path: trimmedPath });
  } catch (error) {
    console.error(`Exception launching ${trimmedPath}:`, error.message);
    return Promise.resolve({ success: false, error: error.message });
  }
}

// Get ALL visible windows using simple Get-Process approach
async function getAllVisibleWindows() {
  try {
    // Use Get-Process which is reliable and doesn't need Add-Type
    const psScript = `Get-Process | Where-Object { $_.MainWindowTitle -ne '' } | Select-Object Id, MainWindowTitle, MainWindowHandle | ForEach-Object { @{ hwnd = $_.MainWindowHandle.ToInt64(); title = $_.MainWindowTitle; pid = $_.Id } } | ConvertTo-Json -Compress`;
    
    const { stdout, stderr } = await execAsync(`powershell -NoProfile -Command "${psScript}"`, { 
      maxBuffer: 1024 * 1024,
      timeout: 10000 
    });
    
    if (stderr) {
      console.error('PowerShell stderr:', stderr);
    }
    
    console.log('PowerShell stdout:', stdout);
    
    if (!stdout || stdout.trim() === '') {
      console.log('No windows found (empty output)');
      return [];
    }
    
    const parsed = JSON.parse(stdout.trim());
    const windows = Array.isArray(parsed) ? parsed : [parsed];
    console.log(`Found ${windows.length} windows with titles`);
    return windows;
  } catch (error) {
    console.error('Get windows failed:', error.message);
    console.error('Error details:', error);
    return [];
  }
}

// Find window by title - simple reliable approach
async function findWindowByTitle(titlePattern) {
  try {
    const windowList = await getAllVisibleWindows();
    
    console.log(`=== SEARCHING FOR: "${titlePattern}" ===`);
    console.log(`Found ${windowList.length} windows with titles:`);
    windowList.forEach(w => {
      if (w.title) console.log(`  - "${w.title}" (hwnd: ${w.hwnd})`);
    });
    
    const searchLower = titlePattern.toLowerCase();
    
    // Try exact match first
    let found = windowList.find(w => w.title && w.title.toLowerCase() === searchLower);
    
    // Then try contains match
    if (!found) {
      found = windowList.find(w => w.title && w.title.toLowerCase().includes(searchLower));
    }
    
    if (found) {
      console.log(`MATCH FOUND: "${found.title}" (hwnd: ${found.hwnd})`);
      return { success: true, hwnd: found.hwnd, title: found.title };
    }
    
    console.log(`NO MATCH for "${titlePattern}"`);
    return { success: false, windows: windowList.map(w => w.title).filter(Boolean) };
  } catch (error) {
    console.error('Find window failed:', error.message);
    return { success: false, error: error.message };
  }
}

// Move window to specific display and position using nircmd (more reliable) or PowerShell fallback
async function moveWindowToDisplay(hwnd, displayIndex, fullscreen = false) {
  const displays = screen.getAllDisplays();
  if (displayIndex >= displays.length) {
    return { success: false, error: `Display ${displayIndex} not found` };
  }
  
  const display = displays[displayIndex];
  const { x, y, width, height } = display.bounds;
  
  console.log(`Moving window ${hwnd} to display ${displayIndex} at ${x},${y} size ${width}x${height}`);
  
  // Create a temporary .ps1 file for more reliable execution
  const tempScript = path.join(app.getPath('temp'), 'move_window.ps1');
  const scriptContent = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class WinAPI {
    [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
}
"@
$h = [IntPtr]${hwnd}
[WinAPI]::ShowWindow($h, 9)
Start-Sleep -Milliseconds 200
[WinAPI]::SetWindowPos($h, [IntPtr]::Zero, ${x}, ${y}, ${width}, ${height}, 0x0040)
${fullscreen ? '[WinAPI]::ShowWindow($h, 3)' : ''}
[WinAPI]::SetForegroundWindow($h)
Write-Output "done"
`;
  
  try {
    fs.writeFileSync(tempScript, scriptContent);
    const { stdout, stderr } = await execAsync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${tempScript}"`, { timeout: 10000 });
    console.log('Move window stdout:', stdout);
    if (stderr) console.log('Move window stderr:', stderr);
    fs.unlinkSync(tempScript);
    return { success: true };
  } catch (error) {
    console.error('Move window failed:', error.message);
    try { fs.unlinkSync(tempScript); } catch {}
    return { success: false, error: error.message };
  }
}

// Minimize a window
async function minimizeWindow(hwnd) {
  const tempScript = path.join(app.getPath('temp'), 'min_window.ps1');
  const scriptContent = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class WinAPI { [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow); }
"@
[WinAPI]::ShowWindow([IntPtr]${hwnd}, 6)
`;
  
  try {
    fs.writeFileSync(tempScript, scriptContent);
    await execAsync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${tempScript}"`, { timeout: 5000 });
    fs.unlinkSync(tempScript);
    return { success: true };
  } catch (error) {
    console.error('Minimize window failed:', error.message);
    try { fs.unlinkSync(tempScript); } catch {}
    return { success: false, error: error.message };
  }
}

// Focus a window
async function focusWindow(hwnd) {
  const tempScript = path.join(app.getPath('temp'), 'focus_window.ps1');
  const scriptContent = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class WinAPI {
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
}
"@
$h = [IntPtr]${hwnd}
[WinAPI]::ShowWindow($h, 9)
[WinAPI]::SetForegroundWindow($h)
`;
  
  try {
    fs.writeFileSync(tempScript, scriptContent);
    await execAsync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${tempScript}"`, { timeout: 5000 });
    fs.unlinkSync(tempScript);
    return { success: true };
  } catch (error) {
    console.error('Focus window failed:', error.message);
    try { fs.unlinkSync(tempScript); } catch {}
    return { success: false, error: error.message };
  }
}

// Wait for a window to appear
async function waitForWindow(titlePattern, timeoutMs = 30000) {
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    const result = await findWindowByTitle(titlePattern);
    if (result.success) {
      return result;
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  return { success: false, error: 'Timeout waiting for window' };
}

// Cancellation flag for app launch sequence
let appLaunchCancelled = false;

// Cancel the app launch sequence
function cancelAppLaunch() {
  appLaunchCancelled = true;
  console.log('App launch sequence cancelled by user');
}

// Background watcher for ProTee United VX (API window) - runs independently
// This window auto-launches when GSPRO loads, we just need to minimize it
async function watchForProteeConnector(durationMs = 120000) {
  const startTime = Date.now();
  console.log('Starting background watcher for ProTee United VX API window (2 minute window)...');
  
  while (Date.now() - startTime < durationMs) {
    if (appLaunchCancelled) {
      console.log('ProTee United VX watcher cancelled');
      return { success: false, cancelled: true };
    }
    
    // Get all windows and look specifically for "United VX" in title
    const windowList = await getAllVisibleWindows();
    const unifiedVxWindow = windowList.find(w => 
      w.title && w.title.toLowerCase().includes('united vx')
    );
    
    if (unifiedVxWindow) {
      console.log(`ProTee United VX API window found: "${unifiedVxWindow.title}", minimizing...`);
      await minimizeWindow(unifiedVxWindow.hwnd);
      console.log('ProTee United VX API window minimized successfully');
      return { success: true, hwnd: unifiedVxWindow.hwnd };
    }
    
    // Log periodically
    const elapsed = Date.now() - startTime;
    if (elapsed % 10000 < 2000) {
      console.log(`ProTee United VX watcher: ${Math.round(elapsed/1000)}s elapsed, still searching...`);
    }
    
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  console.log('ProTee United VX watcher timed out after 2 minutes');
  return { success: false, error: 'Timeout - window not found' };
}

// Find GSPRO window specifically (exact match on "GSPro" or "GSPRO")
async function findGsproWindow() {
  const windowList = await getAllVisibleWindows();
  const gsproWindow = windowList.find(w => 
    w.title && (
      w.title === 'GSPro' || 
      w.title === 'GSPRO' ||
      w.title.toLowerCase() === 'gspro'
    )
  );
  if (gsproWindow) {
    console.log(`GSPRO window found: "${gsproWindow.title}" (hwnd: ${gsproWindow.hwnd})`);
    return { success: true, hwnd: gsproWindow.hwnd, title: gsproWindow.title };
  }
  console.log('GSPRO window not found');
  return { success: false };
}

// Find Protee Labs window specifically (must contain "Labs" but NOT "United VX")
async function findProteeLabsWindow() {
  const windowList = await getAllVisibleWindows();
  console.log('Looking for Protee Labs window (must contain "Labs", not "United VX")...');
  windowList.forEach(w => {
    if (w.title) console.log(`  - "${w.title}"`);
  });
  
  const proteeLabsWindow = windowList.find(w => 
    w.title && 
    w.title.toLowerCase().includes('labs') &&
    !w.title.toLowerCase().includes('united vx')
  );
  
  if (proteeLabsWindow) {
    console.log(`Protee Labs window found: "${proteeLabsWindow.title}" (hwnd: ${proteeLabsWindow.hwnd})`);
    return { success: true, hwnd: proteeLabsWindow.hwnd, title: proteeLabsWindow.title };
  }
  console.log('Protee Labs window not found');
  return { success: false };
}

// Wait for all expected displays to be ready (with timeout)
async function waitForAllDisplays(expectedLabels, timeoutMs = 90000) {
  const startTime = Date.now();
  console.log(`Waiting for displays: ${expectedLabels.join(', ')} (timeout: ${timeoutMs}ms)`);
  
  while (Date.now() - startTime < timeoutMs) {
    if (appLaunchCancelled) {
      return { success: false, cancelled: true };
    }
    
    const displays = screen.getAllDisplays();
    const currentLabels = displays.map(d => d.label || `Display ${displays.indexOf(d) + 1}`);
    
    // Check if all expected labels are present (partial match)
    const allFound = expectedLabels.every(expected => 
      currentLabels.some(current => current.toLowerCase().includes(expected.toLowerCase()))
    );
    
    if (allFound) {
      console.log(`All displays ready: ${currentLabels.join(', ')}`);
      return { success: true, displays };
    }
    
    console.log(`Waiting for displays... Current: ${currentLabels.join(', ')}`);
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  console.log('Display wait timed out');
  return { success: false, error: 'Timeout waiting for displays' };
}

// Verify apps are on correct displays (read-only check)
async function verifyAppsReady(gsproDisplayIndex, proteeDisplayIndex) {
  const displays = screen.getAllDisplays();
  const issues = [];
  let gsproReady = false;
  let proteeReady = false;
  
  // Check GSPRO
  const gsproWindow = await findGsproWindow();
  if (gsproWindow.success) {
    gsproReady = true; // For now, just check if window exists
    console.log('GSPRO window found and ready');
  } else {
    issues.push('GSPRO window not found');
  }
  
  // Check Protee Labs
  const proteeLabsWindow = await findProteeLabsWindow();
  if (proteeLabsWindow.success) {
    proteeReady = true;
    console.log('Protee Labs window found and ready');
  } else {
    issues.push('Protee Labs window not found');
  }
  
  const allReady = gsproReady && proteeReady;
  console.log(`Apps ready check: ${allReady ? 'PASSED' : 'FAILED'} - ${issues.join(', ')}`);
  
  return { allReady, gsproReady, proteeReady, issues };
}

// Run the full app launch sequence with welcome windows
// Uses a simple 35-second timer to ensure apps have time to load
async function runAppLaunchSequence(config) {
  const {
    gsproPath,
    proteeLabsPath,
    gsproDisplay,
    proteeDisplay,
    firstName
  } = config;
  
  console.log('=== APP LAUNCH SEQUENCE STARTED ===');
  console.log('GSPRO Path:', gsproPath);
  console.log('Protee Labs Path:', proteeLabsPath);
  console.log('GSPRO Display Index:', gsproDisplay);
  console.log('Protee Display Index:', proteeDisplay);
  console.log('Customer First Name:', firstName);
  
  const results = [];
  appLaunchCancelled = false;
  const APP_LOAD_TIME = 35000; // 35 seconds for apps to fully load
  
  try {
    // Step 0: Show welcome windows on ALL displays
    console.log('Step 0: Showing welcome windows on all displays...');
    const customerFirstName = firstName && firstName.trim() !== '' ? firstName.trim() : 'Guest';
    console.log('Using customer name:', customerFirstName);
    await showWelcomeWindows(customerFirstName);
    results.push({ step: 'show_welcome', success: true });
    
    if (appLaunchCancelled) {
      await closeWelcomeWindows();
      return { success: false, cancelled: true, results };
    }
    
    // Step 1: Launch GSPRO immediately
    console.log('Step 1: Launching GSPRO...');
    const gsproLaunch = await launchApp(gsproPath);
    console.log('GSPRO launch result:', JSON.stringify(gsproLaunch));
    results.push({ step: 'launch_gspro', ...gsproLaunch });
    
    if (!gsproLaunch.success) {
      await closeWelcomeWindows();
      return { success: false, error: 'Failed to launch GSPRO: ' + gsproLaunch.error, results };
    }
    
    // Wait 5 seconds then launch Protee Labs
    console.log('Waiting 5 seconds before launching Protee Labs...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    if (appLaunchCancelled) {
      await closeWelcomeWindows();
      return { success: false, cancelled: true, results };
    }
    
    // Step 2: Launch Protee Labs
    console.log('Step 2: Launching Protee Labs...');
    if (proteeLabsPath && proteeLabsPath.trim() !== '') {
      const proteeLaunch = await launchApp(proteeLabsPath);
      console.log('Protee Labs launch result:', JSON.stringify(proteeLaunch));
      results.push({ step: 'launch_protee_labs', ...proteeLaunch });
    } else {
      console.log('Skipping Protee Labs - path not configured');
      results.push({ step: 'launch_protee_labs', skipped: true });
    }
    
    if (appLaunchCancelled) {
      await closeWelcomeWindows();
      return { success: false, cancelled: true, results };
    }
    
    // Step 3: Wait for the remaining time (35 seconds total from sequence start)
    // This gives apps time to fully load behind the welcome windows
    const elapsedSoFar = 5000; // We've waited about 5 seconds
    const remainingWait = APP_LOAD_TIME - elapsedSoFar;
    console.log(`Step 3: Waiting ${remainingWait / 1000} more seconds for apps to load...`);
    
    // Check for cancellation every 5 seconds during the wait
    const checkInterval = 5000;
    let waited = 0;
    while (waited < remainingWait) {
      if (appLaunchCancelled) {
        await closeWelcomeWindows();
        return { success: false, cancelled: true, results };
      }
      await new Promise(resolve => setTimeout(resolve, checkInterval));
      waited += checkInterval;
      console.log(`  ...${Math.round((remainingWait - waited) / 1000)} seconds remaining`);
    }
    
    results.push({ step: 'wait_for_apps', success: true, duration: APP_LOAD_TIME });
    
    // Step 4: Position windows (minimize United VX, move GSPRO and Protee Labs)
    console.log('Step 4: Positioning windows...');
    await checkAndCorrectWindowPositions(gsproDisplay, proteeDisplay);
    results.push({ step: 'position_windows', success: true });
    
    // Step 5: Focus GSPRO
    console.log('Step 5: Focusing GSPRO...');
    const gsproWindow = await findGsproWindow();
    if (gsproWindow.success) {
      await focusWindow(gsproWindow.hwnd);
      results.push({ step: 'focus_gspro', success: true });
    } else {
      console.log('GSPRO window not found, proceeding anyway');
      results.push({ step: 'focus_gspro', success: false, error: 'Window not found' });
    }
    
    // Step 6: Close all welcome windows (the big reveal!)
    console.log('Step 6: Closing welcome windows...');
    await closeWelcomeWindows();
    results.push({ step: 'close_welcome', success: true });
    
    // Final focus on GSPRO after welcome windows close
    if (gsproWindow.success) {
      await new Promise(resolve => setTimeout(resolve, 500));
      await focusWindow(gsproWindow.hwnd);
    }
    
    console.log('=== APP LAUNCH SEQUENCE COMPLETE ===');
    return { success: true, results };
  } catch (error) {
    console.error('App launch sequence failed:', error.message);
    await closeWelcomeWindows();
    return { success: false, error: error.message, results };
  }
}

// Show welcome windows on all displays
async function showWelcomeWindows(firstName) {
  console.log(`Showing welcome windows for: ${firstName}`);
  
  // Close any existing welcome windows
  await closeWelcomeWindows();
  
  const displays = screen.getAllDisplays();
  
  // Read the welcome logo and convert to base64
  let logoBase64 = '';
  try {
    const logoPath = path.join(__dirname, 'welcome-logo.png');
    if (fs.existsSync(logoPath)) {
      const logoBuffer = fs.readFileSync(logoPath);
      logoBase64 = `data:image/png;base64,${logoBuffer.toString('base64')}`;
    }
  } catch (err) {
    console.log('Could not load welcome logo:', err.message);
  }
  
  // Create HTML content for welcome window - Birdies brand theme
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
      <link href="https://fonts.googleapis.com/css2?family=Anton&family=Inter:wght@300;400;500&display=swap" rel="stylesheet">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
          background: #fff5e4;
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100vh;
          color: #1f4c25;
          overflow: hidden;
        }
        .container {
          text-align: center;
          animation: fadeIn 0.5s ease-out;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        .logo {
          width: 210px;
          margin-bottom: 50px;
          filter: drop-shadow(0 10px 30px rgba(31, 76, 37, 0.15));
        }
        h1 {
          font-family: 'Anton', sans-serif;
          font-size: 96px;
          font-weight: 400;
          color: #1f4c25;
          margin-bottom: 10px;
          text-transform: uppercase;
          letter-spacing: 2px;
        }
        h2 {
          font-family: 'Anton', sans-serif;
          font-size: 56px;
          font-weight: 400;
          color: #ec622d;
          margin-bottom: 60px;
          text-transform: uppercase;
          letter-spacing: 1px;
        }
        p {
          font-family: 'Inter', sans-serif;
          font-size: 28px;
          font-weight: 400;
          color: #1f4c25;
          opacity: 0.85;
          margin-bottom: 12px;
        }
        .loading {
          margin-top: 60px;
          display: flex;
          gap: 16px;
          justify-content: center;
        }
        .loading span {
          width: 18px;
          height: 18px;
          background: #ec622d;
          border-radius: 50%;
          animation: pulse 1.4s infinite ease-in-out;
        }
        .loading span:nth-child(1) { animation-delay: 0s; }
        .loading span:nth-child(2) { animation-delay: 0.2s; }
        .loading span:nth-child(3) { animation-delay: 0.4s; }
        @keyframes pulse {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.5; }
          40% { transform: scale(1); opacity: 1; }
        }
      </style>
    </head>
    <body>
      <div class="container">
        ${logoBase64 ? `<img src="${logoBase64}" class="logo" alt="Birdies" />` : ''}
        <h1>Hi ${firstName}!</h1>
        <h2>Welcome to Birdies</h2>
        <p>Your session is starting.</p>
        <p>This window will close when you're ready to tee off!</p>
        <div class="loading">
          <span></span>
          <span></span>
          <span></span>
        </div>
      </div>
    </body>
    </html>
  `;
  
  // Create a welcome window on each display
  for (const display of displays) {
    const { x, y, width, height } = display.bounds;
    
    const welcomeWindow = new BrowserWindow({
      x,
      y,
      width,
      height,
      fullscreen: true,
      frame: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      focusable: false, // Don't steal focus from apps loading behind
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    });
    
    welcomeWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);
    welcomeWindows.push(welcomeWindow);
    
    console.log(`Created welcome window on display: ${display.label || 'Unknown'} at ${x},${y}`);
  }
  
  console.log(`Created ${welcomeWindows.length} welcome windows`);
  return { success: true, windowCount: welcomeWindows.length };
}

// Close all welcome windows
async function closeWelcomeWindows() {
  console.log(`Closing ${welcomeWindows.length} welcome windows...`);
  
  for (const win of welcomeWindows) {
    try {
      if (win && !win.isDestroyed()) {
        win.close();
      }
    } catch (err) {
      console.error('Error closing welcome window:', err.message);
    }
  }
  
  welcomeWindows = [];
  return { success: true };
}

// Check window positions and move to correct displays if needed
// Also minimizes United VX API window and focuses GSPRO at the end
async function checkAndCorrectWindowPositions(gsproDisplay, proteeDisplay) {
  const results = [];
  
  console.log('=== CHECKING WINDOW POSITIONS ===');
  console.log('Expected GSPRO display:', gsproDisplay);
  console.log('Expected Protee Labs display:', proteeDisplay);
  
  // First, minimize ProTee United VX if found (so it doesn't interfere)
  const windowList = await getAllVisibleWindows();
  const unitedVxWindow = windowList.find(w => 
    w.title && w.title.toLowerCase().includes('united vx')
  );
  if (unitedVxWindow) {
    console.log('Found ProTee United VX API window, minimizing...');
    await minimizeWindow(unitedVxWindow.hwnd);
    results.push({ app: 'ProTee United VX', found: true, minimized: true });
  }
  
  // Move GSPRO to its display
  const gsproWindow = await findGsproWindow();
  if (gsproWindow.success) {
    console.log(`Moving GSPRO to display ${gsproDisplay}...`);
    const moveResult = await moveWindowToDisplay(gsproWindow.hwnd, gsproDisplay, true);
    results.push({ app: 'GSPRO', found: true, moved: moveResult.success, display: gsproDisplay });
  } else {
    results.push({ app: 'GSPRO', found: false });
  }
  
  // Move Protee Labs to its display
  const proteeLabsWindow = await findProteeLabsWindow();
  if (proteeLabsWindow.success) {
    console.log(`Moving Protee Labs to display ${proteeDisplay}...`);
    const moveResult = await moveWindowToDisplay(proteeLabsWindow.hwnd, proteeDisplay, true);
    results.push({ app: 'Protee Labs', found: true, moved: moveResult.success, display: proteeDisplay });
  } else {
    results.push({ app: 'Protee Labs', found: false });
  }
  
  // Focus GSPRO last so it's on top (hides any remaining API window behind it)
  if (gsproWindow.success) {
    console.log('Focusing GSPRO window to bring it to front...');
    await focusWindow(gsproWindow.hwnd);
  }
  
  return { success: true, results };
}

// Close GSPRO, Protee Labs, and ProTee United VX
async function closeApps(appNames) {
  const results = [];
  
  console.log('=== CLOSING APPS ===');
  
  // Known process names for our apps - include many variations
  const processesToKill = [
    'GSPro.exe',
    'GSPRO.exe', 
    'GSProLauncher.exe',
    'gspro.exe',
    'Protee Labs.exe',
    'ProteeLabs.exe',
    'protee labs.exe',
    'proteelabs.exe',
    // ProTee United VX - try many name variations
    'ProTee United VX.exe',
    'ProTeeUnitedVX.exe',
    'United VX.exe',
    'UnitedVX.exe',
    'unitedvx.exe',
    'ProTee_United_VX.exe',
    'ProTeeUnited.exe',
    'proteeunited.exe',
    'protee united vx.exe'
  ];
  
  for (const processName of processesToKill) {
    try {
      await execAsync(`taskkill /IM "${processName}" /F`, { timeout: 5000 });
      console.log(`Closed: ${processName}`);
      results.push({ app: processName, status: 'closed' });
    } catch (error) {
      // Process not running - that's fine
      console.log(`${processName}: not running or already closed`);
    }
  }
  
  // Also try to close any window with "United" in the title using PowerShell
  try {
    await execAsync(`powershell -command "Get-Process | Where-Object {$_.MainWindowTitle -like '*United*'} | Stop-Process -Force"`, { timeout: 5000 });
    console.log('Closed windows with United in title');
    results.push({ app: 'United*', status: 'closed' });
  } catch (error) {
    console.log('No United windows found or already closed');
  }
  
  console.log('=== CLOSE APPS COMPLETE ===');
  return { success: true, results };
}

// IPC Handlers - TAPO
ipcMain.handle('tapo-init', async (event, { email, password }) => {
  return await initTapo(email, password);
});

ipcMain.handle('tapo-test-login', async (event, { email, password }) => {
  console.log('Testing TAPO login...');
  return await testTapoLogin(email, password);
});


ipcMain.handle('control-plug', async (event, { email, password, ip, action }) => {
  console.log(`Controlling plug at ${ip}: ${action}`);
  return await controlTapoPlug(email, password, ip, action);
});

ipcMain.handle('check-electron', async () => {
  return true;
});

// IPC Handlers - App Automation
ipcMain.handle('get-displays', async () => {
  return await getDisplayInfo();
});

ipcMain.handle('launch-app', async (event, { exePath }) => {
  return await launchApp(exePath);
});

ipcMain.handle('find-window', async (event, { titlePattern }) => {
  return await findWindowByTitle(titlePattern);
});

ipcMain.handle('move-window', async (event, { hwnd, displayIndex, fullscreen }) => {
  return await moveWindowToDisplay(hwnd, displayIndex, fullscreen);
});

ipcMain.handle('minimize-window', async (event, { hwnd }) => {
  return await minimizeWindow(hwnd);
});

ipcMain.handle('focus-window', async (event, { hwnd }) => {
  return await focusWindow(hwnd);
});

ipcMain.handle('run-app-sequence', async (event, config) => {
  return await runAppLaunchSequence(config);
});

ipcMain.handle('cancel-app-sequence', async () => {
  cancelAppLaunch();
  return { success: true };
});

ipcMain.handle('close-apps', async (event, { appNames }) => {
  return await closeApps(appNames);
});

ipcMain.handle('check-window-positions', async (event, { gsproDisplay, proteeDisplay }) => {
  return await checkAndCorrectWindowPositions(gsproDisplay, proteeDisplay);
});

// Debug: List all visible windows
ipcMain.handle('list-windows', async () => {
  const windows = await getAllVisibleWindows();
  return { 
    success: true, 
    windows: windows.map(w => ({ title: w.title, hwnd: w.hwnd })).filter(w => w.title)
  };
});

// Welcome window handlers
ipcMain.handle('show-welcome-windows', async (event, { firstName }) => {
  return await showWelcomeWindows(firstName || 'Guest');
});

ipcMain.handle('close-welcome-windows', async () => {
  return await closeWelcomeWindows();
});

// =====================================================
// NOTIFICATION POPUP
// =====================================================

let notificationWindow = null;

ipcMain.handle('show-notification-popup', async (event, { message, displayLabel, durationMs }) => {
  try {
    console.log(`Showing notification popup on display: ${displayLabel}, duration: ${durationMs}ms`);
    
    // Close existing notification if any
    if (notificationWindow && !notificationWindow.isDestroyed()) {
      notificationWindow.close();
      notificationWindow = null;
    }
    
    // Find the target display by label
    const displays = screen.getAllDisplays();
    let targetDisplay = displays[0]; // Default to primary
    
    for (const display of displays) {
      // Get display label similar to getDisplayInfo function
      const label = display.label || `Display ${displays.indexOf(display) + 1}`;
      if (label === displayLabel) {
        targetDisplay = display;
        break;
      }
    }
    
    const { x, y, width, height } = targetDisplay.bounds;
    
    // Calculate popup size and position (bottom-right of the target display)
    const popupWidth = 500;
    const popupHeight = 200;
    const margin = 40;
    const popupX = x + width - popupWidth - margin;
    const popupY = y + height - popupHeight - margin;
    
    // Create a frameless, always-on-top popup window
    notificationWindow = new BrowserWindow({
      width: popupWidth,
      height: popupHeight,
      x: popupX,
      y: popupY,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      movable: false,
      focusable: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    });
    
    // Set always on top with screen-saver level to appear above fullscreen apps like GSPro
    notificationWindow.setAlwaysOnTop(true, 'screen-saver');
    
    // Generate HTML content for the notification
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: transparent;
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100vh;
            padding: 20px;
          }
          .notification {
            background: linear-gradient(135deg, #ec622d, #d55627);
            color: white;
            padding: 30px 40px;
            border-radius: 16px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.3);
            max-width: 100%;
            text-align: center;
            animation: slideIn 0.3s ease-out;
          }
          @keyframes slideIn {
            from { transform: translateY(20px); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
          }
          .title {
            font-size: 18px;
            font-weight: 600;
            margin-bottom: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
          }
          .message {
            font-size: 22px;
            font-weight: 500;
            line-height: 1.4;
          }
          .bell-icon {
            width: 24px;
            height: 24px;
          }
        </style>
      </head>
      <body>
        <div class="notification">
          <div class="title">
            <svg class="bell-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
            </svg>
            Session Ending Soon
          </div>
          <div class="message">${message.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
        </div>
      </body>
      </html>
    `;
    
    notificationWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);
    
    // Auto-close after duration (use provided duration or default to 60 seconds)
    const duration = durationMs || 60000;
    setTimeout(() => {
      if (notificationWindow && !notificationWindow.isDestroyed()) {
        notificationWindow.close();
        notificationWindow = null;
      }
    }, duration);
    
    return { success: true };
  } catch (error) {
    console.error('Failed to show notification popup:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('close-notification-popup', async () => {
  try {
    if (notificationWindow && !notificationWindow.isDestroyed()) {
      notificationWindow.close();
      notificationWindow = null;
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// =====================================================
// SGT ICON OVERLAY WINDOW
// =====================================================

let sgtIconWindow = null;
let sgtInfoWindow = null;
let currentSgtDisplayLabel = null;
let currentSgtDisplayId = null;
let currentSgtPosition = null;
let sgtPlayerData = null; // Store player data for info window

// Read the SGT icon for use in the overlay
function getSgtIconBase64() {
  try {
    // Try to find sgt-icon.png in the app directory
    const possiblePaths = [
      path.join(__dirname, 'sgt-icon.png'),
      path.join(process.resourcesPath || '', 'sgt-icon.png'),
      path.join(app.getAppPath(), 'sgt-icon.png'),
    ];
    
    for (const iconPath of possiblePaths) {
      if (fs.existsSync(iconPath)) {
        const buffer = fs.readFileSync(iconPath);
        return `data:image/png;base64,${buffer.toString('base64')}`;
      }
    }
    console.log('SGT icon not found, using fallback');
    return null;
  } catch (err) {
    console.error('Failed to load SGT icon:', err);
    return null;
  }
}

// Helper function to find display by label - shared by all SGT windows
function findDisplayByLabel(displayLabel) {
  const displays = screen.getAllDisplays();
  let targetDisplay = displays[0]; // Default to primary
  
  console.log(`[SGT Display Lookup] Looking for: "${displayLabel}"`);
  console.log(`[SGT Display Lookup] Available displays:`);
  displays.forEach((d, i) => {
    const label = d.label || `Display ${i + 1}`;
    console.log(`  - "${label}" at ${d.bounds.x},${d.bounds.y}`);
  });
  
  for (const display of displays) {
    const label = display.label || `Display ${displays.indexOf(display) + 1}`;
    if (label === displayLabel) {
      targetDisplay = display;
      console.log(`[SGT Display Lookup] Found match: "${label}"`);
      break;
    }
  }
  
  console.log(`[SGT Display Lookup] Using display at: ${targetDisplay.bounds.x},${targetDisplay.bounds.y}`);
  return targetDisplay;
}

// Show the SGT info overlay window on the configured display
async function showSgtInfoOverlay(displayLabel) {
  try {
    // Use stored display label if none provided
    const effectiveDisplayLabel = displayLabel || currentSgtDisplayLabel;
    console.log('Showing SGT info overlay on display:', effectiveDisplayLabel);
    
    // Close existing if any
    if (sgtInfoWindow && !sgtInfoWindow.isDestroyed()) {
      sgtInfoWindow.close();
      sgtInfoWindow = null;
    }
    
    // Find the target display by label using shared helper
    const targetDisplay = findDisplayByLabel(effectiveDisplayLabel);
    
    const { x, y, width, height } = targetDisplay.bounds;
    
    // Create a centered overlay window - wider for better content display
    const overlayWidth = 500;
    const overlayHeight = 480;
    const overlayX = x + (width - overlayWidth) / 2;
    const overlayY = y + (height - overlayHeight) / 2;
    
    sgtInfoWindow = new BrowserWindow({
      width: overlayWidth,
      height: overlayHeight,
      x: overlayX,
      y: overlayY,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      movable: true,
      focusable: true,
      hasShadow: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'preload.js')
      }
    });
    
    // Set always on top with screen-saver level to appear above fullscreen apps
    sgtInfoWindow.setAlwaysOnTop(true, 'screen-saver');
    
    const iconBase64 = getSgtIconBase64();
    const playerData = sgtPlayerData || { customerName: 'Guest', sgtUsername: '', sgtGameId: '' };
    
    // Generate HTML for the SGT info overlay
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          html, body {
            background: transparent;
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
          }
          .overlay {
            background: white;
            border-radius: 16px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            padding: 24px;
            -webkit-app-region: drag;
          }
          .header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 20px;
            padding-bottom: 16px;
            border-bottom: 2px solid #f0f0f0;
          }
          .title-row {
            display: flex;
            align-items: center;
            gap: 12px;
          }
          .logo {
            width: 40px;
            height: 40px;
            border-radius: 50%;
            object-fit: cover;
          }
          .title {
            font-size: 20px;
            font-weight: 700;
            color: #1f4c25;
          }
          .close-btn {
            -webkit-app-region: no-drag;
            width: 32px;
            height: 32px;
            border-radius: 50%;
            border: none;
            background: #f0f0f0;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s;
          }
          .close-btn:hover {
            background: #dc3545;
            color: white;
          }
          .content {
            -webkit-app-region: no-drag;
          }
          .customer-name {
            font-size: 24px;
            font-weight: 600;
            color: #1f4c25;
            margin-bottom: 20px;
          }
          .field {
            background: #f8f9fa;
            border-radius: 12px;
            padding: 16px;
            margin-bottom: 12px;
          }
          .field-label {
            font-size: 12px;
            font-weight: 600;
            color: #6c757d;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 6px;
          }
          .field-value {
            font-size: 18px;
            font-weight: 500;
            color: #212529;
            font-family: monospace;
          }
          .action-btns {
            display: flex;
            gap: 8px;
            float: right;
            margin-top: -40px;
          }
          .copy-btn, .paste-btn {
            -webkit-app-region: no-drag;
            color: white;
            border: none;
            padding: 10px 18px;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s;
          }
          .copy-btn {
            background: #1f4c25;
          }
          .copy-btn:hover {
            background: #2d6a34;
          }
          .paste-btn {
            background: #ec622d;
          }
          .paste-btn:hover {
            background: #d55627;
          }
          .paste-btn.pasting {
            background: #28a745;
          }
          .copy-btn.copied, .paste-btn.pasted {
            background: #28a745;
          }
          .tip {
            margin-top: 16px;
            padding: 12px;
            background: #fff5e4;
            border-radius: 8px;
            font-size: 13px;
            color: #1f4c25;
          }
          .tip strong {
            color: #ec622d;
          }
          .instructions {
            margin-top: 12px;
            padding: 12px;
            background: #e8f4fd;
            border-radius: 8px;
            font-size: 12px;
            color: #1f4c25;
            line-height: 1.6;
          }
          .instructions ol {
            margin: 0;
            padding-left: 20px;
          }
          .instructions li {
            margin-bottom: 4px;
          }
        </style>
      </head>
      <body>
        <div class="overlay">
          <div class="header">
            <div class="title-row">
              ${iconBase64 ? `<img src="${iconBase64}" class="logo" alt="SGT" />` : ''}
              <span class="title">SGT Player Info</span>
            </div>
            <button class="close-btn" onclick="window.electronAPI.closeSgtInfoOverlay()" title="Close">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
          <div class="content">
            <div class="customer-name">${escapeHtml(playerData.customerName || 'Guest')}</div>
            
            <div class="field">
              <div class="field-label">1. SGT Username (Player Name)</div>
              <div class="field-value" id="username">${escapeHtml(playerData.sgtUsername || 'Not set')}</div>
              ${playerData.sgtUsername ? `<div class="action-btns">
                <button class="copy-btn" onclick="copyField('${escapeHtml(playerData.sgtUsername)}', this)">Copy</button>
                <button class="paste-btn" onclick="pasteField('${escapeHtml(playerData.sgtUsername)}', this)">Paste</button>
              </div>` : ''}
            </div>
            
            <div class="field">
              <div class="field-label">2. Simulator Golf Tour ID</div>
              <div class="field-value" id="gameid">${escapeHtml(playerData.sgtGameId || 'Not set')}</div>
              ${playerData.sgtGameId ? `<div class="action-btns">
                <button class="copy-btn" onclick="copyField('${escapeHtml(playerData.sgtGameId)}', this)">Copy</button>
                <button class="paste-btn" onclick="pasteField('${escapeHtml(playerData.sgtGameId)}', this)">Paste</button>
              </div>` : ''}
            </div>
            
            <div class="instructions">
              <ol>
                <li>Click the <strong>Player Name</strong> field in GSPRO then click <strong>Paste</strong></li>
                <li>Click the <strong>Simulator Golf Tour ID</strong> field then click <strong>Paste</strong></li>
              </ol>
            </div>
            
            <div class="tip">
              <strong>💡 Tip:</strong> Press F7 anytime to toggle this window
            </div>
          </div>
        </div>
        
        <script>
          function copyField(value, btn) {
            navigator.clipboard.writeText(value).then(() => {
              btn.textContent = 'Copied!';
              btn.classList.add('copied');
              setTimeout(() => {
                btn.textContent = 'Copy';
                btn.classList.remove('copied');
              }, 2000);
            });
          }
          
          async function pasteField(value, btn) {
            btn.textContent = 'Pasting...';
            btn.classList.add('pasting');
            
            try {
              // Copy to clipboard and trigger auto-paste
              await window.electronAPI.copyForPaste(value);
              
              // Brief delay to let our window lose focus
              setTimeout(async () => {
                await window.electronAPI.triggerAutoPaste();
                btn.textContent = 'Pasted!';
                btn.classList.remove('pasting');
                btn.classList.add('pasted');
                setTimeout(() => {
                  btn.textContent = 'Paste';
                  btn.classList.remove('pasted');
                }, 2000);
              }, 150);
            } catch (err) {
              console.error('Paste failed:', err);
              btn.textContent = 'Paste';
              btn.classList.remove('pasting');
            }
          }
        </script>
      </body>
      </html>
    `;
    
    sgtInfoWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);
    
    return { success: true };
  } catch (error) {
    console.error('Failed to show SGT info overlay:', error);
    return { success: false, error: error.message };
  }
}

// Helper to escape HTML
function escapeHtml(text) {
  if (!text) return '';
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Separate confirmation popup window for hiding the SGT icon
let sgtConfirmWindow = null;

// Show confirmation dialog in a separate centered popup
async function showSgtHideConfirmation(displayLabel) {
  try {
    // Close existing if any
    if (sgtConfirmWindow && !sgtConfirmWindow.isDestroyed()) {
      sgtConfirmWindow.close();
      sgtConfirmWindow = null;
    }
    
    // Use stored display label if none provided, use shared helper
    const effectiveDisplayLabel = displayLabel || currentSgtDisplayLabel;
    console.log('Showing SGT hide confirmation on display:', effectiveDisplayLabel);
    const targetDisplay = findDisplayByLabel(effectiveDisplayLabel);
    
    const { x, y, width, height } = targetDisplay.bounds;
    
    // Center the dialog on the display - taller to fit all content
    const dialogWidth = 400;
    const dialogHeight = 340;
    const dialogX = x + (width - dialogWidth) / 2;
    const dialogY = y + (height - dialogHeight) / 2;
    
    sgtConfirmWindow = new BrowserWindow({
      width: dialogWidth,
      height: dialogHeight,
      x: dialogX,
      y: dialogY,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      movable: false,
      focusable: true,
      hasShadow: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'preload.js')
      }
    });
    
    // Set always on top with screen-saver level to appear above fullscreen apps
    sgtConfirmWindow.setAlwaysOnTop(true, 'screen-saver');
    
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          html, body {
            background: transparent;
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
            width: 100%;
            height: 100%;
          }
          .dialog {
            background: white;
            border-radius: 16px;
            padding: 28px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.4);
            text-align: center;
          }
          .title {
            font-size: 20px;
            font-weight: 600;
            color: #1f4c25;
            margin-bottom: 16px;
          }
          .text {
            font-size: 15px;
            color: #6c757d;
            margin-bottom: 16px;
            line-height: 1.6;
          }
          .tip {
            font-size: 14px;
            color: #ec622d;
            margin-bottom: 24px;
            padding: 14px;
            background: #fff5e4;
            border-radius: 10px;
            line-height: 1.5;
          }
          .buttons {
            display: flex;
            gap: 14px;
          }
          .btn {
            flex: 1;
            padding: 14px 20px;
            border-radius: 10px;
            border: none;
            cursor: pointer;
            font-size: 15px;
            font-weight: 500;
            transition: all 0.2s;
          }
          .btn.cancel {
            background: #f0f0f0;
            color: #333;
          }
          .btn.cancel:hover {
            background: #e0e0e0;
          }
          .btn.confirm {
            background: #ec622d;
            color: white;
          }
          .btn.confirm:hover {
            background: #d55627;
          }
        </style>
      </head>
      <body>
        <div class="dialog">
          <div class="title">Hide SGT Icon?</div>
          <div class="text">The SGT icon will be hidden until a new booking with an SGT-linked account starts.</div>
          <div class="tip">💡 <strong>Tip:</strong> If you want to play your SGT tour round, press <strong>F7</strong> to open the SGT info window anytime.</div>
          <div class="buttons">
            <button class="btn cancel" onclick="window.electronAPI.cancelSgtHideConfirm()">Keep Showing</button>
            <button class="btn confirm" onclick="window.electronAPI.sgtIconHideConfirmed()">Hide Icon</button>
          </div>
        </div>
      </body>
      </html>
    `;
    
    sgtConfirmWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);
    
    return { success: true };
  } catch (error) {
    console.error('Failed to show SGT hide confirmation:', error);
    return { success: false, error: error.message };
  }
}

ipcMain.handle('show-sgt-icon-overlay', async (event, { displayLabel, position, playerData }) => {
  try {
    console.log(`Showing SGT icon overlay on display: ${displayLabel}, position: ${position}`);
    
    // Store display info for later use
    currentSgtDisplayLabel = displayLabel;
    currentSgtPosition = position;
    if (playerData) {
      sgtPlayerData = playerData;
    }
    
    // Close existing if any
    if (sgtIconWindow && !sgtIconWindow.isDestroyed()) {
      sgtIconWindow.close();
      sgtIconWindow = null;
    }
    
    // Use shared helper to find display
    console.log('Showing SGT icon overlay on display:', displayLabel);
    const targetDisplay = findDisplayByLabel(displayLabel);
    
    const { x, y, width, height } = targetDisplay.bounds;
    
    // Calculate position based on corner preference
    const iconSize = 90;
    const margin = 20;
    let iconX, iconY;
    
    switch (position) {
      case 'top-left':
        iconX = x + margin;
        iconY = y + margin;
        break;
      case 'top-right':
        iconX = x + width - iconSize - margin;
        iconY = y + margin;
        break;
      case 'bottom-left':
        iconX = x + margin;
        iconY = y + height - iconSize - margin;
        break;
      case 'bottom-right':
      default:
        iconX = x + width - iconSize - margin;
        iconY = y + height - iconSize - margin;
        break;
    }
    
    // Create frameless, always-on-top overlay (screen-saver level to appear above fullscreen apps)
    sgtIconWindow = new BrowserWindow({
      width: iconSize,
      height: iconSize,
      x: iconX,
      y: iconY,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      movable: false,
      focusable: true,
      hasShadow: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'preload.js')
      }
    });
    
    // Set always on top with screen-saver level to appear above fullscreen apps
    sgtIconWindow.setAlwaysOnTop(true, 'screen-saver');
    
    const iconBase64 = getSgtIconBase64();
    
    // Generate HTML for the SGT icon button with close button - NO INLINE DIALOG
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          html, body {
            background: transparent;
            width: 100%;
            height: 100%;
            overflow: hidden;
          }
          .container {
            position: relative;
            width: 100%;
            height: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .sgt-button {
            width: 56px;
            height: 56px;
            border-radius: 50%;
            border: 3px solid rgba(236, 98, 45, 0.6);
            background: white;
            cursor: pointer;
            overflow: hidden;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
            transition: all 0.2s ease;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .sgt-button:hover {
            transform: scale(1.1);
            border-color: #ec622d;
            box-shadow: 0 6px 25px rgba(236, 98, 45, 0.4);
          }
          .sgt-button img {
            width: 100%;
            height: 100%;
            object-fit: cover;
          }
          .sgt-button .fallback {
            font-size: 20px;
            font-weight: bold;
            color: #ec622d;
          }
          .close-btn {
            position: absolute;
            top: 2px;
            right: 2px;
            width: 22px;
            height: 22px;
            border-radius: 50%;
            border: none;
            background: #dc3545;
            color: white;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            opacity: 0;
            transition: opacity 0.2s;
            font-size: 14px;
            font-weight: bold;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
          }
          .container:hover .close-btn {
            opacity: 1;
          }
          .close-btn:hover {
            transform: scale(1.1);
            background: #c82333;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <button class="sgt-button" onclick="window.electronAPI.sgtIconClicked()" title="View SGT Player Info">
            ${iconBase64 
              ? `<img src="${iconBase64}" alt="SGT" />`
              : '<span class="fallback">SGT</span>'
            }
          </button>
          <button class="close-btn" onclick="window.electronAPI.showSgtHideConfirm()" title="Hide SGT icon">×</button>
        </div>
      </body>
      </html>
    `;
    
    sgtIconWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);
    
    // Allow window to receive mouse events
    sgtIconWindow.setIgnoreMouseEvents(false);
    
    return { success: true };
  } catch (error) {
    console.error('Failed to show SGT icon overlay:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('close-sgt-icon-overlay', async () => {
  try {
    if (sgtIconWindow && !sgtIconWindow.isDestroyed()) {
      sgtIconWindow.close();
      sgtIconWindow = null;
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('close-sgt-info-overlay', async () => {
  try {
    if (sgtInfoWindow && !sgtInfoWindow.isDestroyed()) {
      sgtInfoWindow.close();
      sgtInfoWindow = null;
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('show-sgt-info-overlay', async (event, { displayLabel, playerData }) => {
  if (playerData) {
    sgtPlayerData = playerData;
  }
  return await showSgtInfoOverlay(displayLabel || currentSgtDisplayLabel);
});

ipcMain.handle('toggle-sgt-info-overlay', async () => {
  if (sgtInfoWindow && !sgtInfoWindow.isDestroyed()) {
    sgtInfoWindow.close();
    sgtInfoWindow = null;
    return { success: true, visible: false };
  } else {
    await showSgtInfoOverlay(currentSgtDisplayLabel);
    return { success: true, visible: true };
  }
});

ipcMain.handle('update-sgt-icon-position', async (event, { displayLabel, position }) => {
  // Close and reopen with new position
  if (sgtIconWindow && !sgtIconWindow.isDestroyed()) {
    sgtIconWindow.close();
    sgtIconWindow = null;
  }
  // Will be re-shown by the renderer if needed
  return { success: true };
});

// Handle showing the SGT hide confirmation dialog
ipcMain.on('show-sgt-hide-confirm', async () => {
  console.log('Showing SGT hide confirmation dialog');
  await showSgtHideConfirmation(currentSgtDisplayLabel);
});

// Handle cancelling the SGT hide confirmation dialog
ipcMain.on('cancel-sgt-hide-confirm', () => {
  console.log('SGT hide confirmation cancelled');
  if (sgtConfirmWindow && !sgtConfirmWindow.isDestroyed()) {
    sgtConfirmWindow.close();
    sgtConfirmWindow = null;
  }
});

// Handle SGT icon click from the overlay window - show info overlay
ipcMain.on('sgt-icon-clicked', async () => {
  console.log('SGT icon clicked in overlay window - showing info overlay');
  await showSgtInfoOverlay(currentSgtDisplayLabel);
  // Also notify main window
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('sgt-icon-clicked');
  }
});

// Handle SGT icon hide confirmation from the overlay window
ipcMain.on('sgt-icon-hide-confirmed', () => {
  console.log('SGT icon hide confirmed - closing overlays and notifying main');
  // Close the confirmation dialog
  if (sgtConfirmWindow && !sgtConfirmWindow.isDestroyed()) {
    sgtConfirmWindow.close();
    sgtConfirmWindow = null;
  }
  // Close the icon overlay
  if (sgtIconWindow && !sgtIconWindow.isDestroyed()) {
    sgtIconWindow.close();
    sgtIconWindow = null;
  }
  // Close the info overlay
  if (sgtInfoWindow && !sgtInfoWindow.isDestroyed()) {
    sgtInfoWindow.close();
    sgtInfoWindow = null;
  }
  // Notify main window that icon was hidden
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('sgt-icon-hidden');
  }
});

// =====================================================
// CLIPBOARD AND AUTO-PASTE
// =====================================================

// Copy text to clipboard and arm auto-paste
// When armed, the next simulated key sequence will do Ctrl+A, Delete, Ctrl+V
ipcMain.handle('copy-for-paste', async (event, { text }) => {
  try {
    clipboard.writeText(text);
    autoPasteEnabled = true;
    autoPasteText = text;
    console.log('Clipboard armed for auto-paste:', text);
    return { success: true };
  } catch (error) {
    console.error('Copy for paste failed:', error);
    return { success: false, error: error.message };
  }
});

// Trigger the auto-paste sequence: Ctrl+A, Delete, then Ctrl+V
// First hides the SGT info overlay and focuses GSPRO to ensure keystrokes go there
ipcMain.handle('trigger-auto-paste', async () => {
  try {
    if (!autoPasteEnabled || !autoPasteText) {
      return { success: false, error: 'Auto-paste not armed' };
    }
    
    console.log('Triggering auto-paste sequence...');
    
    // Hide the SGT info window temporarily (don't close, just blur/hide)
    if (sgtInfoWindow && !sgtInfoWindow.isDestroyed()) {
      sgtInfoWindow.blur();
      // Temporarily set not always on top so focus can shift
      sgtInfoWindow.setAlwaysOnTop(false);
    }
    
    // Find and focus GSPRO window first
    const gsproWindow = await findGsproWindow();
    if (gsproWindow.success) {
      console.log('Focusing GSPRO window before paste...');
      await focusWindow(gsproWindow.hwnd);
      // Wait for focus to settle
      await new Promise(resolve => setTimeout(resolve, 200));
    } else {
      console.log('GSPRO window not found, proceeding with paste anyway...');
    }
    
    // Create a PowerShell script that sends Ctrl+A, then Delete, then Ctrl+V
    const tempScript = path.join(app.getPath('temp'), 'auto_paste.ps1');
    const scriptContent = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class KeyboardSender {
    [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, IntPtr dwExtraInfo);
    public const int KEYEVENTF_KEYUP = 0x02;
    public const byte VK_CONTROL = 0x11;
    public const byte VK_A = 0x41;
    public const byte VK_V = 0x56;
    public const byte VK_DELETE = 0x2E;
    
    public static void SendCtrlA() {
        keybd_event(VK_CONTROL, 0, 0, IntPtr.Zero);
        keybd_event(VK_A, 0, 0, IntPtr.Zero);
        keybd_event(VK_A, 0, KEYEVENTF_KEYUP, IntPtr.Zero);
        keybd_event(VK_CONTROL, 0, KEYEVENTF_KEYUP, IntPtr.Zero);
    }
    
    public static void SendDelete() {
        keybd_event(VK_DELETE, 0, 0, IntPtr.Zero);
        keybd_event(VK_DELETE, 0, KEYEVENTF_KEYUP, IntPtr.Zero);
    }
    
    public static void SendCtrlV() {
        keybd_event(VK_CONTROL, 0, 0, IntPtr.Zero);
        keybd_event(VK_V, 0, 0, IntPtr.Zero);
        keybd_event(VK_V, 0, KEYEVENTF_KEYUP, IntPtr.Zero);
        keybd_event(VK_CONTROL, 0, KEYEVENTF_KEYUP, IntPtr.Zero);
    }
}
"@
[KeyboardSender]::SendCtrlA()
Start-Sleep -Milliseconds 50
[KeyboardSender]::SendDelete()
Start-Sleep -Milliseconds 50
[KeyboardSender]::SendCtrlV()
Write-Output "done"
`;
    
    fs.writeFileSync(tempScript, scriptContent);
    await execAsync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${tempScript}"`, { timeout: 5000 });
    fs.unlinkSync(tempScript);
    
    // Restore SGT info window to always on top
    if (sgtInfoWindow && !sgtInfoWindow.isDestroyed()) {
      sgtInfoWindow.setAlwaysOnTop(true);
    }
    
    // Disarm auto-paste after use
    autoPasteEnabled = false;
    autoPasteText = '';
    
    console.log('Auto-paste sequence completed');
    return { success: true };
  } catch (error) {
    console.error('Auto-paste failed:', error);
    // Restore always on top even on error
    if (sgtInfoWindow && !sgtInfoWindow.isDestroyed()) {
      sgtInfoWindow.setAlwaysOnTop(true);
    }
    try { fs.unlinkSync(path.join(app.getPath('temp'), 'auto_paste.ps1')); } catch {}
    return { success: false, error: error.message };
  }
});

// Get current auto-paste status
ipcMain.handle('get-auto-paste-status', async () => {
  return { enabled: autoPasteEnabled, text: autoPasteText };
});

// Clear/disarm auto-paste
ipcMain.handle('clear-auto-paste', async () => {
  autoPasteEnabled = false;
  autoPasteText = '';
  clipboard.clear();
  return { success: true };
});

// =====================================================
// GSPRO BASELINE SETTINGS MANAGEMENT
// =====================================================

// State for baseline settings
let baselineConfig = {
  gsproFolderPath: '', // C:\Users\<user>\AppData\Local\GSPro
  dpsFilePath: '',     // Full path to dpsV2x3.gss in GSPro folder
  settingsFilePath: '', // Full path to Settings.vgs in GSPro folder
  enabled: false,
};

// State for process monitoring
let gsproWatchInterval = null;
let gsproWasRunning = false;

// Get the app data folder for storing baseline files
function getBaselineStoragePath() {
  const userDataPath = app.getPath('userData');
  const baselinePath = path.join(userDataPath, 'gspro-baseline');
  
  // Create folder if it doesn't exist
  if (!fs.existsSync(baselinePath)) {
    fs.mkdirSync(baselinePath, { recursive: true });
  }
  
  return baselinePath;
}

// Load baseline config from storage
function loadBaselineConfig() {
  try {
    const configPath = path.join(getBaselineStoragePath(), 'config.json');
    if (fs.existsSync(configPath)) {
      const data = fs.readFileSync(configPath, 'utf-8');
      baselineConfig = { ...baselineConfig, ...JSON.parse(data) };
      console.log('Loaded baseline config:', baselineConfig);
    }
  } catch (error) {
    console.error('Failed to load baseline config:', error);
  }
}

// Save baseline config to storage
function saveBaselineConfig() {
  try {
    const configPath = path.join(getBaselineStoragePath(), 'config.json');
    fs.writeFileSync(configPath, JSON.stringify(baselineConfig, null, 2));
    console.log('Saved baseline config');
  } catch (error) {
    console.error('Failed to save baseline config:', error);
  }
}

// Check if GSPro is running
async function isGsproRunning() {
  try {
    const { stdout } = await execAsync('tasklist /FI "IMAGENAME eq GSPro.exe" /NH', { timeout: 5000 });
    return stdout.toLowerCase().includes('gspro.exe');
  } catch {
    return false;
  }
}

// Restore baseline files to GSPro folder
async function restoreBaselineFiles() {
  const results = [];
  const storagePath = getBaselineStoragePath();
  
  console.log('=== RESTORING BASELINE FILES ===');
  
  // Restore dpsV2x3.gss
  const storedDpsPath = path.join(storagePath, 'dpsV2x3.gss');
  if (baselineConfig.dpsFilePath && fs.existsSync(storedDpsPath)) {
    try {
      fs.copyFileSync(storedDpsPath, baselineConfig.dpsFilePath);
      console.log('Restored dpsV2x3.gss to:', baselineConfig.dpsFilePath);
      results.push({ file: 'dpsV2x3.gss', success: true });
    } catch (error) {
      console.error('Failed to restore dpsV2x3.gss:', error);
      results.push({ file: 'dpsV2x3.gss', success: false, error: error.message });
    }
  } else {
    console.log('Skipping dpsV2x3.gss - not configured or baseline not found');
    results.push({ file: 'dpsV2x3.gss', success: false, error: 'Not configured' });
  }
  
  // Restore Settings.vgs
  const storedSettingsPath = path.join(storagePath, 'Settings.vgs');
  if (baselineConfig.settingsFilePath && fs.existsSync(storedSettingsPath)) {
    try {
      fs.copyFileSync(storedSettingsPath, baselineConfig.settingsFilePath);
      console.log('Restored Settings.vgs to:', baselineConfig.settingsFilePath);
      results.push({ file: 'Settings.vgs', success: true });
    } catch (error) {
      console.error('Failed to restore Settings.vgs:', error);
      results.push({ file: 'Settings.vgs', success: false, error: error.message });
    }
  } else {
    console.log('Skipping Settings.vgs - not configured or baseline not found');
    results.push({ file: 'Settings.vgs', success: false, error: 'Not configured' });
  }
  
  console.log('=== BASELINE RESTORE COMPLETE ===', results);
  return results;
}

// Start watching for GSPro process
function startGsproWatcher() {
  if (gsproWatchInterval) {
    console.log('GSPro watcher already running');
    return;
  }
  
  console.log('Starting GSPro process watcher...');
  
  gsproWatchInterval = setInterval(async () => {
    const isRunning = await isGsproRunning();
    
    // Detect when GSPro stops running
    if (gsproWasRunning && !isRunning) {
      console.log('GSPro process closed - triggering baseline restore');
      
      // Notify renderer that GSPro closed
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('gspro-closed');
      }
      
      // Wait a moment for files to be released
      setTimeout(async () => {
        const results = await restoreBaselineFiles();
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('baseline-restored', results);
        }
      }, 2000);
    }
    
    gsproWasRunning = isRunning;
  }, 3000); // Check every 3 seconds
}

// Stop watching for GSPro process
function stopGsproWatcher() {
  if (gsproWatchInterval) {
    clearInterval(gsproWatchInterval);
    gsproWatchInterval = null;
    gsproWasRunning = false;
    console.log('GSPro watcher stopped');
  }
}

// Load config on startup
loadBaselineConfig();

// IPC: Get baseline config
ipcMain.handle('get-baseline-config', async () => {
  const storagePath = getBaselineStoragePath();
  const hasDpsFile = fs.existsSync(path.join(storagePath, 'dpsV2x3.gss'));
  const hasSettingsFile = fs.existsSync(path.join(storagePath, 'Settings.vgs'));
  
  return {
    ...baselineConfig,
    hasDpsFile,
    hasSettingsFile,
    isWatching: !!gsproWatchInterval,
  };
});

// IPC: Set GSPro folder path
ipcMain.handle('set-gspro-folder', async (event, { folderPath }) => {
  try {
    // Validate the folder exists
    if (!fs.existsSync(folderPath)) {
      return { success: false, error: 'Folder does not exist' };
    }
    
    // Set the paths
    baselineConfig.gsproFolderPath = folderPath;
    baselineConfig.dpsFilePath = path.join(folderPath, 'dpsV2x3.gss');
    baselineConfig.settingsFilePath = path.join(folderPath, 'Settings.vgs');
    
    saveBaselineConfig();
    
    return { 
      success: true, 
      dpsFilePath: baselineConfig.dpsFilePath,
      settingsFilePath: baselineConfig.settingsFilePath,
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// IPC: Browse for GSPro folder
ipcMain.handle('browse-gspro-folder', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select GSPro Data Folder',
      defaultPath: path.join(process.env.LOCALAPPDATA || '', 'GSPro'),
      properties: ['openDirectory'],
    });
    
    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, canceled: true };
    }
    
    const folderPath = result.filePaths[0];
    
    // Set and save the config
    baselineConfig.gsproFolderPath = folderPath;
    baselineConfig.dpsFilePath = path.join(folderPath, 'dpsV2x3.gss');
    baselineConfig.settingsFilePath = path.join(folderPath, 'Settings.vgs');
    
    saveBaselineConfig();
    
    return { 
      success: true, 
      folderPath,
      dpsFilePath: baselineConfig.dpsFilePath,
      settingsFilePath: baselineConfig.settingsFilePath,
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// IPC: Upload baseline file (receive file content from renderer)
ipcMain.handle('save-baseline-file', async (event, { fileName, filePath }) => {
  try {
    const storagePath = getBaselineStoragePath();
    const destPath = path.join(storagePath, fileName);
    
    // Copy the file to our storage
    fs.copyFileSync(filePath, destPath);
    
    console.log(`Saved baseline file: ${fileName} from ${filePath}`);
    
    return { success: true, storedPath: destPath };
  } catch (error) {
    console.error('Failed to save baseline file:', error);
    return { success: false, error: error.message };
  }
});

// IPC: Browse and upload a baseline file
ipcMain.handle('browse-baseline-file', async (event, { fileName }) => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: `Select ${fileName} baseline file`,
      filters: [
        { name: 'GSPro Settings', extensions: ['gss', 'vgs'] },
        { name: 'All Files', extensions: ['*'] }
      ],
      properties: ['openFile'],
    });
    
    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, canceled: true };
    }
    
    const sourcePath = result.filePaths[0];
    const storagePath = getBaselineStoragePath();
    const destPath = path.join(storagePath, fileName);
    
    // Copy the file to our storage
    fs.copyFileSync(sourcePath, destPath);
    
    console.log(`Saved baseline file: ${fileName} from ${sourcePath}`);
    
    return { success: true, sourcePath, storedPath: destPath };
  } catch (error) {
    console.error('Failed to browse/save baseline file:', error);
    return { success: false, error: error.message };
  }
});

// IPC: Enable/disable baseline restore
ipcMain.handle('set-baseline-enabled', async (event, { enabled }) => {
  baselineConfig.enabled = enabled;
  saveBaselineConfig();
  
  if (enabled) {
    startGsproWatcher();
  } else {
    stopGsproWatcher();
  }
  
  return { success: true, enabled };
});

// IPC: Manually restore baseline files
ipcMain.handle('restore-baseline-now', async () => {
  try {
    const results = await restoreBaselineFiles();
    return { success: true, results };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// IPC: Check if GSPro is currently running
ipcMain.handle('is-gspro-running', async () => {
  const isRunning = await isGsproRunning();
  return { isRunning };
});

// Start watcher if enabled on startup
if (baselineConfig.enabled) {
  startGsproWatcher();
}