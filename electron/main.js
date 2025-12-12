const { app, BrowserWindow, Tray, Menu, ipcMain, screen, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
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

// Launch an application using cmd start for reliable path handling with spaces
async function launchApp(exePath) {
  return new Promise((resolve) => {
    console.log(`=== LAUNCH APP CALLED ===`);
    console.log(`Path received: "${exePath}"`);
    console.log(`Path type: ${typeof exePath}`);
    console.log(`Path length: ${exePath ? exePath.length : 'null/undefined'}`);
    
    if (!exePath || typeof exePath !== 'string' || exePath.trim() === '') {
      console.error('ERROR: exePath is empty or invalid');
      resolve({ success: false, error: 'Path is empty or invalid' });
      return;
    }
    
    const trimmedPath = exePath.trim();
    
    // Check if file exists
    const pathExists = fs.existsSync(trimmedPath);
    console.log(`Path exists check: ${pathExists}`);
    
    if (!pathExists) {
      console.error(`ERROR: File does not exist at path: ${trimmedPath}`);
      resolve({ success: false, error: `File not found: ${trimmedPath}` });
      return;
    }
    
    try {
      // Use cmd /c start "" "path" for reliable handling of paths with spaces
      const command = `cmd /c start "" "${trimmedPath}"`;
      console.log(`Executing command: ${command}`);
      
      exec(command, (error, stdout, stderr) => {
        console.log(`Command completed for: ${trimmedPath}`);
        console.log(`stdout: ${stdout}`);
        console.log(`stderr: ${stderr}`);
        
        if (error) {
          console.error(`Launch error: ${error.message}`);
          resolve({ success: false, error: error.message });
        } else {
          console.log(`Launch successful for: ${trimmedPath}`);
          resolve({ success: true, path: trimmedPath });
        }
      });
    } catch (error) {
      console.error(`Exception launching ${trimmedPath}:`, error.message);
      resolve({ success: false, error: error.message });
    }
  });
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

// Run the full app launch sequence
// Windows: GSPRO (main sim), ProTee United VX (API window - minimize), Protee Labs (launch monitor)
async function runAppLaunchSequence(config) {
  const {
    gsproPath,
    proteeLabsPath,
    gsproDisplay, // Display index for GSPRO
    proteeDisplay, // Display index for Protee Labs
    postLaunchDelay = 5000
  } = config;
  
  console.log('=== APP LAUNCH SEQUENCE STARTED ===');
  console.log('Config:', JSON.stringify(config, null, 2));
  
  const results = [];
  appLaunchCancelled = false;
  
  try {
    // Step 1: Launch GSPRO
    console.log('Step 1: Launching GSPRO...');
    const gsproLaunch = await launchApp(gsproPath);
    console.log('GSPRO launch result:', gsproLaunch);
    results.push({ step: 'launch_gspro', ...gsproLaunch });
    
    if (!gsproLaunch.success) {
      return { success: false, error: 'Failed to launch GSPRO', results };
    }
    
    // Step 2: Wait for GSPRO window and move to correct display
    console.log('Step 2: Waiting 5s for GSPRO window...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    if (appLaunchCancelled) return { success: false, cancelled: true, results };
    
    const gsproWindow = await findGsproWindow();
    if (gsproWindow.success) {
      console.log(`Moving GSPRO to display ${gsproDisplay}...`);
      const moveResult = await moveWindowToDisplay(gsproWindow.hwnd, gsproDisplay, true);
      results.push({ step: 'move_gspro', ...moveResult });
    } else {
      results.push({ step: 'move_gspro', warning: 'GSPRO window not found for positioning' });
    }
    
    // Step 3: Start background watcher for ProTee United VX (API window) - just minimize it
    console.log('Step 3: Starting ProTee United VX API window watcher (will minimize when found)...');
    watchForProteeConnector(120000); // 2 minutes, runs in background
    
    // Step 4: Launch Protee Labs (the actual launch monitor software)
    console.log('Step 4: Launching Protee Labs...');
    console.log('  Path:', proteeLabsPath);
    console.log('  Exists:', fs.existsSync(proteeLabsPath));
    
    if (appLaunchCancelled) return { success: false, cancelled: true, results };
    
    const proteeLaunch = await launchApp(proteeLabsPath);
    console.log('Protee Labs launch result:', proteeLaunch);
    results.push({ step: 'launch_protee_labs', ...proteeLaunch });
    
    // Step 5: Wait for Protee Labs window and move to correct display
    if (proteeLaunch.success) {
      console.log('Step 5: Waiting 5s for Protee Labs window...');
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      if (appLaunchCancelled) return { success: false, cancelled: true, results };
      
      const proteeLabsWindow = await findProteeLabsWindow();
      if (proteeLabsWindow.success) {
        console.log(`Moving Protee Labs to display ${proteeDisplay}...`);
        const moveResult = await moveWindowToDisplay(proteeLabsWindow.hwnd, proteeDisplay, true);
        results.push({ step: 'move_protee_labs', ...moveResult });
      } else {
        results.push({ step: 'move_protee_labs', warning: 'Protee Labs window not found for positioning' });
      }
    }
    
    // Step 6: Final focus on GSPRO
    console.log('Step 6: Final delay then focusing GSPRO...');
    await new Promise(resolve => setTimeout(resolve, postLaunchDelay));
    
    if (appLaunchCancelled) return { success: false, cancelled: true, results };
    
    const gsproFinal = await findGsproWindow();
    if (gsproFinal.success) {
      await focusWindow(gsproFinal.hwnd);
      results.push({ step: 'focus_gspro', success: true });
    }
    
    console.log('=== APP LAUNCH SEQUENCE COMPLETE ===');
    return { success: true, results };
  } catch (error) {
    console.error('App launch sequence failed:', error.message);
    return { success: false, error: error.message, results };
  }
}

// Check window positions and move to correct displays if needed
async function checkAndCorrectWindowPositions(gsproDisplay, proteeDisplay) {
  const results = [];
  
  console.log('=== CHECKING WINDOW POSITIONS ===');
  console.log('Expected GSPRO display:', gsproDisplay);
  console.log('Expected Protee Labs display:', proteeDisplay);
  
  // Check GSPRO (exact match)
  const gsproWindow = await findGsproWindow();
  if (gsproWindow.success) {
    console.log(`Moving GSPRO to display ${gsproDisplay}...`);
    const moveResult = await moveWindowToDisplay(gsproWindow.hwnd, gsproDisplay, true);
    results.push({ app: 'GSPRO', found: true, moved: moveResult.success, display: gsproDisplay });
  } else {
    results.push({ app: 'GSPRO', found: false });
  }
  
  // Check Protee Labs (must contain "Labs", not "United VX")
  const proteeLabsWindow = await findProteeLabsWindow();
  if (proteeLabsWindow.success) {
    console.log(`Moving Protee Labs to display ${proteeDisplay}...`);
    const moveResult = await moveWindowToDisplay(proteeLabsWindow.hwnd, proteeDisplay, true);
    results.push({ app: 'Protee Labs', found: true, moved: moveResult.success, display: proteeDisplay });
  } else {
    results.push({ app: 'Protee Labs', found: false });
  }
  
  // Also check for ProTee United VX and minimize it if found
  const windowList = await getAllVisibleWindows();
  const unitedVxWindow = windowList.find(w => 
    w.title && w.title.toLowerCase().includes('united vx')
  );
  if (unitedVxWindow) {
    console.log(`Found ProTee United VX API window, minimizing...`);
    await minimizeWindow(unitedVxWindow.hwnd);
    results.push({ app: 'ProTee United VX', found: true, minimized: true });
  }
  
  return { success: true, results };
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