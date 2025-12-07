import { useState, useEffect } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CalendarIcon, Plus, UserPlus, Ban } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface Bay {
  id: string;
  name: string;
  bay_number: number;
}

interface Profile {
  user_id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  membership_tier: string;
}

interface AddBookingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bays: Bay[];
  initialDate?: Date;
  initialTime?: string;
  initialBayId?: string;
  onBookingCreated: () => void;
}

// Membership tier hourly rates
const TIER_RATES: Record<string, number> = {
  visitor: 15,
  par: 12,
  birdie: 10,
  eagle: 9,
  albatross: 8,
};

// Operating hours time options
const TIME_OPTIONS: { value: string; label: string }[] = [];
for (let hour = 5; hour < 23; hour++) {
  for (const minute of [0, 30]) {
    if (hour === 22 && minute === 30) continue; // Can't start at 10:30pm
    const timeStr = `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
    const ampm = hour >= 12 ? "PM" : "AM";
    const displayHour = hour % 12 || 12;
    const minStr = minute === 0 ? "" : ":30";
    TIME_OPTIONS.push({ value: timeStr, label: `${displayHour}${minStr}${ampm}` });
  }
}

const DURATION_OPTIONS = [
  { value: "1", label: "1 hour" },
  { value: "2", label: "2 hours" },
  { value: "3", label: "3 hours" },
  { value: "4", label: "4 hours" },
];

const PLAYER_OPTIONS = [
  { value: "1", label: "1 player" },
  { value: "2", label: "2 players" },
  { value: "3", label: "3 players" },
  { value: "4", label: "4 players" },
];

export function AddBookingDialog({
  open,
  onOpenChange,
  bays,
  initialDate,
  initialTime,
  initialBayId,
  onBookingCreated,
}: AddBookingDialogProps) {
  const { toast } = useToast();
  
  // Tab state
  const [activeTab, setActiveTab] = useState<"booking" | "block">("booking");
  
  // Form state
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [bookingDate, setBookingDate] = useState<Date | undefined>(initialDate);
  const [startTime, setStartTime] = useState(initialTime || "");
  const [duration, setDuration] = useState("1");
  const [bayId, setBayId] = useState(initialBayId || "");
  const [playerCount, setPlayerCount] = useState("1");
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  // Block form state
  const [blockReason, setBlockReason] = useState("");
  const [blockCalendarOpen, setBlockCalendarOpen] = useState(false);
  
  // Customer search and list
  const [customers, setCustomers] = useState<Profile[]>([]);
  const [customerSearch, setCustomerSearch] = useState("");
  const [isLoadingCustomers, setIsLoadingCustomers] = useState(false);
  
  // New customer mode
  const [isAddingNewCustomer, setIsAddingNewCustomer] = useState(false);
  const [newFirstName, setNewFirstName] = useState("");
  const [newLastName, setNewLastName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [isCreatingCustomer, setIsCreatingCustomer] = useState(false);

  // Selected customer details
  const selectedCustomer = customers.find(c => c.user_id === selectedCustomerId);

  // Reset form when dialog opens/closes
  useEffect(() => {
    if (open) {
      setActiveTab("booking");
      setBookingDate(initialDate || new Date());
      setStartTime(initialTime || "");
      setBayId(initialBayId || "");
      setDuration("1");
      setPlayerCount("1");
      setSelectedCustomerId("");
      setCustomerSearch("");
      setIsAddingNewCustomer(false);
      setBlockReason("");
      resetNewCustomerForm();
      fetchCustomers();
    }
  }, [open, initialDate, initialTime, initialBayId]);

  const resetNewCustomerForm = () => {
    setNewFirstName("");
    setNewLastName("");
    setNewEmail("");
    setNewPhone("");
  };

  const fetchCustomers = async (search?: string) => {
    setIsLoadingCustomers(true);
    
    let query = supabase
      .from("profiles")
      .select("user_id, first_name, last_name, email, phone, membership_tier")
      .order("first_name");
    
    if (search && search.length >= 2) {
      query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%`);
    }
    
    const { data, error } = await query.limit(50);
    
    if (!error && data) {
      setCustomers(data);
    }
    
    setIsLoadingCustomers(false);
  };

  const handleCustomerSearch = (value: string) => {
    setCustomerSearch(value);
    if (value.length >= 2) {
      fetchCustomers(value);
    } else if (value.length === 0) {
      fetchCustomers();
    }
  };

  const calculateEndTime = (start: string, hours: number): string => {
    const [hour, min] = start.split(":").map(Number);
    const endHour = hour + hours;
    return `${endHour.toString().padStart(2, "0")}:${min.toString().padStart(2, "0")}`;
  };

  const getHourlyRate = (tier: string): number => {
    return TIER_RATES[tier.toLowerCase()] || TIER_RATES.visitor;
  };

  const calculateTotalPrice = (): number => {
    if (!selectedCustomer) return 0;
    const hourlyRate = getHourlyRate(selectedCustomer.membership_tier);
    return hourlyRate * parseInt(duration);
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

  const createNewCustomer = async () => {
    if (!newFirstName || !newLastName || !newEmail) {
      toast({
        title: "Missing information",
        description: "Please fill in first name, last name, and email.",
        variant: "destructive",
        duration: 4000,
      });
      return;
    }

    setIsCreatingCustomer(true);

    try {
      // Use edge function to create customer (doesn't affect admin's session)
      const { data, error } = await supabase.functions.invoke("create-customer", {
        body: {
          email: newEmail,
          firstName: newFirstName,
          lastName: newLastName,
          phone: newPhone || undefined,
        },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      // Wait a moment for the profile trigger to create the profile
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Refresh customer list and select the new customer
      await fetchCustomers();
      setSelectedCustomerId(data.user.id);
      setIsAddingNewCustomer(false);
      resetNewCustomerForm();
      
      toast({
        title: "Customer created",
        description: `${newFirstName} ${newLastName} has been added.`,
        duration: 4000,
      });
    } catch (error: any) {
      toast({
        title: "Error creating customer",
        description: error.message || "Failed to create customer.",
        variant: "destructive",
        duration: 4000,
      });
    }

    setIsCreatingCustomer(false);
  };

  const createBooking = async () => {
    if (!selectedCustomerId || !bookingDate || !startTime || !bayId) {
      toast({
        title: "Missing information",
        description: "Please select a customer, date, time, and bay.",
        variant: "destructive",
        duration: 4000,
      });
      return;
    }

    const endTime = calculateEndTime(startTime, parseInt(duration));
    const endHour = parseInt(endTime.split(":")[0]);
    
    if (endHour > 23) {
      toast({
        title: "Invalid time",
        description: "Booking cannot extend past 11pm.",
        variant: "destructive",
        duration: 4000,
      });
      return;
    }

    setIsSaving(true);

    try {
      const hourlyRate = getHourlyRate(selectedCustomer?.membership_tier || "visitor");
      const totalPrice = hourlyRate * parseInt(duration);

      const { data: booking, error } = await supabase
        .from("bookings")
        .insert({
          user_id: selectedCustomerId,
          bay_id: bayId,
          booking_date: format(bookingDate, "yyyy-MM-dd"),
          start_time: startTime,
          end_time: endTime,
          duration_hours: parseInt(duration),
          player_count: parseInt(playerCount),
          hourly_rate: hourlyRate,
          total_price: totalPrice,
          status: "confirmed",
          payment_method: "pending", // Unpaid by default for admin-created bookings
        })
        .select()
        .single();

      if (error) throw error;

      // Send booking notification
      try {
        await supabase.functions.invoke("send-booking-notification", {
          body: {
            booking_id: booking.id,
            notification_type: "confirmation",
          },
        });
      } catch (notifyError) {
        console.error("Failed to send notification:", notifyError);
        // Don't fail the booking if notification fails
      }

      toast({
        title: "Booking created",
        description: `Booking created for ${selectedCustomer?.first_name} ${selectedCustomer?.last_name} and notification sent.`,
        duration: 4000,
      });

      onOpenChange(false);
      onBookingCreated();
    } catch (error: any) {
      toast({
        title: "Error creating booking",
        description: error.message || "Failed to create booking.",
        variant: "destructive",
        duration: 4000,
      });
    }

    setIsSaving(false);
  };

  const createBlock = async () => {
    if (!bookingDate || !startTime || !bayId) {
      toast({
        title: "Missing information",
        description: "Please select a date, time, and bay.",
        variant: "destructive",
        duration: 4000,
      });
      return;
    }

    const endTime = calculateEndTime(startTime, parseInt(duration));
    const endHour = parseInt(endTime.split(":")[0]);
    
    if (endHour > 23) {
      toast({
        title: "Invalid time",
        description: "Block cannot extend past 11pm.",
        variant: "destructive",
        duration: 4000,
      });
      return;
    }

    setIsSaving(true);

    try {
      const { error } = await supabase
        .from("bay_blocks")
        .insert({
          bay_id: bayId,
          block_date: format(bookingDate, "yyyy-MM-dd"),
          start_time: startTime,
          end_time: endTime,
          reason: blockReason || null,
        });

      if (error) throw error;

      toast({
        title: "Bay blocked",
        description: `Bay blocked for ${duration} hour${parseInt(duration) > 1 ? "s" : ""}.`,
        duration: 4000,
      });

      onOpenChange(false);
      onBookingCreated();
    } catch (error: any) {
      toast({
        title: "Error creating block",
        description: error.message || "Failed to block bay.",
        variant: "destructive",
        duration: 4000,
      });
    }

    setIsSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-xl uppercase tracking-wide">
            Add to Timetable
          </DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "booking" | "block")}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="booking" className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Booking
            </TabsTrigger>
            <TabsTrigger value="block" className="flex items-center gap-2">
              <Ban className="h-4 w-4" />
              Block
            </TabsTrigger>
          </TabsList>

          <TabsContent value="booking" className="space-y-4 mt-4">
            {/* Customer Selection */}
            {!isAddingNewCustomer ? (
              <div className="space-y-2">
                <Label>Customer</Label>
                <div className="space-y-2">
                  <Input
                    placeholder="Search by name or email..."
                    value={customerSearch}
                    onChange={(e) => handleCustomerSearch(e.target.value)}
                  />
                  
                  <div className="max-h-40 overflow-y-auto border rounded-md">
                    {isLoadingCustomers ? (
                      <div className="p-3 text-sm text-muted-foreground text-center">Loading...</div>
                    ) : customers.length === 0 ? (
                      <div className="p-3 text-sm text-muted-foreground text-center">No customers found</div>
                    ) : (
                      customers.map((customer) => (
                        <button
                          key={customer.user_id}
                          onClick={() => setSelectedCustomerId(customer.user_id)}
                          className={`w-full p-2 text-left text-sm hover:bg-muted/50 flex items-center justify-between border-b last:border-b-0 ${
                            selectedCustomerId === customer.user_id ? "bg-primary/10" : ""
                          }`}
                        >
                          <div>
                            <span className="font-medium">{customer.first_name} {customer.last_name}</span>
                            <span className="text-muted-foreground ml-2">{customer.email}</span>
                          </div>
                          <Badge className={`text-[10px] ${getMembershipColor(customer.membership_tier)}`}>
                            {customer.membership_tier}
                          </Badge>
                        </button>
                      ))
                    )}
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => setIsAddingNewCustomer(true)}
                  >
                    <UserPlus className="h-4 w-4 mr-2" />
                    Add New Customer
                  </Button>
                </div>

                {selectedCustomer && (
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm">
                        {selectedCustomer.first_name} {selectedCustomer.last_name}
                      </span>
                      <Badge className={getMembershipColor(selectedCustomer.membership_tier)}>
                        {selectedCustomer.membership_tier} - ${getHourlyRate(selectedCustomer.membership_tier)}/hr
                      </Badge>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3 p-3 border rounded-lg bg-muted/30">
                <div className="flex items-center justify-between">
                  <Label className="text-base font-medium">New Customer</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setIsAddingNewCustomer(false);
                      resetNewCustomerForm();
                    }}
                  >
                    Cancel
                  </Button>
                </div>
                
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">First Name *</Label>
                    <Input
                      value={newFirstName}
                      onChange={(e) => setNewFirstName(e.target.value)}
                      placeholder="First name"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Last Name *</Label>
                    <Input
                      value={newLastName}
                      onChange={(e) => setNewLastName(e.target.value)}
                      placeholder="Last name"
                    />
                  </div>
                </div>
                
                <div className="space-y-1">
                  <Label className="text-xs">Email *</Label>
                  <Input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="email@example.com"
                  />
                </div>
                
                <div className="space-y-1">
                  <Label className="text-xs">Phone</Label>
                  <Input
                    type="tel"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    placeholder="Phone number"
                  />
                </div>
                
                <Button
                  type="button"
                  className="w-full"
                  onClick={createNewCustomer}
                  disabled={isCreatingCustomer}
                >
                  {isCreatingCustomer ? "Creating..." : "Create Customer"}
                </Button>
              </div>
            )}

            {/* Date */}
            <div className="space-y-2">
              <Label>Date</Label>
              <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-left">
                    <CalendarIcon className="h-4 w-4 mr-2" />
                    {bookingDate ? format(bookingDate, "EEE, MMM d, yyyy") : "Select date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={bookingDate}
                    onSelect={(date) => {
                      setBookingDate(date);
                      setCalendarOpen(false);
                    }}
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Start Time */}
            <div className="space-y-2">
              <Label>Start Time</Label>
              <Select value={startTime} onValueChange={setStartTime}>
                <SelectTrigger>
                  <SelectValue placeholder="Select time" />
                </SelectTrigger>
                <SelectContent>
                  {TIME_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Duration */}
            <div className="space-y-2">
              <Label>Duration</Label>
              <Select value={duration} onValueChange={setDuration}>
                <SelectTrigger>
                  <SelectValue placeholder="Select duration" />
                </SelectTrigger>
                <SelectContent>
                  {DURATION_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Bay */}
            <div className="space-y-2">
              <Label>Bay</Label>
              <Select value={bayId} onValueChange={setBayId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select bay" />
                </SelectTrigger>
                <SelectContent>
                  {bays.map((bay) => (
                    <SelectItem key={bay.id} value={bay.id}>
                      {bay.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Player Count */}
            <div className="space-y-2">
              <Label>Players</Label>
              <Select value={playerCount} onValueChange={setPlayerCount}>
                <SelectTrigger>
                  <SelectValue placeholder="Select players" />
                </SelectTrigger>
                <SelectContent>
                  {PLAYER_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Price Summary */}
            {selectedCustomer && (
              <div className="p-3 bg-muted/50 rounded-lg">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    {duration} hour{parseInt(duration) > 1 ? "s" : ""} @ ${getHourlyRate(selectedCustomer.membership_tier)}/hr
                  </span>
                  <span className="font-bold text-lg">${calculateTotalPrice()}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Payment will be collected separately
                </p>
              </div>
            )}

            <hr className="border-border" />

            {/* Actions */}
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => onOpenChange(false)}
                disabled={isSaving}
              >
                Cancel
              </Button>
              <Button
                className="flex-1 bg-primary hover:bg-primary/90"
                onClick={createBooking}
                disabled={isSaving || !selectedCustomerId || isAddingNewCustomer}
              >
                <Plus className="h-4 w-4 mr-2" />
                {isSaving ? "Creating..." : "Create Booking"}
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="block" className="space-y-4 mt-4">
            {/* Date */}
            <div className="space-y-2">
              <Label>Date</Label>
              <Popover open={blockCalendarOpen} onOpenChange={setBlockCalendarOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-left">
                    <CalendarIcon className="h-4 w-4 mr-2" />
                    {bookingDate ? format(bookingDate, "EEE, MMM d, yyyy") : "Select date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={bookingDate}
                    onSelect={(date) => {
                      setBookingDate(date);
                      setBlockCalendarOpen(false);
                    }}
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Start Time */}
            <div className="space-y-2">
              <Label>Start Time</Label>
              <Select value={startTime} onValueChange={setStartTime}>
                <SelectTrigger>
                  <SelectValue placeholder="Select time" />
                </SelectTrigger>
                <SelectContent>
                  {TIME_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Duration */}
            <div className="space-y-2">
              <Label>Duration</Label>
              <Select value={duration} onValueChange={setDuration}>
                <SelectTrigger>
                  <SelectValue placeholder="Select duration" />
                </SelectTrigger>
                <SelectContent>
                  {DURATION_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Bay */}
            <div className="space-y-2">
              <Label>Bay</Label>
              <Select value={bayId} onValueChange={setBayId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select bay" />
                </SelectTrigger>
                <SelectContent>
                  {bays.map((bay) => (
                    <SelectItem key={bay.id} value={bay.id}>
                      {bay.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Reason */}
            <div className="space-y-2">
              <Label>Reason (optional)</Label>
              <Textarea
                value={blockReason}
                onChange={(e) => setBlockReason(e.target.value)}
                placeholder="e.g. Maintenance, Private event, etc."
                rows={2}
              />
            </div>

            <div className="p-3 bg-destructive/10 rounded-lg border border-destructive/20">
              <p className="text-sm text-destructive">
                This will block the bay and prevent any bookings during this time.
              </p>
            </div>

            <hr className="border-border" />

            {/* Actions */}
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => onOpenChange(false)}
                disabled={isSaving}
              >
                Cancel
              </Button>
              <Button
                className="flex-1 bg-destructive hover:bg-destructive/90"
                onClick={createBlock}
                disabled={isSaving}
              >
                <Ban className="h-4 w-4 mr-2" />
                {isSaving ? "Blocking..." : "Block Bay"}
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
