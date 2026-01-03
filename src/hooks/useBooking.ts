import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { calculateHourlyRate, isPeakTime, isWeekdayMemberTime } from "@/lib/pricing-utils";

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

export interface SavedCard {
  brand: string;
  last4: string;
  expMonth?: number;
  expYear?: number;
}

// Updated fallback pricing for new tier structure
const FALLBACK_PRICING: Record<string, number> = {
  visitor: 35, // Peak rate
  weekday: 10,
  birdie: 10,
  eagle: 8,
};

export type PaymentMethod = "card" | "balance";

export function useBooking() {
  const [bays, setBays] = useState<Bay[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [userMembershipTier, setUserMembershipTier] = useState<string>("visitor");
  const [customHourlyRate, setCustomHourlyRate] = useState<number | null>(null);
  const [depositBalance, setDepositBalance] = useState<number>(0);
  const [tierPricing, setTierPricing] = useState<Record<string, number>>(FALLBACK_PRICING);
  const [savedCard, setSavedCard] = useState<SavedCard | null>(null);
  const [isLoadingSavedCard, setIsLoadingSavedCard] = useState(true);

  const fetchPricing = async () => {
    const { data, error } = await supabase
      .from("pricing_config")
      .select("tier, hourly_rate");

    if (!error && data) {
      const pricing: Record<string, number> = {};
      data.forEach((p: { tier: string; hourly_rate: number }) => {
        pricing[p.tier] = Number(p.hourly_rate);
      });
      setTierPricing(pricing);
    }
  };

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
        .select("membership_tier, custom_hourly_rate, deposit_balance")
        .eq("user_id", user.id)
        .maybeSingle();

      if (data?.membership_tier) {
        setUserMembershipTier(data.membership_tier);
      }
      if (data?.custom_hourly_rate !== undefined) {
        setCustomHourlyRate(data.custom_hourly_rate);
      }
      if (data?.deposit_balance !== undefined) {
        setDepositBalance(Number(data.deposit_balance) || 0);
      }
    }
  };

  const fetchSavedCard = async () => {
    setIsLoadingSavedCard(true);
    try {
      const { data, error } = await supabase.functions.invoke("get-payment-methods");
      if (!error && data?.paymentMethods?.length > 0) {
        const card = data.paymentMethods.find((pm: any) => pm.type === "card");
        if (card) {
          setSavedCard({ 
            brand: card.brand, 
            last4: card.last4,
            expMonth: card.expMonth,
            expYear: card.expYear,
          });
        }
      }
    } catch (error) {
      console.error("Error fetching saved card:", error);
    } finally {
      setIsLoadingSavedCard(false);
    }
  };

  const fetchBookingsForDate = async (date: Date) => {
    setIsLoading(true);
    const dateStr = format(date, "yyyy-MM-dd");

    const { data, error } = await supabase
      .from("booking_availability")
      .select("bay_id, booking_date, start_time, end_time")
      .eq("booking_date", dateStr);

    if (!error && data) {
      setBookings(data.map(b => ({
        id: '',
        bay_id: b.bay_id,
        booking_date: b.booking_date,
        start_time: b.start_time,
        end_time: b.end_time,
        duration_hours: 0,
        status: 'confirmed'
      })));
    }
    setIsLoading(false);
  };

  /**
   * Get hourly rate based on membership tier, date, and time.
   * Uses peak/off-peak pricing for visitors and weekday restrictions.
   */
  const getHourlyRate = (
    tier: string = userMembershipTier,
    date?: Date,
    startTime?: string
  ): number => {
    // Custom hourly rate overrides everything
    if (customHourlyRate !== null) {
      return customHourlyRate;
    }
    
    // If no date/time provided, return the base tier rate
    if (!date || !startTime) {
      return tierPricing[tier] || FALLBACK_PRICING[tier] || FALLBACK_PRICING.visitor;
    }
    
    // Calculate rate based on tier, date, and time
    return calculateHourlyRate(tier, date, startTime, tierPricing);
  };

  /**
   * Check if a weekday member can book at member rate for given time
   */
  const canWeekdayMemberBook = (date: Date, startTime: string): boolean => {
    if (userMembershipTier !== "weekday") return true;
    return isWeekdayMemberTime(date, startTime);
  };

  /**
   * Get the display rate info for the booking UI
   */
  const getRateInfo = (date: Date, startTime: string): { rate: number; isPeak: boolean; isRestricted: boolean } => {
    const rate = getHourlyRate(userMembershipTier, date, startTime);
    const isPeak = isPeakTime(date, startTime);
    const isRestricted = userMembershipTier === "weekday" && !isWeekdayMemberTime(date, startTime);
    
    return { rate, isPeak, isRestricted };
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
    playerCount: number = 1,
    paymentMethod: PaymentMethod = "card",
    newPaymentMethodId?: string
  ): Promise<{ booking: any; requiresCheckout?: boolean; checkoutUrl?: string }> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    // Calculate rate with peak/off-peak logic
    const hourlyRate = getHourlyRate(userMembershipTier, date, startTime);
    const totalPrice = hourlyRate * durationHours;

    // If using balance, check if sufficient funds
    if (paymentMethod === "balance") {
      if (depositBalance < totalPrice) {
        throw new Error("Insufficient balance");
      }
      
      const newBalance = depositBalance - totalPrice;
      const { error: balanceError } = await supabase
        .from("profiles")
        .update({ deposit_balance: newBalance })
        .eq("user_id", user.id);
      
      if (balanceError) throw new Error("Failed to deduct balance");
      setDepositBalance(newBalance);
    }

    const startHour = parseInt(startTime.split(":")[0]);
    const startMinute = parseInt(startTime.split(":")[1]);
    const endHour = startHour + durationHours;
    const endTime = `${endHour.toString().padStart(2, "0")}:${startMinute.toString().padStart(2, "0")}`;

    const { data: bookingData, error } = await supabase
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
        payment_method: paymentMethod === "balance" ? "balance" : "pending",
        status: paymentMethod === "balance" ? "confirmed" : "pending",
      })
      .select()
      .single();

    if (error) throw error;

    if (paymentMethod === "card") {
      const bayName = bays.find(b => b.id === bayId)?.name || "Bay";
      const description = `${bayName} - ${format(date, "PPP")} at ${startTime} (${durationHours}hr)`;
      
      const { data: chargeResult, error: chargeError } = await supabase.functions.invoke("charge-booking", {
        body: {
          bookingId: bookingData.id,
          amount: totalPrice,
          description,
          paymentMethodId: newPaymentMethodId,
        },
      });

      if (chargeError) {
        await supabase.from("bookings").delete().eq("id", bookingData.id);
        throw new Error(chargeError.message || "Payment failed");
      }

      if (chargeResult.error) {
        await supabase.from("bookings").delete().eq("id", bookingData.id);
        throw new Error(chargeResult.error);
      }

      if (chargeResult.requiresCheckout) {
        return { 
          booking: bookingData, 
          requiresCheckout: true, 
          checkoutUrl: chargeResult.checkoutUrl 
        };
      }
    }

    try {
      await supabase.functions.invoke("send-booking-notification", {
        body: {
          booking_id: bookingData.id,
          notification_type: "confirmation",
        },
      });
    } catch (notificationError) {
      console.error("Failed to send booking notification:", notificationError);
    }

    return { booking: bookingData };
  };

  useEffect(() => {
    fetchBays();
    fetchUserProfile();
    fetchPricing();
    fetchSavedCard();
  }, []);

  return {
    bays,
    bookings,
    isLoading,
    userMembershipTier,
    depositBalance,
    savedCard,
    isLoadingSavedCard,
    tierPricing,
    getHourlyRate,
    getRateInfo,
    canWeekdayMemberBook,
    fetchBookingsForDate,
    checkBayAvailability,
    createBooking,
  };
}
