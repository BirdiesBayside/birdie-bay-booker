import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

export interface Bay {
  id: string;
  bay_number: number;
  name: string;
  is_active: boolean;
}

export interface Booking {
  id: string;
  bay_id: string;
  booking_date: string;
  start_time: string;
  end_time: string;
  duration_hours: number;
  status: string;
}

export interface MembershipPricing {
  tier: string;
  hourlyRate: number;
}

const MEMBERSHIP_PRICING: Record<string, number> = {
  visitor: 30,
  par: 12,
  birdie: 10,
  eagle: 9,
  albatross: 8,
};

export function useBooking() {
  const [bays, setBays] = useState<Bay[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [userMembershipTier, setUserMembershipTier] = useState<string>("visitor");

  const fetchBays = async () => {
    const { data, error } = await supabase
      .from("bays")
      .select("*")
      .order("bay_number");

    if (!error && data) {
      setBays(data);
    }
  };

  const fetchUserProfile = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase
        .from("profiles")
        .select("membership_tier")
        .eq("user_id", user.id)
        .maybeSingle();

      if (data?.membership_tier) {
        setUserMembershipTier(data.membership_tier);
      }
    }
  };

  const fetchBookingsForDate = async (date: Date) => {
    setIsLoading(true);
    const dateStr = format(date, "yyyy-MM-dd");

    // Use the secure booking_availability view that only exposes scheduling data
    const { data, error } = await supabase
      .from("booking_availability")
      .select("bay_id, booking_date, start_time, end_time")
      .eq("booking_date", dateStr);

    if (!error && data) {
      // Map to Booking interface with minimal required fields for availability
      setBookings(data.map(b => ({
        id: '', // Not available from view - not needed for availability
        bay_id: b.bay_id,
        booking_date: b.booking_date,
        start_time: b.start_time,
        end_time: b.end_time,
        duration_hours: 0, // Not available from view - not needed for availability
        status: 'confirmed'
      })));
    }
    setIsLoading(false);
  };

  const getHourlyRate = (tier: string = userMembershipTier): number => {
    return MEMBERSHIP_PRICING[tier] || MEMBERSHIP_PRICING.visitor;
  };

  const checkBayAvailability = (
    bayId: string,
    startTime: string,
    durationHours: number
  ): boolean => {
    const startHour = parseInt(startTime.split(":")[0]);
    const startMinute = parseInt(startTime.split(":")[1]);
    const startMinutes = startHour * 60 + startMinute;
    const endMinutes = startMinutes + durationHours * 60;

    const bayBookings = bookings.filter((b) => b.bay_id === bayId);

    for (const booking of bayBookings) {
      const bookingStartHour = parseInt(booking.start_time.split(":")[0]);
      const bookingStartMin = parseInt(booking.start_time.split(":")[1]);
      const bookingEndHour = parseInt(booking.end_time.split(":")[0]);
      const bookingEndMin = parseInt(booking.end_time.split(":")[1]);

      const bookingStartMinutes = bookingStartHour * 60 + bookingStartMin;
      const bookingEndMinutes = bookingEndHour * 60 + bookingEndMin;

      // Check for overlap
      if (startMinutes < bookingEndMinutes && endMinutes > bookingStartMinutes) {
        return false;
      }
    }

    return true;
  };

  const createBooking = async (
    bayId: string,
    date: Date,
    startTime: string,
    durationHours: number,
    playerCount: number = 1
  ) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const hourlyRate = getHourlyRate();
    const totalPrice = hourlyRate * durationHours;

    const startHour = parseInt(startTime.split(":")[0]);
    const startMinute = parseInt(startTime.split(":")[1]);
    const endHour = startHour + durationHours;
    const endTime = `${endHour.toString().padStart(2, "0")}:${startMinute.toString().padStart(2, "0")}`;

    const { data, error } = await supabase
      .from("bookings")
      .insert({
        user_id: user.id,
        bay_id: bayId,
        booking_date: format(date, "yyyy-MM-dd"),
        start_time: startTime,
        end_time: endTime,
        duration_hours: durationHours,
        hourly_rate: hourlyRate,
        total_price: totalPrice,
        player_count: playerCount,
      })
      .select()
      .single();

    if (error) throw error;

    // Send booking confirmation notification
    try {
      await supabase.functions.invoke("send-booking-notification", {
        body: {
          booking_id: data.id,
          notification_type: "confirmation",
        },
      });
    } catch (notificationError) {
      console.error("Failed to send booking notification:", notificationError);
      // Don't throw - booking was successful, notification is secondary
    }

    return data;
  };

  useEffect(() => {
    fetchBays();
    fetchUserProfile();
  }, []);

  return {
    bays,
    bookings,
    isLoading,
    userMembershipTier,
    getHourlyRate,
    fetchBookingsForDate,
    checkBayAvailability,
    createBooking,
  };
}
