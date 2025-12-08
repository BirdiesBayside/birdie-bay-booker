const { app, BrowserWindow, Tray, Menu, ipcMain } = require('electron');
const path = require('path');

let mainWindow;
let tray;
let tapoClient = null;

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
    icon: path.join(__dirname, 'icon.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    autoHideMenuBar: true,
    show: false
  });

  // Load the app
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173/bay-controller');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
    // Navigate to bay-controller route after loading
    mainWindow.webContents.on('did-finish-load', () => {
      mainWindow.webContents.executeJavaScript(`window.location.hash = '/bay-controller'`);
    });
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Minimize to tray instead of closing
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
    return false;
  });
}

function createTray() {
  tray = new Tray(path.join(__dirname, 'icon.ico'));
  
  const contextMenu = Menu.buildFromTemplate([
    { 
      label: 'Show Bay Controller', 
      click: () => mainWindow.show() 
    },
    { type: 'separator' },
    { 
      label: 'Quit', 
      click: () => {
        app.isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setToolTip('Birdies Bay Controller');
  tray.setContextMenu(contextMenu);
  
  tray.on('double-click', () => {
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
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
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

// Scan for TAPO devices using cloud API
async function scanForTapoDevices(email, password) {
  try {
    const { cloudLogin } = require('tp-link-tapo-connect');
    
    // Login to TAPO cloud
    const cloudClient = await cloudLogin(email, password);
    console.log('TAPO cloud login successful');
    
    // Get list of devices from cloud
    const devices = await cloudClient.listDevices();
    console.log(`Found ${devices.length} TAPO devices`);
    
    // Map to our plug format
    const plugs = devices.map((device, index) => ({
      id: device.deviceId || `device-${index}`,
      name: device.alias || device.deviceName || `Device ${index + 1}`,
      ip: device.deviceMac || 'Unknown', // MAC address as identifier
      deviceId: device.deviceId,
      deviceType: device.deviceType,
      isOn: false // Will be updated when we check status
    }));
    
    return { success: true, plugs };
  } catch (error) {
    console.error('TAPO scan failed:', error.message);
    return { success: false, error: error.message, plugs: [] };
  }
}

// Control a specific TAPO plug
async function controlTapoPlug(email, password, deviceIp, action) {
  try {
    const { loginDevice } = require('tp-link-tapo-connect');
    
    // Connect to the specific device
    const device = await loginDevice(email, password, deviceIp);
    
    if (action === 'on') {
      await device.turnOn();
      console.log(`Turned ON plug at ${deviceIp}`);
    } else if (action === 'off') {
      await device.turnOff();
      console.log(`Turned OFF plug at ${deviceIp}`);
    } else if (action === 'status') {
      const status = await device.getDeviceInfo();
      return { success: true, isOn: status.device_on };
    }
    
    return { success: true };
  } catch (error) {
    console.error(`TAPO control failed for ${deviceIp}:`, error.message);
    return { success: false, error: error.message };
  }
}

// IPC Handlers
ipcMain.handle('tapo-init', async (event, { email, password }) => {
  return await initTapo(email, password);
});

ipcMain.handle('scan-network', async (event, { email, password }) => {
  console.log('Scanning for TAPO devices...');
  return await scanForTapoDevices(email, password);
});

ipcMain.handle('control-plug', async (event, { email, password, ip, action }) => {
  console.log(`Controlling plug at ${ip}: ${action}`);
  return await controlTapoPlug(email, password, ip, action);
});

ipcMain.handle('check-electron', async () => {
  return true;
});