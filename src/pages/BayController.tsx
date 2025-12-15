import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Lock, Wifi, Power, Clock, AlertTriangle, CheckCircle, XCircle, Settings, RefreshCw, Monitor, Play, Square, FolderOpen, ChevronDown, ChevronUp, Bell, X, Trash2, TestTube } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format, addMinutes, isBefore, isAfter, parseISO } from "date-fns";

interface Booking {
  id: string;
  booking_date: string;
  start_time: string;
  end_time: string;
  duration_hours: number;
  player_count: number;
  status: string;
  customer_name?: string;
}

interface TapoPlug {
  id: string;
  name: string;
  ip: string;
  isOn: boolean;
  deviceId?: string;
  type: 'monitor' | 'projector';
}

interface BayPlugAssignment {
  bayNumber: number;
  plugs: TapoPlug[];
}

interface DisplayInfo {
  id: number;
  index: number;
  label: string;
  bounds: { x: number; y: number; width: number; height: number };
  size: { width: number; height: number };
  isPrimary: boolean;
  signature: string; // "widthxheight" for matching
}

interface AppLaunchConfig {
  gsproPath: string;
  proteeLabsPath: string;
  gsproDisplayLabel: string; // Display label (e.g., "SAMSUNG", "BENQ PJ") for GSPRO
  proteeDisplayLabel: string; // Display label for Protee (touchscreen)
  appLaunchMinutes: number; // Minutes before booking to launch apps (after plugs are on)
  appCloseSeconds: number; // Seconds before booking end to close apps (before plugs turn off)
  enabled: boolean;
}

interface NotificationConfig {
  enabled: boolean;
  displayLabel: string; // Which display to show notification on
  notifications: {
    id: string;
    minutesBefore: number;
    message: string;
    enabled: boolean;
  }[];
}

// ActiveNotification interface removed - now using Electron popup windows

// Helper to find display by label (name)
const findDisplayByLabel = (displays: DisplayInfo[], label: string): DisplayInfo | undefined => {
  return displays.find(d => d.label === label);
};

// Type for Electron API exposed via preload
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
    };
  }
}

const CORRECT_PASSWORD = "Holeinone1";
const APP_VERSION = "1.0.2";

// Debug log for Electron builds
console.log(`Bay Controller v${APP_VERSION} starting...`, {
  isElectron: typeof window !== 'undefined' && !!(window as any).electronAPI?.isElectron,
  userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'N/A'
});

// Collapsible Settings Card Component
function CollapsibleSettingsCard({ 
  title, 
  icon, 
  children, 
  defaultOpen = true 
}: { 
  title: string; 
  icon: React.ReactNode; 
  children: React.ReactNode; 
  defaultOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  
  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {icon}
                {title}
              </div>
              {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </CardTitle>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="space-y-4 pt-0">
            {children}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

export default function BayController() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  
  // Quit confirmation state
  const [showQuitDialog, setShowQuitDialog] = useState(false);
  const [quitPassword, setQuitPassword] = useState("");
  const [quitPasswordError, setQuitPasswordError] = useState("");
  
  const [selectedBay, setSelectedBay] = useState<number | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [isLoadingBookings, setIsLoadingBookings] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<"connected" | "disconnected" | "connecting">("disconnected");
  
  const [discoveredPlugs, setDiscoveredPlugs] = useState<TapoPlug[]>(() => {
    const saved = localStorage.getItem("bayController_discoveredPlugs");
    return saved ? JSON.parse(saved) : [];
  });
  const [bayPlugAssignments, setBayPlugAssignments] = useState<BayPlugAssignment[]>(() => {
    const saved = localStorage.getItem("bayController_bayPlugAssignments");
    return saved ? JSON.parse(saved) : [];
  });
  const [plugAssignmentsLoaded, setPlugAssignmentsLoaded] = useState(false);
  const [preStartMinutes, setPreStartMinutes] = useState(3);
  const [warningMinutes, setWarningMinutes] = useState([5, 1]);
  const [showSettings, setShowSettings] = useState(false);
  
  const [currentTime, setCurrentTime] = useState(new Date());
  const [activeBooking, setActiveBooking] = useState<Booking | null>(null);
  const [plugsStatus, setPlugsStatus] = useState({ monitor: false, projector: false });
  const [manualOverride, setManualOverride] = useState(false); // Prevents auto-control when manually controlling
  
  // TAPO credentials state
  const [tapoEmail, setTapoEmail] = useState("");
  const [tapoPassword, setTapoPassword] = useState("");
  const [isElectron, setIsElectron] = useState(false);

  // App Launch state
  const [displays, setDisplays] = useState<DisplayInfo[]>([]);
  const [appLaunchConfig, setAppLaunchConfig] = useState<AppLaunchConfig>({
    gsproPath: "C:\\Program Files\\GSPro\\GSPro.exe",
    proteeLabsPath: "C:\\Program Files\\ProTee Labs\\ProTee Labs.exe",
    gsproDisplayLabel: "", // Will be set when display is selected (e.g., "SAMSUNG")
    proteeDisplayLabel: "", // Will be set when display is selected (e.g., "BENQ PJ")
    appLaunchMinutes: 1, // 1 minute before booking (after plugs turn on at 3 mins)
    appCloseSeconds: 15, // 15 seconds before booking end to close apps (before plugs turn off)
    enabled: false
  });
  const [isLaunchingApps, setIsLaunchingApps] = useState(false);
  const [appLaunchStatus, setAppLaunchStatus] = useState<string | null>(null);
  const [appsRunning, setAppsRunning] = useState(() => {
    const saved = localStorage.getItem("bayController_appsRunning");
    return saved === "true";
  });
  const [isTestingLogin, setIsTestingLogin] = useState(false);
  const [loginTestResult, setLoginTestResult] = useState<{ success: boolean; message: string } | null>(null);
  
  // State for manual plug entry
  const [newPlugName, setNewPlugName] = useState("");
  const [newPlugIp, setNewPlugIp] = useState("");
  const [newPlugType, setNewPlugType] = useState<'monitor' | 'projector'>('monitor');
  
  // Debug log state for in-app viewing
  const [debugLogs, setDebugLogs] = useState<{ time: string; message: string; type: 'info' | 'error' | 'success' }[]>([]);
  
  // Notification state
  const [notificationConfig, setNotificationConfig] = useState<NotificationConfig>(() => {
    const saved = localStorage.getItem("bayController_notificationConfig");
    return saved ? JSON.parse(saved) : {
      enabled: true,
      displayLabel: "",
      notifications: [
        { id: "5min", minutesBefore: 5, message: "Hi {firstName}, your session ends in 5 minutes. Please book more time now if needed.", enabled: true },
        { id: "1min", minutesBefore: 1, message: "Hi {firstName}, your session will shutdown in 1 minute.", enabled: true }
      ]
    };
  });
  // activeNotification state removed - now using Electron popup windows
  const [shownNotifications, setShownNotifications] = useState<Set<string>>(new Set());
  
  // Helper to add debug log
  const addLog = useCallback((message: string, type: 'info' | 'error' | 'success' = 'info') => {
    const time = new Date().toLocaleTimeString();
    setDebugLogs(prev => [...prev.slice(-49), { time, message, type }]); // Keep last 50 logs
  }, []);

  // Check if running in Electron and load saved credentials/config
  useEffect(() => {
    const electronCheck = !!window.electronAPI?.isElectron;
    setIsElectron(electronCheck);
    
    // Mark plug assignments as loaded (they were loaded via useState initializer)
    setPlugAssignmentsLoaded(true);
    
    // Load saved TAPO credentials from localStorage
    const savedEmail = localStorage.getItem("bayController_tapoEmail");
    const savedPassword = localStorage.getItem("bayController_tapoPassword");
    if (savedEmail) setTapoEmail(savedEmail);
    if (savedPassword) setTapoPassword(savedPassword);
    
    // Load saved app launch config - merge with defaults to handle new fields
    const savedAppConfig = localStorage.getItem("bayController_appLaunchConfig");
    if (savedAppConfig) {
      const parsed = JSON.parse(savedAppConfig);
      setAppLaunchConfig(prev => ({ ...prev, ...parsed }));
    }
    
    // Load saved bay selection
    const savedBay = localStorage.getItem("bayController_selectedBay");
    if (savedBay) {
      setSelectedBay(parseInt(savedBay));
    }
    
    // Load saved pre-start minutes
    const savedPreStart = localStorage.getItem("bayController_preStartMinutes");
    if (savedPreStart) {
      setPreStartMinutes(parseInt(savedPreStart));
    }
    
    // Get display info if in Electron
    if (electronCheck && window.electronAPI) {
      window.electronAPI.getDisplays().then(displayList => {
        setDisplays(displayList);
        console.log("Detected displays:", displayList);
      }).catch(err => {
        console.error("Failed to get displays:", err);
      });
      
      // Set up continuous display monitoring (check every 5 seconds for new/removed displays)
      const displayMonitorInterval = setInterval(async () => {
        try {
          const currentDisplays = await window.electronAPI!.getDisplays();
          setDisplays(prevDisplays => {
            // Check for changes silently
            const prevLabels = new Set(prevDisplays.map(d => d.label));
            const currentLabels = new Set(currentDisplays.map(d => d.label));
            
            // Log new displays silently
            const newDisplays = currentDisplays.filter(d => !prevLabels.has(d.label));
            if (newDisplays.length > 0) {
              console.log("New display(s) detected:", newDisplays.map(d => d.label));
            }
            
            // Log removed displays silently
            const removedDisplays = prevDisplays.filter(d => !currentLabels.has(d.label));
            if (removedDisplays.length > 0) {
              console.log("Display(s) disconnected:", removedDisplays.map(d => d.label));
            }
            
            return currentDisplays;
          });
        } catch (err) {
          // Silent failure - don't log errors to avoid console noise
        }
      }, 5000); // Check every 5 seconds
      
      // Listen for lock request from main process (when window shown from tray)
      const cleanupLock = window.electronAPI.onRequestLock(() => {
        console.log("Lock requested from main process");
        setIsAuthenticated(false);
        setPassword("");
        setPasswordError("");
        setShowQuitDialog(false);
      });
      
      // Listen for quit password request from main process
      const cleanupQuit = window.electronAPI.onRequestQuitPassword(() => {
        console.log("Quit password requested from main process");
        setShowQuitDialog(true);
        setQuitPassword("");
        setQuitPasswordError("");
      });
      
      return () => {
        clearInterval(displayMonitorInterval);
        cleanupLock?.();
        cleanupQuit?.();
      };
    }
  }, []);

  // Update current time every second
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Handle password submission
  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log("[BayController] Password form submitted");
    if (password === CORRECT_PASSWORD) {
      console.log("[BayController] Password correct, authenticating...");
      setIsAuthenticated(true);
      setPasswordError("");
      // Notify main process of authentication
      try {
        window.electronAPI?.setAuthenticated(true);
        console.log("[BayController] Notified main process of authentication");
      } catch (err) {
        console.error("[BayController] Error notifying main process:", err);
      }
    } else {
      console.log("[BayController] Incorrect password entered");
      setPasswordError("Incorrect password");
    }
  };
  // Handle quit password submission
  const handleQuitPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (quitPassword === CORRECT_PASSWORD) {
      setQuitPasswordError("");
      // Confirm quit to main process - this will exit the app
      await window.electronAPI?.confirmQuit();
    } else {
      setQuitPasswordError("Incorrect password");
    }
  };

  // Cancel quit dialog
  const handleCancelQuit = () => {
    setShowQuitDialog(false);
    setQuitPassword("");
    setQuitPasswordError("");
  };

  // Track the previous bay to know when we're switching bays vs just refreshing
  const previousBayRef = useRef<number | null>(null);

  // Fetch bookings for selected bay
  const fetchBookings = useCallback(async () => {
    if (!selectedBay) return;
    
    const isSwitchingBays = previousBayRef.current !== null && previousBayRef.current !== selectedBay;
    previousBayRef.current = selectedBay;
    
    setIsLoadingBookings(true);
    setConnectionStatus("connecting");
    
    // Only reset state when switching bays, not when refreshing due to real-time updates
    if (isSwitchingBays) {
      setBookings([]);
      setActiveBooking(null);
      setPlugsStatus({ monitor: false, projector: false });
    }
    
    try {
      const { data, error } = await supabase.functions.invoke("bay-controller-api", {
        body: {},
        headers: {
          "x-bay-number": selectedBay.toString(),
          "x-app-version": APP_VERSION,
        },
      });

      if (error) throw error;

      setBookings(data.bookings || []);
      setConnectionStatus("connected");
      console.log(`Fetched ${data.bookings?.length || 0} bookings for bay ${selectedBay}`);
    } catch (error) {
      console.error("Failed to fetch bookings:", error);
      setConnectionStatus("disconnected");
      toast.error("Failed to connect to server");
    } finally {
      setIsLoadingBookings(false);
    }
  }, [selectedBay]);

  // Send heartbeat
  const sendHeartbeat = useCallback(async () => {
    if (!selectedBay) return;
    
    try {
      await supabase.functions.invoke("bay-controller-api", {
        body: {},
        headers: {
          "x-bay-number": selectedBay.toString(),
          "x-app-version": APP_VERSION,
        },
      });
    } catch (error) {
      console.error("Heartbeat failed:", error);
      setConnectionStatus("disconnected");
    }
  }, [selectedBay]);

  // Set up real-time subscription for bookings, heartbeat, and polling fallback
  useEffect(() => {
    if (!selectedBay) return;

    // Initial fetch
    fetchBookings();

    // Get bay_id for the selected bay number
    const setupRealtimeSubscription = async () => {
      const { data: bayData } = await supabase
        .from("bays")
        .select("id")
        .eq("bay_number", selectedBay)
        .maybeSingle();

      if (!bayData?.id) {
        console.error("Could not find bay ID for bay number:", selectedBay);
        return;
      }

      // Subscribe to real-time changes on bookings table for this bay
      const channel = supabase
        .channel(`bay-${selectedBay}-bookings`)
        .on(
          'postgres_changes',
          {
            event: '*', // Listen to INSERT, UPDATE, DELETE
            schema: 'public',
            table: 'bookings',
            filter: `bay_id=eq.${bayData.id}`
          },
          (payload) => {
            console.log('Real-time booking update received:', payload);
            // Refetch bookings to get the latest data
            fetchBookings();
          }
        )
        .subscribe((status) => {
          console.log('Realtime subscription status:', status);
          if (status === 'SUBSCRIBED') {
            console.log('Successfully subscribed to real-time booking updates');
          }
        });

      return channel;
    };

    let realtimeChannel: ReturnType<typeof supabase.channel> | undefined;
    setupRealtimeSubscription().then(channel => {
      realtimeChannel = channel;
    });

    // Heartbeat to keep device status updated
    const heartbeatInterval = setInterval(sendHeartbeat, 30000); // Every 30 seconds

    // Polling fallback - refresh bookings every 20 seconds silently
    const pollingInterval = setInterval(() => {
      console.log('Polling for booking updates...');
      fetchBookings();
    }, 20000); // Every 20 seconds

    return () => {
      clearInterval(heartbeatInterval);
      clearInterval(pollingInterval);
      if (realtimeChannel) {
        supabase.removeChannel(realtimeChannel);
      }
    };
  }, [selectedBay, fetchBookings, sendHeartbeat]);

  // Save bay selection
  useEffect(() => {
    if (selectedBay) {
      localStorage.setItem("bayController_selectedBay", selectedBay.toString());
    }
  }, [selectedBay]);

  // Refs to hold current state for admin command callbacks
  const bayPlugAssignmentsRef = useRef(bayPlugAssignments);
  const tapoEmailRef = useRef(tapoEmail);
  const tapoPasswordRef = useRef(tapoPassword);
  const isElectronRef = useRef(isElectron);
  
  // Keep refs in sync with state
  useEffect(() => {
    bayPlugAssignmentsRef.current = bayPlugAssignments;
  }, [bayPlugAssignments]);
  
  useEffect(() => {
    tapoEmailRef.current = tapoEmail;
  }, [tapoEmail]);
  
  useEffect(() => {
    tapoPasswordRef.current = tapoPassword;
  }, [tapoPassword]);
  
  useEffect(() => {
    isElectronRef.current = isElectron;
  }, [isElectron]);

  // Subscribe to admin commands from bay_commands table
  useEffect(() => {
    if (!selectedBay) return;

    console.log(`Setting up admin command subscription for bay ${selectedBay}`);

    // Helper to get plugs for this bay using refs (avoids stale closure)
    const getPlugsForCommand = (): TapoPlug[] => {
      return bayPlugAssignmentsRef.current.find(a => a.bayNumber === selectedBay)?.plugs || [];
    };

    // Execute plug control directly in callback using refs
    const executePlugControl = async (action: 'on' | 'off', commandId: string) => {
      console.log(`Admin command: Turn ${action.toUpperCase()} plugs for bay ${selectedBay}`);
      
      const bayPlugs = getPlugsForCommand();
      console.log("Plugs for command:", JSON.stringify(bayPlugs, null, 2));
      
      if (bayPlugs.length === 0) {
        console.warn("No plugs assigned to this bay!");
        toast.warning("No plugs assigned to this bay");
        return;
      }
      
      if (!tapoEmailRef.current || !tapoPasswordRef.current) {
        console.error("TAPO credentials not configured");
        toast.error("TAPO credentials not configured");
        return;
      }
      
      if (!isElectronRef.current || !window.electronAPI) {
        console.error("Not running in Electron");
        return;
      }
      
      const newStatus = { monitor: false, projector: false };
      
      for (const plug of bayPlugs) {
        if (!plug.ip || typeof plug.ip !== 'string' || plug.ip.trim() === '') {
          console.error(`Invalid IP for plug ${plug.name}:`, plug);
          toast.error(`Invalid IP address for ${plug.name || 'plug'}`);
          continue;
        }
        
        const cleanIp = plug.ip.trim();
        console.log(`Attempting to turn ${action.toUpperCase()} plug: ${plug.name} (${plug.type}) at ${cleanIp}`);
        
        try {
          const result = await window.electronAPI.controlPlug(
            tapoEmailRef.current, 
            tapoPasswordRef.current, 
            cleanIp, 
            action
          );
          console.log(`Control result for ${plug.name}:`, result);
          if (!result.success) {
            toast.error(`Failed to turn ${action} ${plug.name}: ${result.error}`);
          } else {
            toast.success(`Turned ${action.toUpperCase()}: ${plug.name}`);
            newStatus[plug.type] = action === 'on';
          }
        } catch (error) {
          console.error(`Failed to turn ${action} ${plug.name}:`, error);
          toast.error(`Error controlling ${plug.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
      
      setPlugsStatus(newStatus);
      
      // Update command status to executed
      await supabase
        .from('bay_commands')
        .update({ status: 'executed', executed_at: new Date().toISOString() })
        .eq('id', commandId);
    };

    // Subscribe to new commands for this bay
    const commandChannel = supabase
      .channel(`bay-${selectedBay}-commands`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'bay_commands',
          filter: `bay_number=eq.${selectedBay}`
        },
        async (payload) => {
          const command = payload.new as { id: string; command: string; status: string };
          console.log('Received admin command:', command);

          if (command.status !== 'pending') {
            console.log('Command already processed, ignoring');
            return;
          }

          // Execute the command with manual override
          setManualOverride(true);
          
          // Small delay to ensure state is updated
          setTimeout(() => {
            executePlugControl(command.command as 'on' | 'off', command.id);
          }, 100);
        }
      )
      .subscribe((status) => {
        console.log('Admin command subscription status:', status);
        if (status === 'SUBSCRIBED') {
          console.log('Successfully subscribed to admin commands');
        }
      });

    return () => {
      supabase.removeChannel(commandChannel);
    };
  }, [selectedBay]);
  // Save plug assignments and discovered plugs to localStorage
  // Only save after initial load to prevent overwriting with empty arrays
  useEffect(() => {
    if (plugAssignmentsLoaded) {
      localStorage.setItem("bayController_bayPlugAssignments", JSON.stringify(bayPlugAssignments));
      localStorage.setItem("bayController_discoveredPlugs", JSON.stringify(discoveredPlugs));
    }
  }, [bayPlugAssignments, discoveredPlugs, plugAssignmentsLoaded]);

  // Save pre-start minutes
  useEffect(() => {
    localStorage.setItem("bayController_preStartMinutes", preStartMinutes.toString());
  }, [preStartMinutes]);

  // Save app launch config
  useEffect(() => {
    localStorage.setItem("bayController_appLaunchConfig", JSON.stringify(appLaunchConfig));
  }, [appLaunchConfig]);

  // Save notification config
  useEffect(() => {
    localStorage.setItem("bayController_notificationConfig", JSON.stringify(notificationConfig));
  }, [notificationConfig]);

  // Check for customer notifications based on booking end time
  useEffect(() => {
    if (!notificationConfig.enabled || !activeBooking || !isElectron) {
      return;
    }

    const checkNotifications = async () => {
      const now = new Date();
      const endTime = parseISO(`${activeBooking.booking_date}T${activeBooking.end_time}`);
      const minutesRemaining = (endTime.getTime() - now.getTime()) / (1000 * 60);

      // Check each notification trigger
      for (const notification of notificationConfig.notifications) {
        if (!notification.enabled) continue;

        const notificationKey = `${activeBooking.id}-${notification.id}`;
        
        // Check if we should show this notification (within 30 seconds of the trigger time)
        if (minutesRemaining <= notification.minutesBefore && 
            minutesRemaining > notification.minutesBefore - 0.5 &&
            !shownNotifications.has(notificationKey)) {
          
          // Get customer first name from booking
          const firstName = activeBooking.customer_name?.split(' ')[0] || 'Guest';
          const message = notification.message.replace('{firstName}', firstName);
          
          // Show notification popup on configured display using Electron API
          if (window.electronAPI && notificationConfig.displayLabel) {
            try {
              await window.electronAPI.showNotificationPopup(
                message,
                notificationConfig.displayLabel,
                60000 // 1 minute duration
              );
              console.log(`Showing notification popup: ${notification.id} for booking ${activeBooking.id} on display ${notificationConfig.displayLabel}`);
            } catch (err) {
              console.error('Failed to show notification popup:', err);
            }
          }
          
          setShownNotifications(prev => new Set([...prev, notificationKey]));
        }
      }
    };

    // Check every 5 seconds
    const interval = setInterval(checkNotifications, 5000);
    checkNotifications(); // Check immediately

    return () => clearInterval(interval);
  }, [activeBooking, notificationConfig, shownNotifications, isElectron]);

  // Reset shown notifications when booking changes
  useEffect(() => {
    if (activeBooking) {
      // Only clear notifications that aren't for the current booking
      setShownNotifications(prev => {
        const currentBookingNotifications = new Set<string>();
        prev.forEach(key => {
          if (key.startsWith(activeBooking.id)) {
            currentBookingNotifications.add(key);
          }
        });
        return currentBookingNotifications;
      });
    }
  }, [activeBooking?.id]);

  // Helper function to calculate if plugs should be on based on bookings
  const calculateShouldPlugsBeOn = useCallback(() => {
    const now = new Date();
    const today = format(now, "yyyy-MM-dd");
    const todaysBookings = bookings.filter(b => b.booking_date === today && b.status === 'confirmed');
    
    let shouldBeOn = false;
    let currentBooking: Booking | null = null;

    for (const booking of todaysBookings) {
      const startTime = parseISO(`${booking.booking_date}T${booking.start_time}`);
      const endTime = parseISO(`${booking.booking_date}T${booking.end_time}`);
      const preStartTime = addMinutes(startTime, -preStartMinutes);

      if (isAfter(now, preStartTime) && isBefore(now, endTime)) {
        shouldBeOn = true;
        currentBooking = booking;
      }

      // Check for back-to-back bookings
      const nextBooking = todaysBookings.find(b => 
        b.id !== booking.id && 
        b.start_time === booking.end_time
      );
      
      if (nextBooking && isAfter(now, preStartTime)) {
        const nextEndTime = parseISO(`${nextBooking.booking_date}T${nextBooking.end_time}`);
        if (isBefore(now, nextEndTime)) {
          shouldBeOn = true;
        }
      }
    }

    return { shouldBeOn, currentBooking };
  }, [bookings, preStartMinutes]);

  // Track previous bookings to detect cancellations
  const previousBookingsRef = useRef<Booking[]>([]);

  // Check for active booking and manage plugs
  useEffect(() => {
    const now = currentTime;
    const today = format(now, "yyyy-MM-dd");
    const todaysBookings = bookings.filter(b => b.booking_date === today && b.status === 'confirmed');
    
    const { shouldBeOn, currentBooking } = calculateShouldPlugsBeOn();

    setActiveBooking(currentBooking);

    // Detect if a booking was cancelled/removed
    const prevBookingIds = previousBookingsRef.current.map(b => b.id);
    const currentBookingIds = bookings.map(b => b.id);
    const removedBookings = prevBookingIds.filter(id => !currentBookingIds.includes(id));
    
    if (removedBookings.length > 0) {
      console.log('Booking(s) removed/cancelled:', removedBookings);
      
      // Check if ANY of the removed bookings was an active/current booking (not a future one)
      // An active booking is one that was controlling the plugs (within pre-start to end time)
      const removedActiveBookings = previousBookingsRef.current.filter(b => {
        if (!removedBookings.includes(b.id)) return false;
        if (b.booking_date !== today) return false;
        
        const startTime = parseISO(`${b.booking_date}T${b.start_time}`);
        const endTime = parseISO(`${b.booking_date}T${b.end_time}`);
        const preStartTime = addMinutes(startTime, -preStartMinutes);
        
        // Was this booking currently active (within pre-start to end)?
        return isAfter(now, preStartTime) && isBefore(now, endTime);
      });
      
      // Only turn off plugs if an ACTIVE booking was cancelled AND manual override is not on
      if (removedActiveBookings.length > 0 && !manualOverride) {
        console.log('Active booking(s) cancelled - checking if plugs should turn off');
        if (!shouldBeOn && (plugsStatus.monitor || plugsStatus.projector)) {
          console.log('No other active bookings - turning off plugs');
          turnOffPlugs(false, false);
        }
      } else if (removedBookings.length > 0) {
        console.log('Cancelled booking was in the future, not affecting plugs');
      }
    }
    
    // Update previous bookings ref
    previousBookingsRef.current = [...bookings];

    // Control plugs based on booking state - ONLY if manual override is not active
    if (!manualOverride) {
      if (shouldBeOn && (!plugsStatus.monitor || !plugsStatus.projector)) {
        turnOnPlugs(false, false);
      } else if (!shouldBeOn && (plugsStatus.monitor || plugsStatus.projector)) {
        turnOffPlugs(false, false);
      }
    }

    // Check for warnings
    if (currentBooking) {
      const endTime = parseISO(`${currentBooking.booking_date}T${currentBooking.end_time}`);
      const minutesRemaining = Math.floor((endTime.getTime() - now.getTime()) / 60000);

      if (warningMinutes.includes(minutesRemaining)) {
        const key = `${currentBooking.id}-${minutesRemaining}`;
        if (!shownNotifications.has(key)) {
          setShownNotifications(prev => {
            const next = new Set(prev);
            next.add(key);
            return next;
          });
          showWarningNotification(minutesRemaining, currentBooking);
        }
      }
    }
  }, [currentTime, bookings, preStartMinutes, manualOverride, calculateShouldPlugsBeOn]);

  // Resume auto function - checks current booking state and controls plugs accordingly
  const resumeAuto = useCallback(() => {
    console.log('Resuming auto control...');
    setManualOverride(false);
    
    const { shouldBeOn } = calculateShouldPlugsBeOn();
    console.log('Current booking state - should plugs be on:', shouldBeOn);
    
    if (shouldBeOn) {
      turnOnPlugs(false, true); // Auto control, show toast
    } else {
      turnOffPlugs(false, true); // Auto control, show toast
    }
  }, [calculateShouldPlugsBeOn]);

  // Save TAPO credentials whenever they change
  useEffect(() => {
    if (tapoEmail) {
      localStorage.setItem("bayController_tapoEmail", tapoEmail);
    }
    if (tapoPassword) {
      localStorage.setItem("bayController_tapoPassword", tapoPassword);
    }
  }, [tapoEmail, tapoPassword]);

  // Persist appsRunning state so auto-close works after page refresh
  useEffect(() => {
    localStorage.setItem("bayController_appsRunning", appsRunning.toString());
  }, [appsRunning]);

  // Add a plug manually
  const addPlugManually = () => {
    if (!newPlugName.trim() || !newPlugIp.trim()) {
      toast.error("Please enter both plug name and IP address");
      return;
    }
    
    // Validate IP format
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (!ipRegex.test(newPlugIp.trim())) {
      toast.error("Please enter a valid IP address (e.g., 192.168.1.100)");
      return;
    }
    
    const newPlug: TapoPlug = {
      id: `manual-${Date.now()}`,
      name: newPlugName.trim(),
      ip: newPlugIp.trim(),
      isOn: false,
      type: newPlugType
    };
    
    setDiscoveredPlugs(prev => {
      const updated = [...prev, newPlug];
      // Save to localStorage immediately
      localStorage.setItem("bayController_discoveredPlugs", JSON.stringify(updated));
      return updated;
    });
    setNewPlugName("");
    setNewPlugIp("");
    setNewPlugType('monitor');
    toast.success(`Added ${newPlugType} plug: ${newPlug.name}`);
  };

  // Test TAPO login credentials
  const testTapoLogin = async () => {
    if (!isElectron || !window.electronAPI) {
      toast.error("Login test requires desktop app");
      return;
    }
    
    if (!tapoEmail || !tapoPassword) {
      toast.error("Please enter your TAPO email and password");
      return;
    }
    
    setIsTestingLogin(true);
    setLoginTestResult(null);
    
    try {
      const result = await window.electronAPI.tapoTestLogin(tapoEmail, tapoPassword);
      
      if (result.success) {
        setLoginTestResult({ success: true, message: "Login successful! Credentials are valid." });
        toast.success("TAPO login successful!");
      } else {
        setLoginTestResult({ success: false, message: result.error || "Login failed" });
        toast.error(`Login failed: ${result.error}`);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      setLoginTestResult({ success: false, message: errorMsg });
      toast.error(`Login test error: ${errorMsg}`);
    } finally {
      setIsTestingLogin(false);
    }
  };

  const turnOnPlugs = async (isManual = false, showToast = true) => {
    console.log("Turning ON plugs for bay:", selectedBay, isManual ? "(MANUAL)" : "(AUTO)");
    
    // Set manual override when manually controlling
    if (isManual) {
      setManualOverride(true);
    }
    
    if (isElectron && window.electronAPI && selectedBay) {
      const bayPlugs = getAssignedPlugsForBay(selectedBay);
      console.log("Assigned plugs for bay:", JSON.stringify(bayPlugs, null, 2));
      
      if (bayPlugs.length === 0) {
        console.warn("No plugs assigned to this bay!");
        if (showToast) toast.warning("No plugs assigned to this bay");
        return;
      }
      
      // Validate credentials
      if (!tapoEmail || !tapoPassword) {
        if (showToast) toast.error("TAPO credentials not configured");
        return;
      }
      
      const newStatus = { monitor: false, projector: false };
      
      for (const plug of bayPlugs) {
        // Validate plug data
        if (!plug.ip || typeof plug.ip !== 'string' || plug.ip.trim() === '') {
          console.error(`Invalid IP for plug ${plug.name}:`, plug);
          if (showToast) toast.error(`Invalid IP address for ${plug.name || 'plug'}`);
          continue;
        }
        
        const cleanIp = plug.ip.trim();
        console.log(`Attempting to turn ON plug: ${plug.name} (${plug.type}) at ${cleanIp}`);
        console.log(`Using credentials: email=${tapoEmail}, password=${tapoPassword ? '***' : 'MISSING'}`);
        
        try {
          const result = await window.electronAPI.controlPlug(tapoEmail, tapoPassword, cleanIp, 'on');
          console.log(`Control result for ${plug.name}:`, result);
          if (!result.success) {
            if (showToast) toast.error(`Failed to turn on ${plug.name}: ${result.error}`);
          } else {
            if (showToast) toast.success(`Turned ON: ${plug.name}`);
            newStatus[plug.type] = true;
          }
        } catch (error) {
          console.error(`Failed to turn on ${plug.name}:`, error);
          if (showToast) toast.error(`Error controlling ${plug.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
      
      setPlugsStatus(newStatus);
    } else {
      console.log("Not in Electron or no bay selected");
      setPlugsStatus({ monitor: true, projector: true });
    }
  };

  const turnOffPlugs = async (isManual = false, showToast = true) => {
    console.log("Turning OFF plugs for bay:", selectedBay, isManual ? "(MANUAL)" : "(AUTO)");
    
    // Set manual override when manually controlling
    if (isManual) {
      setManualOverride(true);
    }
    
    if (isElectron && window.electronAPI && selectedBay) {
      const bayPlugs = getAssignedPlugsForBay(selectedBay);
      console.log("Assigned plugs for bay:", bayPlugs);
      
      if (bayPlugs.length === 0) {
        console.warn("No plugs assigned to this bay!");
        return;
      }
      
      const newStatus = { monitor: false, projector: false };
      
      for (const plug of bayPlugs) {
        console.log(`Attempting to turn OFF plug: ${plug.name} (${plug.type}) at ${plug.ip}`);
        try {
          const result = await window.electronAPI.controlPlug(tapoEmail, tapoPassword, plug.ip, 'off');
          console.log(`Control result for ${plug.name}:`, result);
          if (!result.success) {
            if (showToast) toast.error(`Failed to turn off ${plug.name}: ${result.error}`);
            // Keep as on if failed
            newStatus[plug.type] = true;
          } else {
            if (showToast) toast.success(`Turned OFF: ${plug.name}`);
          }
        } catch (error) {
          console.error(`Failed to turn off ${plug.name}:`, error);
          if (showToast) toast.error(`Error controlling ${plug.name}`);
          newStatus[plug.type] = true;
        }
      }
      
      setPlugsStatus(newStatus);
    } else {
      setPlugsStatus({ monitor: false, projector: false });
    }
  };

  const showWarningNotification = (minutes: number, booking: Booking) => {
    if (!notificationConfig.enabled) return;

    const matchingConfig = notificationConfig.notifications.find(
      (n) => n.enabled && n.minutesBefore === minutes
    );
    if (!matchingConfig) return;

    const firstName = booking.customer_name?.split(" ")[0] || "there";
    const message = matchingConfig.message.replace("{firstName}", firstName);

    if (isElectron && window.electronAPI) {
      window.electronAPI
        .showNotificationPopup(message, notificationConfig.displayLabel, 60_000)
        .catch((err) => {
          console.error("Failed to show notification popup:", err);
        });
    } else {
      console.log(`[Notification] ${minutes} minute warning:`, message);
    }
  };

  const assignPlugToBay = (plug: TapoPlug, bayNumber: number) => {
    setBayPlugAssignments(prev => {
      const existing = prev.find(a => a.bayNumber === bayNumber);
      if (existing) {
        // Add plug to existing bay assignment if not already there
        if (!existing.plugs.find(p => p.id === plug.id)) {
          return prev.map(a => 
            a.bayNumber === bayNumber 
              ? { ...a, plugs: [...a.plugs, plug] }
              : a
          );
        }
        return prev;
      } else {
        // Create new bay assignment
        return [...prev, { bayNumber, plugs: [plug] }];
      }
    });
    toast.success(`${plug.name} assigned to Bay ${bayNumber}`);
  };

  const removePlugFromBay = (plugId: string, bayNumber: number) => {
    setBayPlugAssignments(prev => 
      prev.map(a => 
        a.bayNumber === bayNumber 
          ? { ...a, plugs: a.plugs.filter(p => p.id !== plugId) }
          : a
      ).filter(a => a.plugs.length > 0)
    );
  };

  const isPlugAssigned = (plugId: string): boolean => {
    return bayPlugAssignments.some(a => a.plugs.some(p => p.id === plugId));
  };

  const getAssignedPlugsForBay = (bayNumber: number): TapoPlug[] => {
    return bayPlugAssignments.find(a => a.bayNumber === bayNumber)?.plugs || [];
  };

  const unassignedPlugs = discoveredPlugs.filter(p => !isPlugAssigned(p.id));

  // App Launch Functions

  const launchApps = async () => {
    if (!isElectron || !window.electronAPI) {
      toast.error("App launch requires desktop app");
      return;
    }

    // Perform a fresh display check before launching
    try {
      const currentDisplays = await window.electronAPI.getDisplays();
      const currentLabels = new Set(currentDisplays.map(d => d.label));
      
      // Update our display state with the fresh list
      setDisplays(currentDisplays);
      
      // CRITICAL: Verify configured displays actually exist
      const gsproConfigured = appLaunchConfig.gsproDisplayLabel;
      const proteeConfigured = appLaunchConfig.proteeDisplayLabel;
      
      const missingDisplays: string[] = [];
      
      if (gsproConfigured && !currentLabels.has(gsproConfigured)) {
        missingDisplays.push(`GSPRO display "${gsproConfigured}"`);
      }
      
      if (proteeConfigured && !currentLabels.has(proteeConfigured)) {
        missingDisplays.push(`Protee display "${proteeConfigured}"`);
      }
      
      if (missingDisplays.length > 0) {
        toast.error(`Launch cancelled - Missing: ${missingDisplays.join(', ')}`);
        addLog(`Launch cancelled - configured displays not found: ${missingDisplays.join(', ')}`, 'error');
        addLog(`Available displays: ${Array.from(currentLabels).join(', ')}`, 'info');
        return;
      }
      
      addLog(`Display check passed. Available: ${Array.from(currentLabels).join(', ')}`, 'success');
    } catch (err) {
      console.error("Failed to check displays before launch:", err);
      toast.error("Failed to verify displays - launch cancelled");
      return;
    }

    setIsLaunchingApps(true);
    setAppLaunchStatus("Starting app launch sequence...");
    addLog("Starting app launch sequence...", 'info');

    try {
      // Re-fetch displays to get fresh indices after state update
      const freshDisplays = await window.electronAPI.getDisplays();
      
      // Find display indices from labels (monitor names)
      const gsproDisplayIndex = freshDisplays.findIndex(d => d.label === appLaunchConfig.gsproDisplayLabel);
      const proteeDisplayIndex = freshDisplays.findIndex(d => d.label === appLaunchConfig.proteeDisplayLabel);
      
      const launchConfig = {
        gsproPath: appLaunchConfig.gsproPath,
        proteeLabsPath: appLaunchConfig.proteeLabsPath,
        gsproDisplay: gsproDisplayIndex >= 0 ? gsproDisplayIndex : 0,
        proteeDisplay: proteeDisplayIndex >= 0 ? proteeDisplayIndex : 0,
        postLaunchDelay: 3000
      };
      
      addLog(`GSPRO Path: ${launchConfig.gsproPath}`, 'info');
      addLog(`Protee Path: ${launchConfig.proteeLabsPath || 'NOT SET'}`, launchConfig.proteeLabsPath ? 'info' : 'error');
      addLog(`GSPRO Display: ${gsproDisplayIndex >= 0 ? appLaunchConfig.gsproDisplayLabel : 'default (0)'}`, 'info');
      addLog(`Protee Display: ${proteeDisplayIndex >= 0 ? appLaunchConfig.proteeDisplayLabel : 'default (0)'}`, 'info');
      
      const result = await window.electronAPI.runAppSequence(launchConfig);
      
      if (result.cancelled) {
        setAppLaunchStatus("Launch cancelled");
        addLog("Launch cancelled by user", 'info');
        toast.info("App launch cancelled");
      } else if (result.success) {
        setAppsRunning(true);
        setAppLaunchStatus("All apps launched successfully");
        addLog("All apps launched successfully!", 'success');
        toast.success("Apps launched successfully");
        
        // Log results
        result.results?.forEach(r => {
          addLog(`${r.step}: ${r.status || 'complete'}`, r.status === 'error' ? 'error' : 'success');
        });
        
        // Fix GSPRO position 5 seconds after launch (opens fullscreen immediately)
        addLog("Scheduling GSPRO position fix in 5 seconds...", 'info');
        setTimeout(async () => {
          try {
            addLog("Fixing GSPRO window position...", 'info');
            
            const currentDisplays = await window.electronAPI!.getDisplays();
            const gsproIdx = currentDisplays.findIndex(d => d.label === appLaunchConfig.gsproDisplayLabel);
            
            if (gsproIdx < 0) {
              addLog("GSPRO position fix skipped - display not available", 'error');
              return;
            }
            
            // Only fix GSPRO (pass -1 for protee to skip it)
            const posResult = await window.electronAPI!.checkWindowPositions(gsproIdx, -1);
            
            if (posResult.success && posResult.results) {
              const gsproResult = posResult.results.find(r => r.app === 'GSPRO');
              if (gsproResult?.found && gsproResult?.moved) {
                addLog(`Moved GSPRO to display ${gsproResult.display}`, 'success');
                toast.success("GSPRO positioned");
              } else if (gsproResult?.found) {
                addLog("GSPRO already on correct display", 'info');
              } else {
                addLog("GSPRO window not found yet", 'error');
              }
            }
          } catch (err) {
            addLog(`GSPRO position fix failed: ${err}`, 'error');
          }
        }, 5000);

        // Fix Protee Labs position 20 seconds after launch (takes longer to open)
        addLog("Scheduling Protee Labs position fix in 20 seconds...", 'info');
        setTimeout(async () => {
          try {
            addLog("Fixing Protee Labs window position...", 'info');
            
            const currentDisplays = await window.electronAPI!.getDisplays();
            const proteeIdx = currentDisplays.findIndex(d => d.label === appLaunchConfig.proteeDisplayLabel);
            
            if (proteeIdx < 0) {
              addLog("Protee Labs position fix skipped - display not available", 'error');
              return;
            }
            
            // Only fix Protee Labs (pass -1 for gspro to skip it)
            const posResult = await window.electronAPI!.checkWindowPositions(-1, proteeIdx);
            
            if (posResult.success && posResult.results) {
              const proteeResult = posResult.results.find(r => r.app === 'ProteeLabs');
              if (proteeResult?.found && proteeResult?.moved) {
                addLog(`Moved Protee Labs to display ${proteeResult.display}`, 'success');
                toast.success("Protee Labs positioned");
              } else if (proteeResult?.found) {
                addLog("Protee Labs already on correct display", 'info');
              } else {
                addLog("Protee Labs window not found yet", 'error');
              }
            }
          } catch (err) {
            addLog(`Protee Labs position fix failed: ${err}`, 'error');
          }
        }, 20000);
      } else {
        setAppLaunchStatus(`Launch failed: ${result.error}`);
        addLog(`Launch failed: ${result.error}`, 'error');
        result.results?.forEach(r => {
          addLog(`${r.step}: ${r.status || r.error || 'unknown'}`, 'error');
        });
        toast.error(`Launch failed: ${result.error}`);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      setAppLaunchStatus(`Error: ${errorMsg}`);
      addLog(`Exception: ${errorMsg}`, 'error');
      toast.error(`Launch error: ${errorMsg}`);
    } finally {
      setIsLaunchingApps(false);
    }
  };

  const cancelAppLaunch = async () => {
    if (!isElectron || !window.electronAPI) return;
    
    try {
      await window.electronAPI.cancelAppSequence();
      toast.info("Cancelling app launch...");
    } catch (error) {
      console.error("Failed to cancel:", error);
    }
  };

  const closeApps = async () => {
    if (!isElectron || !window.electronAPI) {
      toast.error("App control requires desktop app");
      return;
    }

    try {
      const result = await window.electronAPI.closeApps(["GSPro.exe", "ProteeLabs.exe"]);
      if (result.success) {
        setAppsRunning(false);
        setAppLaunchStatus(null);
        toast.info("Apps closed");
      }
    } catch (error) {
      toast.error("Failed to close apps");
    }
  };

  // Removed fixWindowPositions and listAllWindows - no longer needed

  const updateAppConfig = (key: keyof AppLaunchConfig, value: any) => {
    setAppLaunchConfig(prev => ({ ...prev, [key]: value }));
  };

  // Auto-launch apps based on booking time (separate effect after functions are defined)
  // CRITICAL: Apps close X seconds BEFORE booking ends to ensure they close while screens are still on
  useEffect(() => {
    if (!appLaunchConfig.enabled || !isElectron || bookings.length === 0) return;

    const now = currentTime;
    const today = format(now, "yyyy-MM-dd");
    const todaysBookings = bookings.filter(b => b.booking_date === today && b.status === 'confirmed');
    
    let shouldLaunchApps = false;
    let shouldCloseApps = false;

    for (const booking of todaysBookings) {
      const startTime = parseISO(`${booking.booking_date}T${booking.start_time}`);
      const endTime = parseISO(`${booking.booking_date}T${booking.end_time}`);
      const appLaunchTime = addMinutes(startTime, -appLaunchConfig.appLaunchMinutes);
      
      // Close apps X seconds before booking ends (while screens are still on)
      const appCloseTime = new Date(endTime.getTime() - (appLaunchConfig.appCloseSeconds * 1000));

      // Should launch if we're past launch time but before close time
      if (isAfter(now, appLaunchTime) && isBefore(now, appCloseTime)) {
        shouldLaunchApps = true;
      }
      
      // Should close if we're past close time but still before end time (plugs still on)
      if (isAfter(now, appCloseTime) && isBefore(now, endTime)) {
        shouldCloseApps = true;
      }

      // Check for back-to-back - keep apps running through consecutive bookings
      const nextBooking = todaysBookings.find(b => b.id !== booking.id && b.start_time === booking.end_time);
      if (nextBooking) {
        const nextEndTime = parseISO(`${nextBooking.booking_date}T${nextBooking.end_time}`);
        const nextAppCloseTime = new Date(nextEndTime.getTime() - (appLaunchConfig.appCloseSeconds * 1000));
        
        // If there's a back-to-back, don't close until the last booking's close time
        if (isBefore(now, nextAppCloseTime)) {
          shouldLaunchApps = true;
          shouldCloseApps = false; // Override close since there's a next booking
        }
      }
    }

    if (shouldLaunchApps && !appsRunning && !isLaunchingApps) {
      launchApps();
    } else if (shouldCloseApps && appsRunning) {
      console.log(`Closing apps ${appLaunchConfig.appCloseSeconds}s before booking ends (while screens still on)`);
      closeApps();
    } else if (!shouldLaunchApps && !shouldCloseApps && appsRunning) {
      // Fallback: close apps if no active booking window at all
      closeApps();
    }
  }, [currentTime, bookings, appLaunchConfig.enabled, appLaunchConfig.appLaunchMinutes, appLaunchConfig.appCloseSeconds, appsRunning, isLaunchingApps, isElectron]);

  // Password screen
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
              <Lock className="w-8 h-8 text-primary" />
            </div>
            <CardTitle className="text-2xl">Bay Controller</CardTitle>
            <p className="text-muted-foreground">Enter password to access</p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  autoFocus
                />
                {passwordError && (
                  <p className="text-sm text-destructive">{passwordError}</p>
                )}
              </div>
              <Button type="submit" className="w-full">
                Unlock
              </Button>
            </form>
            <p className="text-xs text-muted-foreground text-center mt-4">
              Version {APP_VERSION}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Bay selection screen
  if (!selectedBay) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">Select Bay</CardTitle>
            <p className="text-muted-foreground">Choose which bay this controller manages</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {[1, 2, 3, 4, 5, 6].map((bay) => (
                <Button
                  key={bay}
                  variant="outline"
                  size="lg"
                  className="h-20 text-xl font-bold"
                  onClick={() => setSelectedBay(bay)}
                >
                  Bay {bay}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Main controller view
  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-4xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">Bay {selectedBay}</h1>
            <Badge variant={connectionStatus === "connected" ? "default" : "destructive"}>
              {connectionStatus === "connected" ? (
                <><CheckCircle className="w-3 h-3 mr-1" /> Connected</>
              ) : connectionStatus === "connecting" ? (
                <><RefreshCw className="w-3 h-3 mr-1 animate-spin" /> Connecting</>
              ) : (
                <><XCircle className="w-3 h-3 mr-1" /> Disconnected</>
              )}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-lg font-mono">{format(currentTime, "HH:mm:ss")}</span>
            <Button variant="ghost" size="icon" onClick={() => setShowSettings(!showSettings)}>
              <Settings className="w-5 h-5" />
            </Button>
            <Button variant="ghost" size="icon" onClick={fetchBookings} disabled={isLoadingBookings}>
              <RefreshCw className={`w-5 h-5 ${isLoadingBookings ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        {/* Settings Panel */}
        {showSettings && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* TAPO Credentials */}
              <div className="space-y-2">
                <Label>TAPO Cloud Credentials</Label>
                <p className="text-sm text-muted-foreground">
                  {isElectron ? "Enter your Tapo app login to control plugs" : "Desktop app required for real plug control"}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    type="email"
                    placeholder="Tapo Email"
                    value={tapoEmail}
                    onChange={(e) => setTapoEmail(e.target.value)}
                    disabled={!isElectron}
                  />
                  <Input
                    type="password"
                    placeholder="Tapo Password"
                    value={tapoPassword}
                    onChange={(e) => setTapoPassword(e.target.value)}
                    disabled={!isElectron}
                  />
                </div>
                {isElectron && (
                  <div className="space-y-2">
                    <Button 
                      onClick={testTapoLogin}
                      disabled={isTestingLogin || !tapoEmail || !tapoPassword}
                      variant="outline"
                      size="sm"
                      className="w-full"
                    >
                      {isTestingLogin ? (
                        <><RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Testing...</>
                      ) : (
                        <><TestTube className="w-4 h-4 mr-2" /> Test TAPO Login</>
                      )}
                    </Button>
                    {loginTestResult && (
                      <div className={`p-2 rounded text-sm ${loginTestResult.success ? 'bg-green-500/10 text-green-600' : 'bg-red-500/10 text-red-600'}`}>
                        {loginTestResult.success ? (
                          <div className="flex items-center gap-2">
                            <CheckCircle className="w-4 h-4" />
                            {loginTestResult.message}
                          </div>
                        ) : (
                          <div className="flex items-start gap-2">
                            <XCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                            <span>{loginTestResult.message}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
                {!isElectron && (
                  <p className="text-xs text-amber-500">
                    Running in browser - plug control is simulated. Install the desktop app for real control.
                  </p>
                )}
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <Label>Pre-start time (minutes)</Label>
                  <p className="text-sm text-muted-foreground">Turn on plugs before booking starts</p>
                </div>
                <Select value={preStartMinutes.toString()} onValueChange={(v) => setPreStartMinutes(parseInt(v))}>
                  <SelectTrigger className="w-24">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 5, 10].map((min) => (
                      <SelectItem key={min} value={min.toString()}>{min} min</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Separator />
              <div>
                <Label>Change Bay</Label>
                <Button 
                  variant="outline" 
                  className="w-full mt-2"
                  onClick={() => setSelectedBay(null)}
                >
                  Select Different Bay
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Current Status */}
        <Card className={activeBooking ? "border-primary" : ""}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Power className={`w-5 h-5 ${plugsStatus.monitor ? "text-green-500" : "text-muted-foreground"}`} />
              Equipment Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                <span>Monitor</span>
                <Badge variant={plugsStatus.monitor ? "default" : "secondary"}>
                  {plugsStatus.monitor ? "ON" : "OFF"}
                </Badge>
              </div>
              <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                <span>Projector</span>
                <Badge variant={plugsStatus.projector ? "default" : "secondary"}>
                  {plugsStatus.projector ? "ON" : "OFF"}
                </Badge>
              </div>
            </div>
            {activeBooking && (
              <div className="mt-4 p-3 bg-primary/10 rounded-lg">
                <p className="font-medium">{activeBooking.customer_name || 'Active Booking'}</p>
                <p className="text-sm text-muted-foreground">
                  {activeBooking.start_time.slice(0, 5)} - {activeBooking.end_time.slice(0, 5)}
                  {" "}({activeBooking.duration_hours}h, {activeBooking.player_count} player{activeBooking.player_count > 1 ? "s" : ""})
                </p>
              </div>
            )}
            <div className="flex gap-2 mt-4">
              <Button onClick={() => turnOnPlugs(true)} disabled={plugsStatus.monitor && plugsStatus.projector} className="flex-1">
                <Power className="w-4 h-4 mr-2" /> Turn On
              </Button>
              <Button onClick={() => turnOffPlugs(true)} disabled={!plugsStatus.monitor && !plugsStatus.projector} variant="outline" className="flex-1">
                <Power className="w-4 h-4 mr-2" /> Turn Off
              </Button>
            </div>
            {manualOverride && (
              <p className="text-xs text-muted-foreground mt-2">
                Manual override active - auto-control paused.{" "}
                <button 
                  className="text-primary underline" 
                  onClick={resumeAuto}
                >
                  Resume auto
                </button>
              </p>
            )}
          </CardContent>
        </Card>

        {/* TAPO Smart Plugs - Collapsible */}
        <CollapsibleSettingsCard title="TAPO Smart Plugs" icon={<Wifi className="w-5 h-5" />} defaultOpen={true}>
          {/* Assigned plugs for this bay */}
          {selectedBay && getAssignedPlugsForBay(selectedBay).length > 0 && (
            <div className="space-y-2">
              <Label>Assigned to Bay {selectedBay}</Label>
              {getAssignedPlugsForBay(selectedBay).map((plug) => (
                <div key={plug.id} className="flex items-center justify-between p-3 bg-primary/10 border border-primary/20 rounded-lg">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{plug.name}</p>
                      <Badge variant="outline" className="text-xs capitalize">{plug.type}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{plug.ip}</p>
                  </div>
                  <Button 
                    size="sm" 
                    variant="ghost"
                    onClick={() => removePlugFromBay(plug.id, selectedBay)}
                  >
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Manual plug entry */}
          <div className="space-y-3 p-3 bg-muted/50 rounded-lg border border-dashed">
            <p className="text-xs text-muted-foreground">
              Find plug IPs in your router admin page or TAPO mobile app (Device Settings → Device Info)
            </p>
            <div className="grid grid-cols-3 gap-2">
              <Input
                placeholder="Name (e.g., Bay 1)"
                value={newPlugName}
                onChange={(e) => setNewPlugName(e.target.value)}
              />
              <Input
                placeholder="IP (e.g., 192.168.5.141)"
                value={newPlugIp}
                onChange={(e) => setNewPlugIp(e.target.value)}
              />
              <Select value={newPlugType} onValueChange={(v) => setNewPlugType(v as 'monitor' | 'projector')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monitor">Monitor</SelectItem>
                  <SelectItem value="projector">Projector</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={addPlugManually} size="sm" variant="outline" className="w-full">
              Add Plug
            </Button>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex-1">
              <p className="text-sm text-muted-foreground">
                {getAssignedPlugsForBay(selectedBay || 0).length} plug(s) assigned to this bay
              </p>
            </div>
          </div>
          
          {/* Unassigned plugs */}
          {unassignedPlugs.length > 0 && (
            <div className="space-y-2">
              <Label>Available Plugs ({unassignedPlugs.length})</Label>
              {unassignedPlugs.map((plug) => (
                <div key={plug.id} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{plug.name}</p>
                      <Badge variant="outline" className="text-xs capitalize">{plug.type}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{plug.ip}</p>
                  </div>
                  <Select onValueChange={(value) => assignPlugToBay(plug, parseInt(value))}>
                    <SelectTrigger className="w-32">
                      <SelectValue placeholder="Add to Bay" />
                    </SelectTrigger>
                    <SelectContent>
                      {[1, 2, 3, 4, 5, 6].map((bay) => (
                        <SelectItem key={bay} value={bay.toString()}>Bay {bay}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          )}

          {discoveredPlugs.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-2">
              No plugs added yet. Add plugs manually using IP addresses above.
            </p>
          )}
        </CollapsibleSettingsCard>

        {/* App Launch - Collapsible, at bottom */}
        <CollapsibleSettingsCard title="App Launch" icon={<Monitor className="w-5 h-5" />} defaultOpen={false}>
          {/* Enable/Disable toggle */}
          <div className="flex items-center justify-between">
            <div>
              <Label>Auto-launch apps</Label>
              <p className="text-sm text-muted-foreground">
                Launch {appLaunchConfig.appLaunchMinutes}min before, close {appLaunchConfig.appCloseSeconds}s before end
              </p>
            </div>
            <Switch
              checked={appLaunchConfig.enabled}
              onCheckedChange={(checked) => updateAppConfig("enabled", checked)}
            />
          </div>

          <Separator />

          {/* App status */}
          <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
            <div>
              <p className="font-medium">App Status</p>
              <p className="text-sm text-muted-foreground">
                {appLaunchStatus || (appsRunning ? "Apps running" : "Apps not running")}
              </p>
            </div>
            <Badge variant={appsRunning ? "default" : "secondary"}>
              {appsRunning ? "Running" : "Stopped"}
            </Badge>
          </div>

          {/* Manual controls */}
          <div className="flex gap-2">
            {isLaunchingApps ? (
              <Button 
                onClick={cancelAppLaunch}
                variant="destructive"
                className="flex-1"
              >
                <XCircle className="w-4 h-4 mr-2" /> Cancel Launch
              </Button>
            ) : (
              <Button 
                onClick={launchApps} 
                disabled={appsRunning || !isElectron}
                className="flex-1"
              >
                <Play className="w-4 h-4 mr-2" /> Launch Apps
              </Button>
            )}
            <Button 
              onClick={closeApps} 
              disabled={!appsRunning || !isElectron}
              variant="outline" 
              className="flex-1"
            >
              <Square className="w-4 h-4 mr-2" /> Close Apps
            </Button>
          </div>

          {!isElectron && (
            <p className="text-xs text-amber-500 text-center">
              App launch requires the desktop application
            </p>
          )}

          <Separator />

          {/* Configuration */}
          <div className="space-y-3">
            <Label>Configuration</Label>
            
            {/* GSPRO Path */}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">GSPRO Path</Label>
              <div className="flex gap-2">
                <Input
                  value={appLaunchConfig.gsproPath}
                  onChange={(e) => updateAppConfig("gsproPath", e.target.value)}
                  placeholder="C:\Program Files\GSPro\GSPro.exe"
                  className="flex-1 text-xs"
                />
              </div>
            </div>

            {/* Protee Labs Path */}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Protee Labs Path</Label>
              <div className="flex gap-2">
                <Input
                  value={appLaunchConfig.proteeLabsPath}
                  onChange={(e) => updateAppConfig("proteeLabsPath", e.target.value)}
                  placeholder="C:\Program Files\Protee Labs\ProteeLabs.exe"
                  className="flex-1 text-xs"
                />
              </div>
            </div>

            {/* Display assignment - uses monitor name for reliable matching */}
            {/* Shows saved config + availability status, auto-resolves when displays reconnect */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground flex items-center gap-2">
                  GSPRO Display
                  {appLaunchConfig.gsproDisplayLabel && (
                    displays.some(d => d.label === appLaunchConfig.gsproDisplayLabel) 
                      ? <Badge variant="default" className="text-[10px] px-1 py-0">Available</Badge>
                      : <Badge variant="destructive" className="text-[10px] px-1 py-0">Offline</Badge>
                  )}
                </Label>
                <Select 
                  value={appLaunchConfig.gsproDisplayLabel} 
                  onValueChange={(v) => updateAppConfig("gsproDisplayLabel", v)}
                >
                  <SelectTrigger className="text-xs">
                    <SelectValue placeholder="Select display">
                      {appLaunchConfig.gsproDisplayLabel || "Select display"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {/* Show currently detected displays */}
                    {displays.map((d) => (
                      <SelectItem key={d.id} value={d.label}>
                        {d.label} {d.isPrimary ? "(Primary)" : ""}
                      </SelectItem>
                    ))}
                    {/* Show saved config if not in current displays list */}
                    {appLaunchConfig.gsproDisplayLabel && 
                     !displays.some(d => d.label === appLaunchConfig.gsproDisplayLabel) && (
                      <SelectItem value={appLaunchConfig.gsproDisplayLabel} className="text-muted-foreground">
                        {appLaunchConfig.gsproDisplayLabel} (Saved - Offline)
                      </SelectItem>
                    )}
                    {displays.length === 0 && !appLaunchConfig.gsproDisplayLabel && (
                      <SelectItem value="" disabled>No displays detected</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground flex items-center gap-2">
                  Protee Display (Touchscreen)
                  {appLaunchConfig.proteeDisplayLabel && (
                    displays.some(d => d.label === appLaunchConfig.proteeDisplayLabel) 
                      ? <Badge variant="default" className="text-[10px] px-1 py-0">Available</Badge>
                      : <Badge variant="destructive" className="text-[10px] px-1 py-0">Offline</Badge>
                  )}
                </Label>
                <Select 
                  value={appLaunchConfig.proteeDisplayLabel} 
                  onValueChange={(v) => updateAppConfig("proteeDisplayLabel", v)}
                >
                  <SelectTrigger className="text-xs">
                    <SelectValue placeholder="Select display">
                      {appLaunchConfig.proteeDisplayLabel || "Select display"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {/* Show currently detected displays */}
                    {displays.map((d) => (
                      <SelectItem key={d.id} value={d.label}>
                        {d.label} {d.isPrimary ? "(Primary)" : ""}
                      </SelectItem>
                    ))}
                    {/* Show saved config if not in current displays list */}
                    {appLaunchConfig.proteeDisplayLabel && 
                     !displays.some(d => d.label === appLaunchConfig.proteeDisplayLabel) && (
                      <SelectItem value={appLaunchConfig.proteeDisplayLabel} className="text-muted-foreground">
                        {appLaunchConfig.proteeDisplayLabel} (Saved - Offline)
                      </SelectItem>
                    )}
                    {displays.length === 0 && !appLaunchConfig.proteeDisplayLabel && (
                      <SelectItem value="" disabled>No displays detected</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Saved Configuration Summary */}
            <div className="p-3 bg-muted/50 border rounded-lg space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Saved Display Config</Label>
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={() => {
                    // Config is already auto-saved via useEffect, but this provides user confirmation
                    localStorage.setItem("bayController_appLaunchConfig", JSON.stringify(appLaunchConfig));
                    toast.success("Display configuration saved!");
                    addLog(`Config saved: GSPRO→${appLaunchConfig.gsproDisplayLabel}, Protee→${appLaunchConfig.proteeDisplayLabel}`, 'success');
                  }}
                  disabled={!appLaunchConfig.gsproDisplayLabel && !appLaunchConfig.proteeDisplayLabel}
                >
                  <CheckCircle className="w-3 h-3 mr-1" /> Save Config
                </Button>
              </div>
              
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">GSPRO:</span>
                  {appLaunchConfig.gsproDisplayLabel ? (
                    <span className="font-medium flex items-center gap-1">
                      {appLaunchConfig.gsproDisplayLabel}
                      {displays.some(d => d.label === appLaunchConfig.gsproDisplayLabel) 
                        ? <CheckCircle className="w-3 h-3 text-green-500" />
                        : <XCircle className="w-3 h-3 text-destructive" />
                      }
                    </span>
                  ) : (
                    <span className="text-muted-foreground italic">Not set</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Protee:</span>
                  {appLaunchConfig.proteeDisplayLabel ? (
                    <span className="font-medium flex items-center gap-1">
                      {appLaunchConfig.proteeDisplayLabel}
                      {displays.some(d => d.label === appLaunchConfig.proteeDisplayLabel) 
                        ? <CheckCircle className="w-3 h-3 text-green-500" />
                        : <XCircle className="w-3 h-3 text-destructive" />
                      }
                    </span>
                  ) : (
                    <span className="text-muted-foreground italic">Not set</span>
                  )}
                </div>
              </div>
              
              <p className="text-[10px] text-muted-foreground">
                {displays.some(d => d.label === appLaunchConfig.gsproDisplayLabel) && 
                 displays.some(d => d.label === appLaunchConfig.proteeDisplayLabel)
                  ? "✓ All configured displays are online - ready to launch"
                  : "⚠ Some configured displays are offline - apps will launch when all displays reconnect"
                }
              </p>
            </div>

            {/* App launch timing */}
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-xs text-muted-foreground">Launch apps before booking</Label>
              </div>
              <Select 
                value={appLaunchConfig.appLaunchMinutes.toString()} 
                onValueChange={(v) => updateAppConfig("appLaunchMinutes", parseInt(v))}
              >
                <SelectTrigger className="w-24 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3].map((min) => (
                    <SelectItem key={min} value={min.toString()}>{min} min</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* App close timing - close before plugs turn off */}
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-xs text-muted-foreground">Close apps before booking ends</Label>
              </div>
              <Select 
                value={appLaunchConfig.appCloseSeconds.toString()} 
                onValueChange={(v) => updateAppConfig("appCloseSeconds", parseInt(v))}
              >
                <SelectTrigger className="w-24 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[10, 15, 20, 30].map((sec) => (
                    <SelectItem key={sec} value={sec.toString()}>{sec} sec</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

          </div>

          {/* Detected displays - collapsed by default since config is saved */}
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
              Currently detected displays ({displays.length})
            </summary>
            <div className="mt-2 space-y-1">
              {displays.map((d) => (
                <div key={d.id} className="p-2 bg-muted rounded flex justify-between">
                  <span>{d.label || `Display ${d.index + 1}`}</span>
                  <span className="text-muted-foreground">{d.bounds.width}x{d.bounds.height}</span>
                </div>
              ))}
              {displays.length === 0 && (
                <p className="text-muted-foreground italic p-2">No displays detected (screens may be powered off)</p>
              )}
            </div>
          </details>
        </CollapsibleSettingsCard>

        {/* Customer Notifications - Collapsible */}
        <CollapsibleSettingsCard title="Notifications" icon={<Bell className="w-5 h-5" />} defaultOpen={false}>
          {/* Enable/Disable toggle */}
          <div className="flex items-center justify-between">
            <div>
              <Label>Session end warnings</Label>
              <p className="text-sm text-muted-foreground">
                Show popup messages before session ends
              </p>
            </div>
            <Switch
              checked={notificationConfig.enabled}
              onCheckedChange={(checked) => setNotificationConfig(prev => ({ ...prev, enabled: checked }))}
            />
          </div>

          <Separator />

          {/* Display selector */}
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground flex items-center gap-2">
              Show notifications on
              {notificationConfig.displayLabel && (
                displays.some(d => d.label === notificationConfig.displayLabel) 
                  ? <Badge variant="default" className="text-[10px] px-1 py-0">Available</Badge>
                  : <Badge variant="destructive" className="text-[10px] px-1 py-0">Offline</Badge>
              )}
            </Label>
            <Select 
              value={notificationConfig.displayLabel} 
              onValueChange={(v) => setNotificationConfig(prev => ({ ...prev, displayLabel: v }))}
            >
              <SelectTrigger className="text-xs">
                <SelectValue placeholder="Select display">
                  {notificationConfig.displayLabel || "Select display"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {/* Show currently detected displays */}
                {displays.map((d) => (
                  <SelectItem key={d.id} value={d.label}>
                    {d.label} {d.isPrimary ? "(Primary)" : ""}
                  </SelectItem>
                ))}
                {/* Show saved config if not in current displays list */}
                {notificationConfig.displayLabel && 
                 !displays.some(d => d.label === notificationConfig.displayLabel) && (
                  <SelectItem value={notificationConfig.displayLabel} className="text-muted-foreground">
                    {notificationConfig.displayLabel} (Saved - Offline)
                  </SelectItem>
                )}
                {displays.length === 0 && !notificationConfig.displayLabel && (
                  <SelectItem value="" disabled>No displays detected</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>

          <Separator />

          {/* Notification list */}
          <div className="space-y-3">
            <Label>Warning Messages</Label>
            {notificationConfig.notifications.map((notification, index) => (
              <div key={notification.id} className="p-3 bg-muted rounded-lg space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={notification.enabled}
                      onCheckedChange={(checked) => {
                        setNotificationConfig(prev => ({
                          ...prev,
                          notifications: prev.notifications.map((n, i) => 
                            i === index ? { ...n, enabled: checked } : n
                          )
                        }));
                      }}
                    />
                    <Label className="text-sm">{notification.minutesBefore} min before end</Label>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setNotificationConfig(prev => ({
                        ...prev,
                        notifications: prev.notifications.filter((_, i) => i !== index)
                      }));
                    }}
                  >
                    <Trash2 className="w-4 h-4 text-muted-foreground" />
                  </Button>
                </div>
                
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Time before session ends</Label>
                  <Select 
                    value={notification.minutesBefore.toString()}
                    onValueChange={(v) => {
                      setNotificationConfig(prev => ({
                        ...prev,
                        notifications: prev.notifications.map((n, i) => 
                          i === index ? { ...n, minutesBefore: parseInt(v), id: `${v}min` } : n
                        )
                      }));
                    }}
                  >
                    <SelectTrigger className="text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[1, 2, 3, 5, 10, 15].map((min) => (
                        <SelectItem key={min} value={min.toString()}>{min} minute{min > 1 ? 's' : ''}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    Message (use {'{firstName}'} for customer name)
                  </Label>
                  <Input
                    value={notification.message}
                    onChange={(e) => {
                      setNotificationConfig(prev => ({
                        ...prev,
                        notifications: prev.notifications.map((n, i) => 
                          i === index ? { ...n, message: e.target.value } : n
                        )
                      }));
                    }}
                    className="text-xs"
                    placeholder="Enter notification message..."
                  />
                </div>
              </div>
            ))}

            {/* Add new notification button */}
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => {
                const existingMinutes = notificationConfig.notifications.map(n => n.minutesBefore);
                const availableMinutes = [1, 2, 3, 5, 10, 15].filter(m => !existingMinutes.includes(m));
                const newMinutes = availableMinutes[0] || 5;
                
                setNotificationConfig(prev => ({
                  ...prev,
                  notifications: [
                    ...prev.notifications,
                    {
                      id: `${newMinutes}min`,
                      minutesBefore: newMinutes,
                      message: `Hi {firstName}, your session ends in ${newMinutes} minute${newMinutes > 1 ? 's' : ''}.`,
                      enabled: true
                    }
                  ]
                }));
              }}
            >
              + Add Notification
            </Button>
          </div>
        </CollapsibleSettingsCard>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Upcoming Bookings
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoadingBookings ? (
              <p className="text-muted-foreground text-center py-4">Loading bookings...</p>
            ) : bookings.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">No upcoming bookings</p>
            ) : (
              <div className="space-y-2">
                {bookings.slice(0, 10).map((booking) => (
                  <div 
                    key={booking.id} 
                    className={`flex items-center justify-between p-3 rounded-lg ${
                      activeBooking?.id === booking.id ? "bg-primary/10 border border-primary" : "bg-muted"
                    }`}
                  >
                    <div>
                      <p className="font-medium">
                        {format(parseISO(booking.booking_date), "EEE, MMM d")}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {booking.start_time.slice(0, 5)} - {booking.end_time.slice(0, 5)}
                      </p>
                      {booking.customer_name && (
                        <p className="text-sm font-medium text-primary mt-1">
                          {booking.customer_name}
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-sm">{booking.duration_hours}h</p>
                      <p className="text-xs text-muted-foreground">
                        {booking.player_count} player{booking.player_count > 1 ? "s" : ""}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>


        {/* Footer */}
        <p className="text-xs text-muted-foreground text-center">
          Bay Controller v{APP_VERSION}
        </p>
      </div>

      {/* Customer notifications now shown via Electron popup windows on configured display */}

      {/* Quit Password Dialog */}
      {showQuitDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-[350px]">
            <CardHeader className="text-center">
              <div className="w-12 h-12 mx-auto mb-2 rounded-full bg-destructive/10 flex items-center justify-center">
                <Lock className="w-6 h-6 text-destructive" />
              </div>
              <CardTitle>Quit Bay Controller</CardTitle>
              <p className="text-sm text-muted-foreground">
                Enter password to exit the application
              </p>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleQuitPasswordSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="quit-password">Password</Label>
                  <Input
                    id="quit-password"
                    type="password"
                    value={quitPassword}
                    onChange={(e) => setQuitPassword(e.target.value)}
                    placeholder="Enter password"
                    autoFocus
                  />
                  {quitPasswordError && (
                    <p className="text-sm text-destructive">{quitPasswordError}</p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={handleCancelQuit}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" variant="destructive" className="flex-1">
                    Quit App
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
