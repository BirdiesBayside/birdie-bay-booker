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
      runAppSequence: (config: { gsproPath: string; proteeLabsPath: string; gsproDisplay: number; proteeDisplay: number; postLaunchDelay?: number }) => Promise<{ success: boolean; cancelled?: boolean; results?: any[]; error?: string }>;
      cancelAppSequence: () => Promise<{ success: boolean }>;
      closeApps: (appNames: string[]) => Promise<{ success: boolean; results?: any[]; error?: string }>;
      checkWindowPositions: (gsproDisplay: number, proteeDisplay: number) => Promise<{ success: boolean; results?: { app: string; found: boolean; moved?: boolean; display?: number }[]; error?: string }>;
      listWindows: () => Promise<{ success: boolean; windows?: { title: string; hwnd: number }[]; error?: string }>;
      // Notification popup
      showNotificationPopup: (message: string, displayLabel: string, durationMs: number) => Promise<{ success: boolean; error?: string }>;
      closeNotificationPopup: () => Promise<{ success: boolean; error?: string }>;
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
    };
  }
}

export {};