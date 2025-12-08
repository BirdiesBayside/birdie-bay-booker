import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Lock, Wifi, Power, Clock, AlertTriangle, CheckCircle, XCircle, Settings, RefreshCw } from "lucide-react";
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

// Type for Electron API exposed via preload
declare global {
  interface Window {
    electronAPI?: {
      isElectron: boolean;
      tapoInit: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
      scanNetwork: (email: string, password: string) => Promise<{ success: boolean; plugs: TapoPlug[]; error?: string }>;
      controlPlug: (email: string, password: string, ip: string, action: 'on' | 'off' | 'status') => Promise<{ success: boolean; isOn?: boolean; error?: string }>;
    };
  }
}

const CORRECT_PASSWORD = "Holeinone1";
const APP_VERSION = "1.0.1";

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

  // Check if running in Electron and load saved TAPO credentials
  useEffect(() => {
    const electronCheck = !!window.electronAPI?.isElectron;
    setIsElectron(electronCheck);
    
    // Load saved TAPO credentials from localStorage
    const savedEmail = localStorage.getItem("bayController_tapoEmail");
    const savedPassword = localStorage.getItem("bayController_tapoPassword");
    if (savedEmail) setTapoEmail(savedEmail);
    if (savedPassword) setTapoPassword(savedPassword);
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

  // Set up polling for bookings and heartbeat
  useEffect(() => {
    if (!selectedBay) return;

    fetchBookings();
    const bookingInterval = setInterval(fetchBookings, 60000); // Every minute
    const heartbeatInterval = setInterval(sendHeartbeat, 30000); // Every 30 seconds

    return () => {
      clearInterval(bookingInterval);
      clearInterval(heartbeatInterval);
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

  // Check for active booking and manage plugs
  useEffect(() => {
    if (bookings.length === 0) return;

    const now = currentTime;
    const today = format(now, "yyyy-MM-dd");
    const currentTimeStr = format(now, "HH:mm:ss");

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
                <p className="font-medium">Active Booking</p>
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

        {/* TAPO Plug Discovery */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wifi className="w-5 h-5" />
              TAPO Smart Plugs
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
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
          </CardContent>
        </Card>

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
