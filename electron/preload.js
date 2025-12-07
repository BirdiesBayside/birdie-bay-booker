const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods for renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  scanNetwork: () => ipcRenderer.invoke('scan-network'),
  controlPlug: (ip, action) => ipcRenderer.invoke('control-plug', { ip, action }),
  isElectron: true
});
