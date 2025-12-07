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
  type: "monitor" | "projector";
  isOn: boolean;
}

interface PlugAssignment {
  monitorPlug: TapoPlug | null;
  projectorPlug: TapoPlug | null;
}

const CORRECT_PASSWORD = "Holeinone1";
const APP_VERSION = "1.0.0";

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
  const [plugAssignment, setPlugAssignment] = useState<PlugAssignment>({ monitorPlug: null, projectorPlug: null });
  
  const [preStartMinutes, setPreStartMinutes] = useState(3);
  const [warningMinutes, setWarningMinutes] = useState([5, 1]);
  const [showSettings, setShowSettings] = useState(false);
  
  const [currentTime, setCurrentTime] = useState(new Date());
  const [activeBooking, setActiveBooking] = useState<Booking | null>(null);
  const [plugsStatus, setPlugsStatus] = useState({ monitor: false, projector: false });

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
      const savedPlugs = localStorage.getItem("bayController_plugAssignment");
      if (savedPlugs) {
        setPlugAssignment(JSON.parse(savedPlugs));
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
    localStorage.setItem("bayController_plugAssignment", JSON.stringify(plugAssignment));
  }, [plugAssignment]);

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

  // Scan for TAPO plugs (simulated - real implementation would use local network scanning)
  const scanForPlugs = async () => {
    setIsScanning(true);
    toast.info("Scanning local network for TAPO plugs...");

    // Simulated discovery - in real Electron app, this would use network scanning
    // TAPO P110 plugs typically respond on port 9999
    setTimeout(() => {
      // This is placeholder - real implementation needs Electron IPC for network scanning
      const mockPlugs: TapoPlug[] = [
        { id: "1", name: "Bay Monitor", ip: "192.168.1.100", type: "monitor", isOn: false },
        { id: "2", name: "Bay Projector", ip: "192.168.1.101", type: "projector", isOn: false },
        { id: "3", name: "Living Room", ip: "192.168.1.102", type: "monitor", isOn: false },
      ];
      setDiscoveredPlugs(mockPlugs);
      setIsScanning(false);
      toast.success(`Found ${mockPlugs.length} TAPO plugs`);
    }, 3000);
  };

  const turnOnPlugs = async () => {
    console.log("Turning ON plugs");
    setPlugsStatus({ monitor: true, projector: true });
    toast.success("Bay equipment powered ON");
    // Real implementation: Call TAPO API to turn on plugs
  };

  const turnOffPlugs = async () => {
    console.log("Turning OFF plugs");
    setPlugsStatus({ monitor: false, projector: false });
    toast.info("Bay equipment powered OFF");
    // Real implementation: Call TAPO API to turn off plugs
  };

  const showWarningNotification = (minutes: number) => {
    if (minutes === 5) {
      toast.warning("5 minutes remaining in your session", { duration: 10000 });
    } else if (minutes === 1) {
      toast.warning("1 minute remaining - session ending soon!", { duration: 10000 });
    }
  };

  const assignPlug = (plug: TapoPlug, type: "monitor" | "projector") => {
    setPlugAssignment(prev => ({
      ...prev,
      [type === "monitor" ? "monitorPlug" : "projectorPlug"]: plug
    }));
    toast.success(`${plug.name} assigned as ${type}`);
  };

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
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <p className="text-sm text-muted-foreground">
                  Monitor: {plugAssignment.monitorPlug?.name || "Not assigned"}
                </p>
                <p className="text-sm text-muted-foreground">
                  Projector: {plugAssignment.projectorPlug?.name || "Not assigned"}
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
            
            {discoveredPlugs.length > 0 && (
              <div className="space-y-2">
                <Label>Discovered Plugs</Label>
                {discoveredPlugs.map((plug) => (
                  <div key={plug.id} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                    <div>
                      <p className="font-medium">{plug.name}</p>
                      <p className="text-xs text-muted-foreground">{plug.ip}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button 
                        size="sm" 
                        variant={plugAssignment.monitorPlug?.id === plug.id ? "default" : "outline"}
                        onClick={() => assignPlug(plug, "monitor")}
                      >
                        Monitor
                      </Button>
                      <Button 
                        size="sm"
                        variant={plugAssignment.projectorPlug?.id === plug.id ? "default" : "outline"}
                        onClick={() => assignPlug(plug, "projector")}
                      >
                        Projector
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
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
