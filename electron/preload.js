const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods for renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // Check if running in Electron
  isElectron: true,
  
  // Initialize TAPO connection
  tapoInit: (email, password) => ipcRenderer.invoke('tapo-init', { email, password }),
  
  // Test TAPO login credentials
  tapoTestLogin: (email, password) => ipcRenderer.invoke('tapo-test-login', { email, password }),
  
  // Control a specific plug (on/off/status)
  controlPlug: (email, password, ip, action) => 
    ipcRenderer.invoke('control-plug', { email, password, ip, action }),
  
  // Diagnose a plug (detailed connection debugging)
  diagnosePlug: (email, password, ip) => 
    ipcRenderer.invoke('diagnose-plug', { email, password, ip }),
  
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
  
  // Run the full app launch sequence (GSPRO -> Protee Labs -> minimize connector -> refocus)
  runAppSequence: (config) => ipcRenderer.invoke('run-app-sequence', config),
  
  // Cancel the app launch sequence
  cancelAppSequence: () => ipcRenderer.invoke('cancel-app-sequence'),
  
  // Show welcome windows on all displays
  showWelcomeWindows: (firstName) => ipcRenderer.invoke('show-welcome-windows', { firstName }),
  
  // Close all welcome windows
  closeWelcomeWindows: () => ipcRenderer.invoke('close-welcome-windows'),
  
  // Close apps by process name
  closeApps: (appNames) => ipcRenderer.invoke('close-apps', { appNames }),
  
  // Check and correct window positions
  checkWindowPositions: (gsproDisplay, proteeDisplay) => 
    ipcRenderer.invoke('check-window-positions', { gsproDisplay, proteeDisplay }),
  
  // Debug: List all visible windows
  listWindows: () => ipcRenderer.invoke('list-windows'),
  
  // =====================================================
  // SECURITY / QUIT CONTROL APIs
  // =====================================================
  
  // Confirm quit (after password verification)
  confirmQuit: () => ipcRenderer.invoke('confirm-quit'),
  
  // Update authentication state in main process
  setAuthenticated: (authenticated) => ipcRenderer.invoke('set-authenticated', authenticated),
  
  // Update app launch config in main process (for global F10 hotkey)
  setAppLaunchConfig: (config) => ipcRenderer.invoke('set-app-launch-config', config),
  
  // Listen for F10 global hotkey events from main process
  onF10NoConfig: (callback) => {
    ipcRenderer.on('f10-no-config', () => callback());
    return () => ipcRenderer.removeAllListeners('f10-no-config');
  },
  onF10DisplaysNotFound: (callback) => {
    ipcRenderer.on('f10-displays-not-found', () => callback());
    return () => ipcRenderer.removeAllListeners('f10-displays-not-found');
  },
  onF10Result: (callback) => {
    ipcRenderer.on('f10-result', (event, result) => callback(result));
    return () => ipcRenderer.removeAllListeners('f10-result');
  },
  onF10Error: (callback) => {
    ipcRenderer.on('f10-error', (event, error) => callback(error));
    return () => ipcRenderer.removeAllListeners('f10-error');
  },
  
  // Listen for lock request from main process (when window shown from tray)
  onRequestLock: (callback) => {
    ipcRenderer.on('request-lock', () => callback());
    // Return cleanup function
    return () => ipcRenderer.removeAllListeners('request-lock');
  },
  
  // Listen for quit password request from main process
  onRequestQuitPassword: (callback) => {
    ipcRenderer.on('request-quit-password', () => callback());
    // Return cleanup function
    return () => ipcRenderer.removeAllListeners('request-quit-password');
  },
  
  // =====================================================
  // NOTIFICATION POPUP APIs
  // =====================================================
  
  // Show a notification popup on a specific display
  showNotificationPopup: (message, displayLabel, durationMs) => 
    ipcRenderer.invoke('show-notification-popup', { message, displayLabel, durationMs }),
  
  // Close the notification popup
  closeNotificationPopup: () => ipcRenderer.invoke('close-notification-popup'),
  
  // =====================================================
  // SGT ICON OVERLAY APIs
  // =====================================================
  
  // Show SGT icon overlay on a specific display
  showSgtIconOverlay: (displayLabel, position, playerData) => 
    ipcRenderer.invoke('show-sgt-icon-overlay', { displayLabel, position, playerData }),
  
  // Close the SGT icon overlay
  closeSgtIconOverlay: () => ipcRenderer.invoke('close-sgt-icon-overlay'),
  
  // Show SGT info overlay on a specific display
  showSgtInfoOverlay: (displayLabel, playerData) => 
    ipcRenderer.invoke('show-sgt-info-overlay', { displayLabel, playerData }),
  
  // Close the SGT info overlay
  closeSgtInfoOverlay: () => ipcRenderer.invoke('close-sgt-info-overlay'),
  
  // Toggle SGT info overlay
  toggleSgtInfoOverlay: () => ipcRenderer.invoke('toggle-sgt-info-overlay'),
  
  // Update SGT icon position
  updateSgtIconPosition: (displayLabel, position) => 
    ipcRenderer.invoke('update-sgt-icon-position', { displayLabel, position }),
  
  // Send SGT icon click event to main process (called from overlay window)
  sgtIconClicked: () => ipcRenderer.send('sgt-icon-clicked'),
  
  // Show SGT hide confirmation dialog (called from icon overlay X button)
  showSgtHideConfirm: () => ipcRenderer.send('show-sgt-hide-confirm'),
  
  // Cancel SGT hide confirmation (called from confirm dialog)
  cancelSgtHideConfirm: () => ipcRenderer.send('cancel-sgt-hide-confirm'),
  
  // Send SGT icon hide confirmation (called from confirm dialog)
  sgtIconHideConfirmed: () => ipcRenderer.send('sgt-icon-hide-confirmed'),
  
  // Listen for SGT icon click event from overlay window
  onSgtIconClicked: (callback) => {
    ipcRenderer.on('sgt-icon-clicked', () => callback());
    return () => ipcRenderer.removeAllListeners('sgt-icon-clicked');
  },
  
  // Listen for SGT icon hidden event from overlay window
  onSgtIconHidden: (callback) => {
    ipcRenderer.on('sgt-icon-hidden', () => callback());
    return () => ipcRenderer.removeAllListeners('sgt-icon-hidden');
  },
  
  // =====================================================
  // CLIPBOARD / AUTO-PASTE APIs
  // =====================================================
  
  // Copy text to clipboard and arm auto-paste mode
  // After calling this, triggerAutoPaste will do Ctrl+A, Delete, Ctrl+V
  copyForPaste: (text) => ipcRenderer.invoke('copy-for-paste', { text }),
  
  // Trigger the auto-paste sequence (Ctrl+A, Delete, Ctrl+V)
  triggerAutoPaste: () => ipcRenderer.invoke('trigger-auto-paste'),
  
  // Get auto-paste status
  getAutoPasteStatus: () => ipcRenderer.invoke('get-auto-paste-status'),
  
  // Clear/disarm auto-paste
  clearAutoPaste: () => ipcRenderer.invoke('clear-auto-paste'),
  
  // =====================================================
  // GSPRO BASELINE SETTINGS APIs
  // =====================================================
  
  // Get current baseline configuration
  getBaselineConfig: () => ipcRenderer.invoke('get-baseline-config'),
  
  // Browse for GSPro folder
  browseGsproFolder: () => ipcRenderer.invoke('browse-gspro-folder'),
  
  // Set GSPro folder path manually
  setGsproFolder: (folderPath) => ipcRenderer.invoke('set-gspro-folder', { folderPath }),
  
  // Browse and upload a baseline file
  browseBaselineFile: (fileName) => ipcRenderer.invoke('browse-baseline-file', { fileName }),
  
  // Enable/disable baseline restore feature
  setBaselineEnabled: (enabled) => ipcRenderer.invoke('set-baseline-enabled', { enabled }),
  
  // Manually trigger baseline restore
  restoreBaselineNow: () => ipcRenderer.invoke('restore-baseline-now'),
  
  // Check if GSPro is running
  isGsproRunning: () => ipcRenderer.invoke('is-gspro-running'),
  
  // Listen for GSPro closed event
  onGsproClosed: (callback) => {
    ipcRenderer.on('gspro-closed', () => callback());
    return () => ipcRenderer.removeAllListeners('gspro-closed');
  },
  
  // Listen for baseline restored event
  onBaselineRestored: (callback) => {
    ipcRenderer.on('baseline-restored', (event, results) => callback(results));
    return () => ipcRenderer.removeAllListeners('baseline-restored');
  }
});
