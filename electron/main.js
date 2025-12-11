const { app, BrowserWindow, Tray, Menu, ipcMain, screen, dialog } = require('electron');
const path = require('path');
const { exec, spawn } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

let mainWindow;
let tray;
let tapoClient = null;
let isAppAuthenticated = false; // Track if user has entered correct password

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
  return displays.map((display, index) => ({
    id: display.id,
    index,
    label: display.label || `Display ${index + 1}`,
    bounds: display.bounds,
    workArea: display.workArea,
    isPrimary: display.id === screen.getPrimaryDisplay().id,
    size: display.size,
    scaleFactor: display.scaleFactor
  }));
}

// Launch an application using cmd start for reliable path handling with spaces
async function launchApp(exePath) {
  return new Promise((resolve) => {
    try {
      console.log(`Launching: ${exePath}`);
      // Use cmd /c start "" "path" for reliable handling of paths with spaces
      const command = `cmd /c start "" "${exePath}"`;
      console.log(`Executing: ${command}`);
      exec(command, (error, stdout, stderr) => {
        if (error) {
          console.error(`Launch error: ${error.message}`);
          resolve({ success: false, error: error.message });
        } else {
          console.log(`Launch successful for: ${exePath}`);
          resolve({ success: true });
        }
      });
    } catch (error) {
      console.error(`Failed to launch ${exePath}:`, error.message);
      resolve({ success: false, error: error.message });
    }
  });
}

// Find window by title using PowerShell
async function findWindowByTitle(titlePattern) {
  const psScript = `
    Add-Type @"
    using System;
    using System.Runtime.InteropServices;
    using System.Text;
    public class WindowHelper {
        [DllImport("user32.dll")]
        public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
        public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
        
        [DllImport("user32.dll", CharSet = CharSet.Auto)]
        public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
        
        [DllImport("user32.dll")]
        public static extern bool IsWindowVisible(IntPtr hWnd);
    }
"@

    $windows = @()
    $callback = {
        param([IntPtr]$hwnd, [IntPtr]$lparam)
        $title = New-Object System.Text.StringBuilder 256
        [WindowHelper]::GetWindowText($hwnd, $title, 256) | Out-Null
        $titleStr = $title.ToString()
        if ($titleStr -and [WindowHelper]::IsWindowVisible($hwnd)) {
            $script:windows += @{hwnd = $hwnd.ToInt64(); title = $titleStr}
        }
        return $true
    }
    [WindowHelper]::EnumWindows($callback, [IntPtr]::Zero) | Out-Null
    $windows | ConvertTo-Json -Compress
  `;
  
  try {
    const { stdout } = await execAsync(`powershell -Command "${psScript.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`, { maxBuffer: 1024 * 1024 });
    const windows = JSON.parse(stdout || '[]');
    const found = Array.isArray(windows) 
      ? windows.find(w => w.title && w.title.toLowerCase().includes(titlePattern.toLowerCase()))
      : (windows.title && windows.title.toLowerCase().includes(titlePattern.toLowerCase()) ? windows : null);
    return found ? { success: true, hwnd: found.hwnd, title: found.title } : { success: false };
  } catch (error) {
    console.error('Find window failed:', error.message);
    return { success: false, error: error.message };
  }
}

// Move window to specific display and position
async function moveWindowToDisplay(hwnd, displayIndex, fullscreen = false) {
  const displays = screen.getAllDisplays();
  if (displayIndex >= displays.length) {
    return { success: false, error: `Display ${displayIndex} not found` };
  }
  
  const display = displays[displayIndex];
  const { x, y, width, height } = display.bounds;
  
  const psScript = `
    Add-Type @"
    using System;
    using System.Runtime.InteropServices;
    public class WindowMover {
        [DllImport("user32.dll")]
        public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);
        
        [DllImport("user32.dll")]
        public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
        
        [DllImport("user32.dll")]
        public static extern bool SetForegroundWindow(IntPtr hWnd);
        
        public const int SW_MAXIMIZE = 3;
        public const int SW_RESTORE = 9;
    }
"@
    
    $hwnd = [IntPtr]${hwnd}
    [WindowMover]::ShowWindow($hwnd, [WindowMover]::SW_RESTORE) | Out-Null
    Start-Sleep -Milliseconds 100
    [WindowMover]::SetWindowPos($hwnd, [IntPtr]::Zero, ${x}, ${y}, ${width}, ${height}, 0x0040) | Out-Null
    ${fullscreen ? '[WindowMover]::ShowWindow($hwnd, [WindowMover]::SW_MAXIMIZE) | Out-Null' : ''}
    [WindowMover]::SetForegroundWindow($hwnd) | Out-Null
    Write-Output "success"
  `;
  
  try {
    await execAsync(`powershell -Command "${psScript.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`, { timeout: 5000 });
    return { success: true };
  } catch (error) {
    console.error('Move window failed:', error.message);
    return { success: false, error: error.message };
  }
}

// Minimize a window
async function minimizeWindow(hwnd) {
  const psScript = `
    Add-Type @"
    using System;
    using System.Runtime.InteropServices;
    public class WindowMin {
        [DllImport("user32.dll")]
        public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
        public const int SW_MINIMIZE = 6;
    }
"@
    [WindowMin]::ShowWindow([IntPtr]${hwnd}, [WindowMin]::SW_MINIMIZE) | Out-Null
    Write-Output "success"
  `;
  
  try {
    await execAsync(`powershell -Command "${psScript.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`, { timeout: 5000 });
    return { success: true };
  } catch (error) {
    console.error('Minimize window failed:', error.message);
    return { success: false, error: error.message };
  }
}

// Focus a window
async function focusWindow(hwnd) {
  const psScript = `
    Add-Type @"
    using System;
    using System.Runtime.InteropServices;
    public class WindowFocus {
        [DllImport("user32.dll")]
        public static extern bool SetForegroundWindow(IntPtr hWnd);
        [DllImport("user32.dll")]
        public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
        public const int SW_RESTORE = 9;
    }
"@
    $hwnd = [IntPtr]${hwnd}
    [WindowFocus]::ShowWindow($hwnd, [WindowFocus]::SW_RESTORE) | Out-Null
    [WindowFocus]::SetForegroundWindow($hwnd) | Out-Null
    Write-Output "success"
  `;
  
  try {
    await execAsync(`powershell -Command "${psScript.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`, { timeout: 5000 });
    return { success: true };
  } catch (error) {
    console.error('Focus window failed:', error.message);
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

// Background watcher for ProTee United VX - runs independently
// Searches for multiple title variations to handle case differences
async function watchForProteeConnector(durationMs = 120000) {
  const startTime = Date.now();
  const searchTerms = ['ProTee United VX', 'Protee United VX', 'protee united vx', 'United VX'];
  console.log('Starting background watcher for ProTee United VX (2 minute window)...');
  console.log('Will search for any of:', searchTerms);
  
  while (Date.now() - startTime < durationMs) {
    if (appLaunchCancelled) {
      console.log('ProTee United VX watcher cancelled');
      return { success: false, cancelled: true };
    }
    
    // Try each search term
    for (const term of searchTerms) {
      const result = await findWindowByTitle(term);
      if (result.success) {
        console.log(`ProTee United VX window found (matched: "${term}"), title: "${result.title}", minimizing...`);
        await minimizeWindow(result.hwnd);
        console.log('ProTee United VX minimized successfully');
        return { success: true, hwnd: result.hwnd };
      }
    }
    
    // Log visible windows periodically for debugging
    const elapsed = Date.now() - startTime;
    if (elapsed % 10000 < 2000) { // Every ~10 seconds
      console.log(`ProTee United VX watcher: ${Math.round(elapsed/1000)}s elapsed, still searching...`);
    }
    
    // Poll every 2 seconds
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  console.log('ProTee United VX watcher timed out after 2 minutes');
  return { success: false, error: 'Timeout - window not found' };
}

// Run the full app launch sequence
// Order: 1) GSPRO, 2) Start background watcher for Protee United VX, 3) Wait 10s then launch Protee Labs, 4) Refocus GSPRO
async function runAppLaunchSequence(config) {
  const {
    gsproPath,
    proteeLabsPath,
    gsproDisplay, // Display index for GSPRO (Screen 2/3)
    proteeDisplay, // Display index for Protee (Screen 1 touchscreen)
    postLaunchDelay = 5000
  } = config;
  
  console.log('=== APP LAUNCH SEQUENCE STARTED ===');
  console.log('Full config received:', JSON.stringify(config, null, 2));
  console.log('GSPRO Path:', gsproPath);
  console.log('Protee Labs Path:', proteeLabsPath);
  console.log('GSPRO Display:', gsproDisplay);
  console.log('Protee Display:', proteeDisplay);
  
  const results = [];
  appLaunchCancelled = false; // Reset cancellation flag
  
  try {
    // Step 1: Launch GSPRO
    console.log('Step 1: Launching GSPRO from path:', gsproPath);
    results.push({ step: 'launch_gspro', status: 'starting' });
    
    if (appLaunchCancelled) return { success: false, cancelled: true, results };
    
    const gsproLaunch = await launchApp(gsproPath);
    console.log('GSPRO launch result:', gsproLaunch);
    results.push({ step: 'launch_gspro', status: 'done', result: gsproLaunch });
    
    // Wait for GSPRO window to appear
    console.log('Waiting for GSPRO window...');
    const gsproWindow = await waitForWindow('GSPro', 60000);
    
    if (appLaunchCancelled) return { success: false, cancelled: true, results };
    
    let gsproHwnd = null;
    if (gsproWindow.success) {
      console.log('GSPRO window found, moving to display', gsproDisplay);
      await moveWindowToDisplay(gsproWindow.hwnd, gsproDisplay, true);
      gsproHwnd = gsproWindow.hwnd;
      results.push({ step: 'move_gspro', status: 'done', hwnd: gsproWindow.hwnd });
    } else {
      console.log('GSPRO window NOT found after 60 seconds');
      results.push({ step: 'move_gspro', status: 'warning', message: 'GSPRO window not found' });
    }
    
    // Step 2: Start background watcher for Protee United VX (runs independently for 2 minutes)
    console.log('Step 2: Starting background watcher for Protee United VX...');
    results.push({ step: 'start_connector_watcher', status: 'starting' });
    
    // Start watcher in background (don't await - runs independently)
    const connectorWatcherPromise = watchForProteeConnector(120000).then(watchResult => {
      if (watchResult.success) {
        results.push({ step: 'minimize_connector', status: 'done', hwnd: watchResult.hwnd });
      } else if (!watchResult.cancelled) {
        results.push({ step: 'minimize_connector', status: 'warning', message: 'Protee United VX window not found within 2 minutes' });
      }
    });
    
    results.push({ step: 'start_connector_watcher', status: 'done', message: 'Watcher running in background' });
    
    // Step 3: Wait 10 seconds then launch Protee Labs
    console.log('Step 3: Waiting 10 seconds before launching Protee Labs...');
    console.log('>>> Protee Labs path that will be used:', proteeLabsPath);
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    if (appLaunchCancelled) {
      console.log('Launch cancelled during wait');
      return { success: false, cancelled: true, results };
    }
    
    console.log('>>> NOW LAUNCHING PROTEE LABS from path:', proteeLabsPath);
    results.push({ step: 'launch_protee', status: 'starting' });
    
    const proteeLaunch = await launchApp(proteeLabsPath);
    console.log('>>> Protee Labs launch result:', proteeLaunch);
    results.push({ step: 'launch_protee', status: 'done', result: proteeLaunch });
    
    // Wait for Protee Labs window
    console.log('Waiting for Protee Labs window...');
    const proteeWindow = await waitForWindow('Protee Labs', 30000);
    
    if (appLaunchCancelled) return { success: false, cancelled: true, results };
    
    if (proteeWindow.success) {
      console.log('Protee Labs window found, moving to display', proteeDisplay);
      await moveWindowToDisplay(proteeWindow.hwnd, proteeDisplay, true);
      results.push({ step: 'move_protee', status: 'done', hwnd: proteeWindow.hwnd });
    } else {
      results.push({ step: 'move_protee', status: 'warning', message: 'Protee Labs window not found' });
    }
    
    // Step 4: Wait a bit then refocus GSPRO
    console.log('Step 4: Refocusing GSPRO...');
    await new Promise(resolve => setTimeout(resolve, postLaunchDelay));
    
    if (appLaunchCancelled) return { success: false, cancelled: true, results };
    
    if (gsproHwnd) {
      await focusWindow(gsproHwnd);
      results.push({ step: 'focus_gspro', status: 'done' });
    } else {
      // Try to find GSPRO again
      const gsproRefind = await findWindowByTitle('GSPro');
      if (gsproRefind.success) {
        await focusWindow(gsproRefind.hwnd);
        results.push({ step: 'focus_gspro', status: 'done' });
      } else {
        results.push({ step: 'focus_gspro', status: 'warning', message: 'Could not refocus GSPRO' });
      }
    }
    
    // Don't wait for connector watcher - it runs independently
    // The watcher will minimize the window whenever it appears
    
    return { success: true, results };
  } catch (error) {
    console.error('App launch sequence failed:', error.message);
    return { success: false, error: error.message, results };
  }
}

// Close apps gracefully
async function closeApps(appNames) {
  const results = [];
  
  for (const appName of appNames) {
    try {
      await execAsync(`taskkill /IM "${appName}" /F`, { timeout: 5000 });
      results.push({ app: appName, status: 'closed' });
    } catch (error) {
      results.push({ app: appName, status: 'not_running_or_error' });
    }
  }
  
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