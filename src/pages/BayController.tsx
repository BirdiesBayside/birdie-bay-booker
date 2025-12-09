import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Lock, Wifi, Power, Clock, AlertTriangle, CheckCircle, XCircle, Settings, RefreshCw, Monitor, Play, Square, FolderOpen, ChevronDown, ChevronUp, TestTube } from "lucide-react";
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
  isPrimary: boolean;
}

interface AppLaunchConfig {
  gsproPath: string;
  proteeLabsPath: string;
  gsproDisplay: number; // Display index for GSPRO (duplicate screens)
  proteeDisplay: number; // Display index for Protee (touchscreen)
  appLaunchMinutes: number; // Minutes before booking to launch apps (after plugs are on)
  enabled: boolean;
}

// Type for Electron API exposed via preload
declare global {
  interface Window {
    electronAPI?: {
      isElectron: boolean;
      tapoInit: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
      scanNetwork: (email: string, password: string) => Promise<{ success: boolean; plugs: TapoPlug[]; error?: string }>;
      controlPlug: (email: string, password: string, ip: string, action: 'on' | 'off' | 'status') => Promise<{ success: boolean; isOn?: boolean; error?: string }>;
      // App automation
      getDisplays: () => Promise<DisplayInfo[]>;
      launchApp: (exePath: string) => Promise<{ success: boolean; pid?: number; error?: string }>;
      findWindow: (titlePattern: string) => Promise<{ success: boolean; hwnd?: number; title?: string; error?: string }>;
      moveWindow: (hwnd: number, displayIndex: number, fullscreen?: boolean) => Promise<{ success: boolean; error?: string }>;
      minimizeWindow: (hwnd: number) => Promise<{ success: boolean; error?: string }>;
      focusWindow: (hwnd: number) => Promise<{ success: boolean; error?: string }>;
      runAppSequence: (config: AppLaunchConfig) => Promise<{ success: boolean; results?: any[]; error?: string }>;
      closeApps: (appNames: string[]) => Promise<{ success: boolean; results?: any[]; error?: string }>;
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
  
  const [selectedBay, setSelectedBay] = useState<number | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [isLoadingBookings, setIsLoadingBookings] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<"connected" | "disconnected" | "connecting">("disconnected");
  
  const [discoveredPlugs, setDiscoveredPlugs] = useState<TapoPlug[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [bayPlugAssignments, setBayPlugAssignments] = useState<BayPlugAssignment[]>([]);
  
  const [preStartMinutes, setPreStartMinutes] = useState(3);
  const [warningMinutes, setWarningMinutes] = useState([5, 1]);
  const [showSettings, setShowSettings] = useState(false);
  
  const [currentTime, setCurrentTime] = useState(new Date());
  const [activeBooking, setActiveBooking] = useState<Booking | null>(null);
  const [plugsStatus, setPlugsStatus] = useState({ monitor: false, projector: false });
  
  // TAPO credentials state
  const [tapoEmail, setTapoEmail] = useState("");
  const [tapoPassword, setTapoPassword] = useState("");
  const [isElectron, setIsElectron] = useState(false);

  // App Launch state
  const [displays, setDisplays] = useState<DisplayInfo[]>([]);
  const [appLaunchConfig, setAppLaunchConfig] = useState<AppLaunchConfig>({
    gsproPath: "C:\\Program Files\\GSPro\\GSPro.exe",
    proteeLabsPath: "C:\\Program Files\\Protee Labs\\ProteeLabs.exe",
    gsproDisplay: 0,
    proteeDisplay: 1,
    appLaunchMinutes: 1, // 1 minute before booking (after plugs turn on at 3 mins)
    enabled: false
  });
  const [isLaunchingApps, setIsLaunchingApps] = useState(false);
  const [appLaunchStatus, setAppLaunchStatus] = useState<string | null>(null);
  const [appsRunning, setAppsRunning] = useState(false);

  // Check if running in Electron and load saved credentials/config
  useEffect(() => {
    const electronCheck = !!window.electronAPI?.isElectron;
    setIsElectron(electronCheck);
    
    // Load saved TAPO credentials from localStorage
    const savedEmail = localStorage.getItem("bayController_tapoEmail");
    const savedPassword = localStorage.getItem("bayController_tapoPassword");
    if (savedEmail) setTapoEmail(savedEmail);
    if (savedPassword) setTapoPassword(savedPassword);
    
    // Load saved app launch config
    const savedAppConfig = localStorage.getItem("bayController_appLaunchConfig");
    if (savedAppConfig) {
      setAppLaunchConfig(JSON.parse(savedAppConfig));
    }
    
    // Get display info if in Electron
    if (electronCheck && window.electronAPI) {
      window.electronAPI.getDisplays().then(displayList => {
        setDisplays(displayList);
        console.log("Detected displays:", displayList);
      }).catch(err => {
        console.error("Failed to get displays:", err);
      });
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
    if (password === CORRECT_PASSWORD) {
      setIsAuthenticated(true);
      setPasswordError("");
      // Load saved bay selection from localStorage
      const savedBay = localStorage.getItem("bayController_selectedBay");
      if (savedBay) {
        setSelectedBay(parseInt(savedBay));
      }
      // Load saved plug assignments
      const savedPlugs = localStorage.getItem("bayController_bayPlugAssignments");
      if (savedPlugs) {
        setBayPlugAssignments(JSON.parse(savedPlugs));
      }
      const savedPreStart = localStorage.getItem("bayController_preStartMinutes");
      if (savedPreStart) {
        setPreStartMinutes(parseInt(savedPreStart));
      }
    } else {
      setPasswordError("Incorrect password");
    }
  };

  // Fetch bookings for selected bay
  const fetchBookings = useCallback(async () => {
    if (!selectedBay) return;
    
    setIsLoadingBookings(true);
    setConnectionStatus("connecting");
    setBookings([]); // Clear previous bookings when fetching new bay
    setActiveBooking(null); // Clear active booking when switching bays
    setPlugsStatus({ monitor: false, projector: false }); // Reset plug status
    
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

  // Set up real-time subscription for bookings and heartbeat
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
            toast.info("Booking update received");
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

    return () => {
      clearInterval(heartbeatInterval);
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

  // Save plug assignments
  useEffect(() => {
    localStorage.setItem("bayController_bayPlugAssignments", JSON.stringify(bayPlugAssignments));
  }, [bayPlugAssignments]);

  // Save pre-start minutes
  useEffect(() => {
    localStorage.setItem("bayController_preStartMinutes", preStartMinutes.toString());
  }, [preStartMinutes]);

  // Save app launch config
  useEffect(() => {
    localStorage.setItem("bayController_appLaunchConfig", JSON.stringify(appLaunchConfig));
  }, [appLaunchConfig]);

  // Check for active booking and manage plugs
  useEffect(() => {
    if (bookings.length === 0) return;

    const now = currentTime;
    const today = format(now, "yyyy-MM-dd");

    // Find current or upcoming booking
    const todaysBookings = bookings.filter(b => b.booking_date === today);
    
    // Check if we're in a booking or about to start one
    let shouldPlugsBeOn = false;
    let currentBooking: Booking | null = null;

    for (const booking of todaysBookings) {
      const startTime = parseISO(`${booking.booking_date}T${booking.start_time}`);
      const endTime = parseISO(`${booking.booking_date}T${booking.end_time}`);
      const preStartTime = addMinutes(startTime, -preStartMinutes);

      // Check if we should have plugs on (pre-start time to end time)
      if (isAfter(now, preStartTime) && isBefore(now, endTime)) {
        shouldPlugsBeOn = true;
        currentBooking = booking;
      }

      // Check for back-to-back bookings
      const nextBooking = todaysBookings.find(b => 
        b.id !== booking.id && 
        b.start_time === booking.end_time
      );
      
      if (nextBooking && isAfter(now, preStartTime)) {
        // Don't turn off between bookings
        const nextEndTime = parseISO(`${nextBooking.booking_date}T${nextBooking.end_time}`);
        if (isBefore(now, nextEndTime)) {
          shouldPlugsBeOn = true;
        }
      }
    }

    setActiveBooking(currentBooking);

    // Control plugs based on booking state
    if (shouldPlugsBeOn !== plugsStatus.monitor || shouldPlugsBeOn !== plugsStatus.projector) {
      if (shouldPlugsBeOn) {
        turnOnPlugs();
      } else {
        turnOffPlugs();
      }
    }

    // Check for warnings
    if (currentBooking) {
      const endTime = parseISO(`${currentBooking.booking_date}T${currentBooking.end_time}`);
      const minutesRemaining = Math.floor((endTime.getTime() - now.getTime()) / 60000);

      if (warningMinutes.includes(minutesRemaining)) {
        showWarningNotification(minutesRemaining);
      }
    }
  }, [currentTime, bookings, preStartMinutes]);

  // Scan for TAPO plugs
  const scanForPlugs = async () => {
    setIsScanning(true);
    
    // Check if running in Electron with real scanning capability
    if (isElectron && window.electronAPI) {
      if (!tapoEmail || !tapoPassword) {
        toast.error("Please enter your TAPO credentials first");
        setIsScanning(false);
        return;
      }
      
      toast.info("Scanning for TAPO devices via cloud...");
      
      try {
        const result = await window.electronAPI.scanNetwork(tapoEmail, tapoPassword);
        
        if (result.success && result.plugs) {
          setDiscoveredPlugs(result.plugs);
          toast.success(`Found ${result.plugs.length} TAPO devices`);
          
          // Save credentials on successful scan
          localStorage.setItem("bayController_tapoEmail", tapoEmail);
          localStorage.setItem("bayController_tapoPassword", tapoPassword);
        } else {
          toast.error(result.error || "Failed to scan for devices");
        }
      } catch (error) {
        console.error("Scan error:", error);
        toast.error("Failed to communicate with TAPO cloud");
      }
      
      setIsScanning(false);
    } else {
      // Browser mode - show mock data for demo
      toast.info("Demo mode - showing sample plugs (real scanning requires desktop app)");
      
      setTimeout(() => {
        const mockPlugs: TapoPlug[] = [
          { id: "1", name: "Bay 1 (M)", ip: "192.168.1.100", isOn: false },
          { id: "2", name: "Bay 1 (P)", ip: "192.168.1.101", isOn: false },
          { id: "3", name: "Bay 2 (M)", ip: "192.168.1.102", isOn: false },
          { id: "4", name: "Bay 2 (P)", ip: "192.168.1.103", isOn: false },
          { id: "5", name: "Bay 3 (M)", ip: "192.168.1.104", isOn: false },
          { id: "6", name: "Bay 3 (P)", ip: "192.168.1.105", isOn: false },
          { id: "7", name: "Bay 4 (M)", ip: "192.168.1.106", isOn: false },
          { id: "8", name: "Bay 4 (P)", ip: "192.168.1.107", isOn: false },
          { id: "9", name: "Bay 5 (M)", ip: "192.168.1.108", isOn: false },
          { id: "10", name: "Bay 5 (P)", ip: "192.168.1.109", isOn: false },
          { id: "11", name: "Bay 6 (M)", ip: "192.168.1.110", isOn: false },
          { id: "12", name: "Bay 6 (P)", ip: "192.168.1.111", isOn: false },
        ];
        setDiscoveredPlugs(mockPlugs);
        setIsScanning(false);
        toast.success(`Demo: Found ${mockPlugs.length} sample plugs`);
      }, 2000);
    }
  };

  const turnOnPlugs = async () => {
    console.log("Turning ON plugs");
    
    if (isElectron && window.electronAPI && selectedBay) {
      const bayPlugs = getAssignedPlugsForBay(selectedBay);
      
      for (const plug of bayPlugs) {
        try {
          await window.electronAPI.controlPlug(tapoEmail, tapoPassword, plug.ip, 'on');
        } catch (error) {
          console.error(`Failed to turn on ${plug.name}:`, error);
        }
      }
    }
    
    setPlugsStatus({ monitor: true, projector: true });
    toast.success("Bay equipment powered ON");
  };

  const turnOffPlugs = async () => {
    console.log("Turning OFF plugs");
    
    if (isElectron && window.electronAPI && selectedBay) {
      const bayPlugs = getAssignedPlugsForBay(selectedBay);
      
      for (const plug of bayPlugs) {
        try {
          await window.electronAPI.controlPlug(tapoEmail, tapoPassword, plug.ip, 'off');
        } catch (error) {
          console.error(`Failed to turn off ${plug.name}:`, error);
        }
      }
    }
    
    setPlugsStatus({ monitor: false, projector: false });
    toast.info("Bay equipment powered OFF");
  };

  const showWarningNotification = (minutes: number) => {
    if (minutes === 5) {
      toast.warning("5 minutes remaining in your session", { duration: 10000 });
    } else if (minutes === 1) {
      toast.warning("1 minute remaining - session ending soon!", { duration: 10000 });
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
  const refreshDisplays = async () => {
    if (isElectron && window.electronAPI) {
      try {
        const displayList = await window.electronAPI.getDisplays();
        setDisplays(displayList);
        toast.success(`Detected ${displayList.length} displays`);
      } catch (error) {
        toast.error("Failed to detect displays");
      }
    }
  };

  const launchApps = async () => {
    if (!isElectron || !window.electronAPI) {
      toast.error("App launch requires desktop app");
      return;
    }

    setIsLaunchingApps(true);
    setAppLaunchStatus("Starting app launch sequence...");

    try {
      const result = await window.electronAPI.runAppSequence(appLaunchConfig);
      
      if (result.success) {
        setAppsRunning(true);
        setAppLaunchStatus("All apps launched successfully");
        toast.success("Apps launched successfully");
        
        // Log results
        result.results?.forEach(r => {
          console.log(`${r.step}: ${r.status}`, r);
        });
      } else {
        setAppLaunchStatus(`Launch failed: ${result.error}`);
        toast.error(`Launch failed: ${result.error}`);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      setAppLaunchStatus(`Error: ${errorMsg}`);
      toast.error(`Launch error: ${errorMsg}`);
    } finally {
      setIsLaunchingApps(false);
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

  const updateAppConfig = (key: keyof AppLaunchConfig, value: any) => {
    setAppLaunchConfig(prev => ({ ...prev, [key]: value }));
  };

  // Auto-launch apps based on booking time (separate effect after functions are defined)
  useEffect(() => {
    if (!appLaunchConfig.enabled || !isElectron || bookings.length === 0) return;

    const now = currentTime;
    const today = format(now, "yyyy-MM-dd");
    const todaysBookings = bookings.filter(b => b.booking_date === today);
    
    let shouldLaunchApps = false;

    for (const booking of todaysBookings) {
      const startTime = parseISO(`${booking.booking_date}T${booking.start_time}`);
      const endTime = parseISO(`${booking.booking_date}T${booking.end_time}`);
      const appLaunchTime = addMinutes(startTime, -appLaunchConfig.appLaunchMinutes);

      if (isAfter(now, appLaunchTime) && isBefore(now, endTime)) {
        shouldLaunchApps = true;
      }

      // Check for back-to-back
      const nextBooking = todaysBookings.find(b => b.id !== booking.id && b.start_time === booking.end_time);
      if (nextBooking) {
        const nextEndTime = parseISO(`${nextBooking.booking_date}T${nextBooking.end_time}`);
        if (isBefore(now, nextEndTime)) {
          shouldLaunchApps = true;
        }
      }
    }

    if (shouldLaunchApps && !appsRunning && !isLaunchingApps) {
      launchApps();
    } else if (!shouldLaunchApps && appsRunning) {
      closeApps();
    }
  }, [currentTime, bookings, appLaunchConfig.enabled, appLaunchConfig.appLaunchMinutes, appsRunning, isLaunchingApps, isElectron]);

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
              <Button onClick={turnOnPlugs} disabled={plugsStatus.monitor} className="flex-1">
                <Power className="w-4 h-4 mr-2" /> Turn On
              </Button>
              <Button onClick={turnOffPlugs} disabled={!plugsStatus.monitor} variant="outline" className="flex-1">
                <Power className="w-4 h-4 mr-2" /> Turn Off
              </Button>
            </div>
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
                    <p className="font-medium">{plug.name}</p>
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

          <div className="flex items-center gap-4">
            <div className="flex-1">
              <p className="text-sm text-muted-foreground">
                {getAssignedPlugsForBay(selectedBay || 0).length} plug(s) assigned to this bay
              </p>
            </div>
            <Button onClick={scanForPlugs} disabled={isScanning}>
              {isScanning ? (
                <><RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Scanning...</>
              ) : (
                <><Wifi className="w-4 h-4 mr-2" /> Scan Network</>
              )}
            </Button>
          </div>
          
          {/* Unassigned plugs from scan */}
          {unassignedPlugs.length > 0 && (
            <div className="space-y-2">
              <Label>Available Plugs ({unassignedPlugs.length})</Label>
              {unassignedPlugs.map((plug) => (
                <div key={plug.id} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <div>
                    <p className="font-medium">{plug.name}</p>
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

          {discoveredPlugs.length > 0 && unassignedPlugs.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-2">
              All discovered plugs have been assigned
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
                Automatically launch apps {appLaunchConfig.appLaunchMinutes} min before booking
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
            <Button 
              onClick={launchApps} 
              disabled={isLaunchingApps || appsRunning || !isElectron}
              className="flex-1"
            >
              {isLaunchingApps ? (
                <><RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Launching...</>
              ) : (
                <><Play className="w-4 h-4 mr-2" /> Launch Apps</>
              )}
            </Button>
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

            {/* Display assignment */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">GSPRO Display</Label>
                <Select 
                  value={appLaunchConfig.gsproDisplay.toString()} 
                  onValueChange={(v) => updateAppConfig("gsproDisplay", parseInt(v))}
                >
                  <SelectTrigger className="text-xs">
                    <SelectValue placeholder="Select display" />
                  </SelectTrigger>
                  <SelectContent>
                    {displays.length > 0 ? (
                      displays.map((d) => (
                        <SelectItem key={d.id} value={d.index.toString()}>
                          {d.label || `Display ${d.index + 1}`} {d.isPrimary ? "(Primary)" : ""}
                        </SelectItem>
                      ))
                    ) : (
                      <>
                        <SelectItem value="0">Display 1</SelectItem>
                        <SelectItem value="1">Display 2</SelectItem>
                        <SelectItem value="2">Display 3</SelectItem>
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Protee Display (Touchscreen)</Label>
                <Select 
                  value={appLaunchConfig.proteeDisplay.toString()} 
                  onValueChange={(v) => updateAppConfig("proteeDisplay", parseInt(v))}
                >
                  <SelectTrigger className="text-xs">
                    <SelectValue placeholder="Select display" />
                  </SelectTrigger>
                  <SelectContent>
                    {displays.length > 0 ? (
                      displays.map((d) => (
                        <SelectItem key={d.id} value={d.index.toString()}>
                          {d.label || `Display ${d.index + 1}`} {d.isPrimary ? "(Primary)" : ""}
                        </SelectItem>
                      ))
                    ) : (
                      <>
                        <SelectItem value="0">Display 1</SelectItem>
                        <SelectItem value="1">Display 2</SelectItem>
                        <SelectItem value="2">Display 3</SelectItem>
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>
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

            {/* Refresh displays button */}
            <Button 
              variant="outline" 
              size="sm" 
              onClick={refreshDisplays}
              disabled={!isElectron}
              className="w-full"
            >
              <RefreshCw className="w-4 h-4 mr-2" /> Refresh Displays ({displays.length} detected)
            </Button>
          </div>

          {/* Display info */}
          {displays.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Detected Displays</Label>
              {displays.map((d) => (
                <div key={d.id} className="text-xs p-2 bg-muted rounded flex justify-between">
                  <span>{d.label || `Display ${d.index + 1}`}</span>
                  <span className="text-muted-foreground">{d.bounds.width}x{d.bounds.height}</span>
                </div>
              ))}
            </div>
          )}
        </CollapsibleSettingsCard>

        {/* Upcoming Bookings */}
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
    </div>
  );
}
