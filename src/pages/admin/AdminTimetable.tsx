import { useState, useEffect } from "react";
import { format, addDays, startOfWeek, addWeeks, subWeeks, isSameDay } from "date-fns";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { 
  ChevronLeft, 
  ChevronRight, 
  CalendarIcon, 
  Clock, 
  User, 
  Phone, 
  Mail,
  Users as UsersIcon,
  Percent
} from "lucide-react";
import { useNavigate } from "react-router-dom";

interface Bay {
  id: string;
  name: string;
  bay_number: number;
}

interface Booking {
  id: string;
  bay_id: string;
  booking_date: string;
  start_time: string;
  end_time: string;
  duration_hours: number;
  status: string;
  player_count: number;
  total_price: number;
  user_id: string;
  profile?: {
    first_name: string;
    last_name: string;
    email: string;
    phone: string | null;
    membership_tier: string;
  };
}

type ViewMode = "day" | "week";

// Operating hours: 5am to 11pm in 30-min increments
// Each slot is { hour: number, minute: 0 | 30 }
interface TimeSlot {
  hour: number;
  minute: number;
}

const OPERATING_SLOTS: TimeSlot[] = [];
for (let hour = 5; hour < 23; hour++) {
  OPERATING_SLOTS.push({ hour, minute: 0 });
  OPERATING_SLOTS.push({ hour, minute: 30 });
}

const SLOT_HEIGHT = 32; // pixels per 30-min slot

export default function AdminTimetable() {
  const { isAdmin, isLoading: authLoading } = useAdminAuth();
  const navigate = useNavigate();
  
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>("day");
  const [bays, setBays] = useState<Bay[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);

  useEffect(() => {
    if (isAdmin) {
      fetchBays();
    }
  }, [isAdmin]);

  useEffect(() => {
    if (isAdmin && bays.length > 0) {
      fetchBookings();
    }
  }, [isAdmin, selectedDate, viewMode, bays]);

  const fetchBays = async () => {
    const { data, error } = await supabase
      .from("bays")
      .select("*")
      .eq("is_active", true)
      .order("bay_number");

    if (!error && data) {
      setBays(data);
    }
  };

  const fetchBookings = async () => {
    setIsLoading(true);
    
    let startDate: string;
    let endDate: string;

    if (viewMode === "day") {
      startDate = format(selectedDate, "yyyy-MM-dd");
      endDate = startDate;
    } else {
      const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });
      startDate = format(weekStart, "yyyy-MM-dd");
      endDate = format(addDays(weekStart, 6), "yyyy-MM-dd");
    }

    const { data, error } = await supabase
      .from("bookings")
      .select(`
        *,
        profile:profiles!bookings_user_id_fkey(
          first_name,
          last_name,
          email,
          phone,
          membership_tier
        )
      `)
      .gte("booking_date", startDate)
      .lte("booking_date", endDate)
      .order("start_time");

    if (!error && data) {
      // Transform to flatten profile data
      const transformedData = data.map((booking: any) => ({
        ...booking,
        profile: booking.profile?.[0] || booking.profile
      }));
      setBookings(transformedData);
    }
    
    setIsLoading(false);
  };

  const navigateDate = (direction: "prev" | "next") => {
    if (viewMode === "day") {
      setSelectedDate(prev => direction === "next" ? addDays(prev, 1) : addDays(prev, -1));
    } else {
      setSelectedDate(prev => direction === "next" ? addWeeks(prev, 1) : subWeeks(prev, 1));
    }
  };

  const getBookingsForSlot = (bayId: string, slot: TimeSlot, date: Date = selectedDate) => {
    const dateStr = format(date, "yyyy-MM-dd");
    const slotMinutes = slot.hour * 60 + slot.minute;
    
    return bookings.filter(b => {
      if (b.bay_id !== bayId || b.booking_date !== dateStr || b.status === "cancelled") return false;
      
      const [startHour, startMin] = b.start_time.split(":").map(Number);
      const [endHour, endMin] = b.end_time.split(":").map(Number);
      const startMinutes = startHour * 60 + startMin;
      const endMinutes = endHour * 60 + endMin;
      
      return slotMinutes >= startMinutes && slotMinutes < endMinutes;
    });
  };

  const isSlotStart = (booking: Booking, slot: TimeSlot) => {
    const [startHour, startMin] = booking.start_time.split(":").map(Number);
    return startHour === slot.hour && startMin === slot.minute;
  };

  const getBookingSlotSpan = (booking: Booking) => {
    // duration_hours * 2 gives us the number of 30-min slots
    return booking.duration_hours * 2;
  };

  const calculateOccupancy = () => {
    const totalSlots = bays.length * OPERATING_SLOTS.length;
    let bookedSlots = 0;

    if (viewMode === "day") {
      bays.forEach(bay => {
        OPERATING_SLOTS.forEach(slot => {
          const slotBookings = getBookingsForSlot(bay.id, slot);
          if (slotBookings.length > 0) bookedSlots++;
        });
      });
    }

    return totalSlots > 0 ? Math.round((bookedSlots / totalSlots) * 100) : 0;
  };

  const getTodayBookingsCount = () => {
    const dateStr = format(selectedDate, "yyyy-MM-dd");
    const uniqueBookings = new Set(
      bookings
        .filter(b => b.booking_date === dateStr && b.status !== "cancelled")
        .map(b => b.id)
    );
    return uniqueBookings.size;
  };

  const formatSlotTime = (slot: TimeSlot) => {
    const hour = slot.hour;
    const ampm = hour >= 12 ? "PM" : "AM";
    const displayHour = hour % 12 || 12;
    const minStr = slot.minute === 0 ? "" : ":30";
    return `${displayHour}${minStr}${ampm}`;
  };

  const formatTime = (time: string) => {
    const [hour, min] = time.split(":").map(Number);
    const ampm = hour >= 12 ? "PM" : "AM";
    const displayHour = hour % 12 || 12;
    const minStr = min === 0 ? "" : `:${min.toString().padStart(2, "0")}`;
    return `${displayHour}${minStr}${ampm}`;
  };

  const getMembershipColor = (tier: string) => {
    switch (tier?.toLowerCase()) {
      case "albatross": return "bg-purple-500/10 text-purple-600 border-purple-200";
      case "eagle": return "bg-amber-500/10 text-amber-600 border-amber-200";
      case "birdie": return "bg-blue-500/10 text-blue-600 border-blue-200";
      case "par": return "bg-green-500/10 text-green-600 border-green-200";
      default: return "bg-muted text-muted-foreground";
    }
  };

  if (authLoading) {
    return (
      <AdminLayout>
        <div className="p-6 space-y-6">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-[600px]" />
        </div>
      </AdminLayout>
    );
  }

  if (!isAdmin) {
    return null;
  }

  const weekDays = viewMode === "week" 
    ? Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(selectedDate, { weekStartsOn: 1 }), i))
    : [selectedDate];

  return (
    <AdminLayout>
      <div className="p-4 lg:p-6 space-y-4">
        {/* Header */}
        <div className="flex flex-col-reverse lg:flex-row lg:items-center lg:justify-between gap-4">
          {/* Controls - Left side */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Stats */}
            <div className="flex items-center gap-4 mr-4">
              <div className="flex items-center gap-1.5 text-sm">
                <Percent className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{calculateOccupancy()}%</span>
                <span className="text-muted-foreground">occupancy</span>
              </div>
              <div className="flex items-center gap-1.5 text-sm">
                <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{getTodayBookingsCount()}</span>
                <span className="text-muted-foreground">bookings</span>
              </div>
            </div>

            {/* View Mode */}
            <Select value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
              <SelectTrigger className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="day">Day</SelectItem>
                <SelectItem value="week">Week</SelectItem>
              </SelectContent>
            </Select>

            {/* Date Navigation */}
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" onClick={() => navigateDate("prev")}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              
              <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="min-w-[140px]">
                    <CalendarIcon className="h-4 w-4 mr-2" />
                    {viewMode === "day" 
                      ? format(selectedDate, "EEE, MMM d")
                      : `Week of ${format(startOfWeek(selectedDate, { weekStartsOn: 1 }), "MMM d")}`
                    }
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={(date) => {
                      if (date) {
                        setSelectedDate(date);
                        setCalendarOpen(false);
                      }
                    }}
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>

              <Button variant="outline" size="icon" onClick={() => navigateDate("next")}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            <Button variant="outline" size="sm" onClick={() => setSelectedDate(new Date())}>
              Today
            </Button>
          </div>

          {/* Title - Right side */}
          <div className="text-right">
            <h1 className="font-display text-2xl lg:text-3xl uppercase tracking-wide text-foreground">
              Timetable
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Bay bookings and schedule
            </p>
          </div>
        </div>

        {/* Timetable Grid */}
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            {isLoading ? (
              <div className="p-6">
                <Skeleton className="h-[500px]" />
              </div>
            ) : (
              <div className="min-w-[800px]">
                {/* Header Row */}
                <div className="grid border-b border-border" style={{ 
                  gridTemplateColumns: `80px repeat(${bays.length}, 1fr)` 
                }}>
                  <div className="p-3 bg-muted/50 font-medium text-sm text-muted-foreground border-r border-border">
                    Time
                  </div>
                  {bays.map((bay) => (
                    <div key={bay.id} className="p-3 bg-muted/50 font-medium text-sm text-center border-r border-border last:border-r-0">
                      {bay.name}
                    </div>
                  ))}
                </div>

                {/* Time Rows - 30 min increments */}
                {OPERATING_SLOTS.map((slot, slotIndex) => (
                  <div 
                    key={`${slot.hour}-${slot.minute}`} 
                    className={`grid border-b border-border/50 last:border-b-0 ${slot.minute === 0 ? "border-t border-border" : ""}`}
                    style={{ gridTemplateColumns: `80px repeat(${bays.length}, 1fr)` }}
                  >
                    <div className={`text-[10px] text-muted-foreground border-r border-border flex items-center justify-center ${slot.minute === 0 ? "font-medium" : "text-muted-foreground/60"}`} style={{ height: SLOT_HEIGHT }}>
                      {formatSlotTime(slot)}
                    </div>
                    {bays.map((bay) => {
                      const slotBookings = getBookingsForSlot(bay.id, slot);
                      const booking = slotBookings[0];
                      const showBooking = booking && isSlotStart(booking, slot);
                      
                      return (
                        <div 
                          key={bay.id} 
                          className="border-r border-border last:border-r-0 relative"
                          style={{ height: SLOT_HEIGHT }}
                        >
                          {showBooking && (
                            <button
                              onClick={() => setSelectedBooking(booking)}
                              className="absolute inset-x-0.5 top-0.5 rounded-sm bg-primary/10 border border-primary/20 px-1.5 py-0.5 text-left hover:bg-primary/20 transition-colors z-10 overflow-hidden"
                              style={{
                                height: `calc(${getBookingSlotSpan(booking) * SLOT_HEIGHT}px - 4px)`,
                              }}
                            >
                              <p className="text-[10px] font-medium text-primary truncate leading-tight">
                                {booking.profile?.first_name} {booking.profile?.last_name}
                              </p>
                              <p className="text-[9px] text-muted-foreground truncate leading-tight">
                                {formatTime(booking.start_time)} - {formatTime(booking.end_time)}
                              </p>
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Booking Details Dialog */}
        <Dialog open={!!selectedBooking} onOpenChange={() => setSelectedBooking(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="font-display text-xl uppercase tracking-wide">
                Booking Details
              </DialogTitle>
            </DialogHeader>
            
            {selectedBooking && (
              <div className="space-y-4">
                {/* Customer Info */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">
                        {selectedBooking.profile?.first_name} {selectedBooking.profile?.last_name}
                      </span>
                    </div>
                    <Badge className={getMembershipColor(selectedBooking.profile?.membership_tier || "")}>
                      {selectedBooking.profile?.membership_tier || "Visitor"}
                    </Badge>
                  </div>
                  
                  {selectedBooking.profile?.email && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Mail className="h-4 w-4" />
                      <a href={`mailto:${selectedBooking.profile.email}`} className="hover:text-primary">
                        {selectedBooking.profile.email}
                      </a>
                    </div>
                  )}
                  
                  {selectedBooking.profile?.phone && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Phone className="h-4 w-4" />
                      <a href={`tel:${selectedBooking.profile.phone}`} className="hover:text-primary">
                        {selectedBooking.profile.phone}
                      </a>
                    </div>
                  )}
                </div>

                <hr className="border-border" />

                {/* Booking Info */}
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-muted-foreground">Date</p>
                    <p className="font-medium">{format(new Date(selectedBooking.booking_date), "EEE, MMM d, yyyy")}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Time</p>
                    <p className="font-medium">
                      {formatTime(selectedBooking.start_time)} - {formatTime(selectedBooking.end_time)}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Duration</p>
                    <p className="font-medium">{selectedBooking.duration_hours} hour{selectedBooking.duration_hours > 1 ? "s" : ""}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Players</p>
                    <p className="font-medium">{selectedBooking.player_count}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Bay</p>
                    <p className="font-medium">
                      {bays.find(b => b.id === selectedBooking.bay_id)?.name}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Total</p>
                    <p className="font-medium">${selectedBooking.total_price}</p>
                  </div>
                </div>

                <hr className="border-border" />

                {/* Actions */}
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    className="flex-1"
                    onClick={() => {
                      setSelectedBooking(null);
                      navigate(`/admin/customers?user=${selectedBooking.user_id}`);
                    }}
                  >
                    View Customer
                  </Button>
                  <Button className="flex-1 bg-primary hover:bg-primary/90">
                    Edit Booking
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
