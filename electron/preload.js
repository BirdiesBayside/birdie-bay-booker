const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods for renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // Check if running in Electron
  isElectron: true,
  
  // Initialize TAPO connection
  tapoInit: (email, password) => ipcRenderer.invoke('tapo-init', { email, password }),
  
  // Scan for TAPO devices on network
  scanNetwork: (email, password) => ipcRenderer.invoke('scan-network', { email, password }),
  
  // Control a specific plug (on/off/status)
  controlPlug: (email, password, ip, action) => 
    ipcRenderer.invoke('control-plug', { email, password, ip, action }),
  
  // Check if running in Electron environment
  checkElectron: () => ipcRenderer.invoke('check-electron')
});