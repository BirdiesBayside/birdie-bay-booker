const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods for renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // Check if running in Electron
  isElectron: true,
  
  // Initialize TAPO connection
  tapoInit: (email, password) => ipcRenderer.invoke('tapo-init', { email, password }),
  
  // Test TAPO login credentials
  tapoTestLogin: (email, password) => ipcRenderer.invoke('tapo-test-login', { email, password }),
  
  // Scan for TAPO devices on network
  scanNetwork: (email, password) => ipcRenderer.invoke('scan-network', { email, password }),
  
  // Control a specific plug (on/off/status)
  controlPlug: (email, password, ip, action) => 
    ipcRenderer.invoke('control-plug', { email, password, ip, action }),
  
  // Check if running in Electron environment
  checkElectron: () => ipcRenderer.invoke('check-electron'),
  
  // =====================================================
  // APP AUTOMATION APIs
  // =====================================================
  
  // Get all connected displays
  getDisplays: () => ipcRenderer.invoke('get-displays'),
  
  // Launch an application
  launchApp: (exePath) => ipcRenderer.invoke('launch-app', { exePath }),
  
  // Find a window by title pattern
  findWindow: (titlePattern) => ipcRenderer.invoke('find-window', { titlePattern }),
  
  // Move window to a specific display
  moveWindow: (hwnd, displayIndex, fullscreen = false) => 
    ipcRenderer.invoke('move-window', { hwnd, displayIndex, fullscreen }),
  
  // Minimize a window
  minimizeWindow: (hwnd) => ipcRenderer.invoke('minimize-window', { hwnd }),
  
  // Focus a window
  focusWindow: (hwnd) => ipcRenderer.invoke('focus-window', { hwnd }),
  
  // Run the full app launch sequence (GSPRO -> API minimize -> Protee Labs -> refocus)
  runAppSequence: (config) => ipcRenderer.invoke('run-app-sequence', config),
  
  // Close apps by process name
  closeApps: (appNames) => ipcRenderer.invoke('close-apps', { appNames })
});