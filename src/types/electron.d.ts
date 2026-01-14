export interface DisplayInfo {
  id: number;
  index: number;
  label: string;
  bounds: { x: number; y: number; width: number; height: number };
  size: { width: number; height: number };
  isPrimary: boolean;
  signature: string;
}

declare global {
  interface Window {
    electronAPI?: {
      isElectron: boolean;
      tapoInit: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
      tapoTestLogin: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
      controlPlug: (email: string, password: string, ip: string, action: 'on' | 'off' | 'status') => Promise<{ success: boolean; isOn?: boolean; error?: string }>;
      // App automation
      getDisplays: () => Promise<DisplayInfo[]>;
      launchApp: (exePath: string) => Promise<{ success: boolean; pid?: number; error?: string }>;
      findWindow: (titlePattern: string) => Promise<{ success: boolean; hwnd?: number; title?: string; error?: string }>;
      moveWindow: (hwnd: number, displayIndex: number, fullscreen?: boolean) => Promise<{ success: boolean; error?: string }>;
      minimizeWindow: (hwnd: number) => Promise<{ success: boolean; error?: string }>;
      focusWindow: (hwnd: number) => Promise<{ success: boolean; error?: string }>;
      runAppSequence: (config: { gsproPath: string; proteeLabsPath: string; gsproDisplay: number; proteeDisplay: number; postLaunchDelay?: number; firstName?: string }) => Promise<{ success: boolean; cancelled?: boolean; results?: any[]; error?: string }>;
      cancelAppSequence: () => Promise<{ success: boolean }>;
      closeApps: (appNames: string[]) => Promise<{ success: boolean; results?: any[]; error?: string }>;
      // Welcome window system
      showWelcomeWindows: (firstName: string) => Promise<{ success: boolean; windowCount?: number; error?: string }>;
      closeWelcomeWindows: () => Promise<{ success: boolean; error?: string }>;
      checkWindowPositions: (gsproDisplay: number, proteeDisplay: number) => Promise<{ success: boolean; results?: { app: string; found: boolean; moved?: boolean; display?: number }[]; error?: string }>;
      listWindows: () => Promise<{ success: boolean; windows?: { title: string; hwnd: number }[]; error?: string }>;
      // Notification popup
      showNotificationPopup: (message: string, displayLabel: string, durationMs: number) => Promise<{ success: boolean; error?: string }>;
      closeNotificationPopup: () => Promise<{ success: boolean; error?: string }>;
      // SGT icon overlay
      showSgtIconOverlay: (displayLabel: string, position: string, playerData?: { customerName?: string; sgtUsername?: string; sgtGameId?: string }) => Promise<{ success: boolean; error?: string }>;
      closeSgtIconOverlay: () => Promise<{ success: boolean; error?: string }>;
      showSgtInfoOverlay: (displayLabel: string, playerData?: { customerName?: string; sgtUsername?: string; sgtGameId?: string }) => Promise<{ success: boolean; error?: string }>;
      closeSgtInfoOverlay: () => Promise<{ success: boolean; error?: string }>;
      toggleSgtInfoOverlay: () => Promise<{ success: boolean; visible?: boolean; error?: string }>;
      updateSgtIconPosition: (displayLabel: string, position: string) => Promise<{ success: boolean }>;
      onSgtIconClicked: (callback: () => void) => () => void;
      onSgtIconHidden: (callback: () => void) => () => void;
      // Security / Quit control
      confirmQuit: () => Promise<{ success: boolean }>;
      setAuthenticated: (authenticated: boolean) => Promise<{ success: boolean }>;
      onRequestLock: (callback: () => void) => () => void;
      onRequestQuitPassword: (callback: () => void) => () => void;
      // Clipboard / Auto-paste
      copyForPaste: (text: string) => Promise<{ success: boolean; error?: string }>;
      triggerAutoPaste: () => Promise<{ success: boolean; error?: string }>;
      getAutoPasteStatus: () => Promise<{ enabled: boolean; text: string }>;
      clearAutoPaste: () => Promise<{ success: boolean }>;
      // GSPro Baseline Settings
      getBaselineConfig: () => Promise<{
        gsproFolderPath: string;
        dpsFilePath: string;
        settingsFilePath: string;
        enabled: boolean;
        hasDpsFile: boolean;
        hasSettingsFile: boolean;
        isWatching: boolean;
      }>;
      browseGsproFolder: () => Promise<{ success: boolean; canceled?: boolean; folderPath?: string; dpsFilePath?: string; settingsFilePath?: string; error?: string }>;
      setGsproFolder: (folderPath: string) => Promise<{ success: boolean; dpsFilePath?: string; settingsFilePath?: string; error?: string }>;
      browseBaselineFile: (fileName: string) => Promise<{ success: boolean; canceled?: boolean; sourcePath?: string; storedPath?: string; error?: string }>;
      setBaselineEnabled: (enabled: boolean) => Promise<{ success: boolean; enabled: boolean }>;
      restoreBaselineNow: () => Promise<{ success: boolean; results?: { file: string; success: boolean; error?: string }[]; error?: string }>;
      isGsproRunning: () => Promise<{ isRunning: boolean }>;
      onGsproClosed: (callback: () => void) => () => void;
      onBaselineRestored: (callback: (results: { file: string; success: boolean; error?: string }[]) => void) => () => void;
    };
  }
}

export {};