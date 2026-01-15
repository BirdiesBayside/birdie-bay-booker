import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { calculateHourlyRate, isPeakTime, isWeekdayMemberTime } from "@/lib/pricing-utils";
import { Capacitor } from "@capacitor/core";
import { QUERY_KEYS, STALE_TIMES } from "@/lib/query-keys";

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

// Fetch functions extracted for React Query
const fetchBays = async (): Promise<Bay[]> => {
  const { data, error } = await supabase
    .from("bays")
    .select("*")
    .order("bay_number");

  if (error) throw error;
  return data || [];
};

const fetchPricing = async (): Promise<Record<string, number>> => {
  const { data, error } = await supabase
    .from("pricing_config")
    .select("tier, hourly_rate");

  if (error) throw error;
  
  const pricing: Record<string, number> = {};
  (data || []).forEach((p: { tier: string; hourly_rate: number }) => {
    pricing[p.tier] = Number(p.hourly_rate);
  });
  return pricing;
};

const fetchUserProfile = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("membership_tier, custom_hourly_rate, deposit_balance")
    .eq("user_id", user.id)
    .maybeSingle();

  return {
    userId: user.id,
    membershipTier: data?.membership_tier || "visitor",
    customHourlyRate: data?.custom_hourly_rate ?? null,
    depositBalance: Number(data?.deposit_balance) || 0,
  };
};

const fetchSavedCard = async (): Promise<SavedCard | null> => {
  const { data, error } = await supabase.functions.invoke("get-payment-methods");
  if (error || !data?.paymentMethods?.length) return null;
  
  const card = data.paymentMethods.find((pm: any) => pm.type === "card");
  if (!card) return null;
  
  return {
    brand: card.brand,
    last4: card.last4,
    expMonth: card.expMonth,
    expYear: card.expYear,
  };
};

export function useBooking() {
  const queryClient = useQueryClient();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Static data - cached for 30 minutes (bays rarely change)
  const { data: bays = [] } = useQuery({
    queryKey: QUERY_KEYS.BAYS,
    queryFn: fetchBays,
    staleTime: STALE_TIMES.STATIC,
  });

  // Static data - cached for 30 minutes (pricing rarely changes)
  const { data: tierPricing = FALLBACK_PRICING } = useQuery({
    queryKey: QUERY_KEYS.PRICING,
    queryFn: fetchPricing,
    staleTime: STALE_TIMES.STATIC,
  });

  // User data - cached for 5 minutes
  const { data: userProfile } = useQuery({
    queryKey: QUERY_KEYS.USER_PROFILE(),
    queryFn: fetchUserProfile,
    staleTime: STALE_TIMES.SEMI_STATIC,
  });

  // Saved card - cached for 5 minutes
  const { data: savedCard, isLoading: isLoadingSavedCard, refetch: refetchSavedCard } = useQuery({
    queryKey: QUERY_KEYS.SAVED_CARD,
    queryFn: fetchSavedCard,
    staleTime: STALE_TIMES.SEMI_STATIC,
  });

  // Derived values from user profile
  const userMembershipTier = userProfile?.membershipTier || "visitor";
  const customHourlyRate = userProfile?.customHourlyRate ?? null;
  const depositBalance = userProfile?.depositBalance || 0;

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
    newPaymentMethodId?: string,
    partialBalanceAmount?: number
  ): Promise<{ booking: any; requiresCheckout?: boolean; checkoutUrl?: string }> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    // Calculate rate with peak/off-peak logic
    const hourlyRate = getHourlyRate(userMembershipTier, date, startTime);
    const totalPrice = hourlyRate * durationHours;
    
    // Track how much to deduct from balance and charge to card
    let balanceDeduction = 0;
    let cardAmount = totalPrice;
    let currentDepositBalance = depositBalance;

    // If using balance, check if sufficient funds
    if (paymentMethod === "balance") {
      if (currentDepositBalance < totalPrice) {
        throw new Error("Insufficient balance");
      }
      balanceDeduction = totalPrice;
      cardAmount = 0;
      
      const newBalance = currentDepositBalance - totalPrice;
      const { error: balanceError } = await supabase
        .from("profiles")
        .update({ deposit_balance: newBalance })
        .eq("user_id", user.id);
      
      if (balanceError) throw new Error("Failed to deduct balance");
      // Invalidate user profile cache to refresh balance
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.USER_PROFILE() });
    } else if (partialBalanceAmount && partialBalanceAmount > 0) {
      // Partial balance usage with card payment
      balanceDeduction = Math.min(partialBalanceAmount, totalPrice);
      cardAmount = totalPrice - balanceDeduction;
      
      const newBalance = currentDepositBalance - balanceDeduction;
      const { error: balanceError } = await supabase
        .from("profiles")
        .update({ deposit_balance: newBalance })
        .eq("user_id", user.id);
      
      if (balanceError) throw new Error("Failed to deduct balance");
      // Invalidate user profile cache to refresh balance
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.USER_PROFILE() });
    }

    const startHour = parseInt(startTime.split(":")[0]);
    const startMinute = parseInt(startTime.split(":")[1]);
    const endHour = startHour + durationHours;
    const endTime = `${endHour.toString().padStart(2, "0")}:${startMinute.toString().padStart(2, "0")}`;

    // Auto-confirm if total is $0 (free booking) or paid by balance
    // Use <= 0 to handle floating point edge cases
    const isFreeBooking = totalPrice <= 0;
    const shouldAutoConfirm = isFreeBooking || paymentMethod === "balance";
    
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
        payment_method: isFreeBooking ? "free" : (paymentMethod === "balance" ? "balance" : (balanceDeduction > 0 ? "partial" : "pending")),
        status: shouldAutoConfirm ? "confirmed" : "pending",
      })
      .select()
      .single();

    if (error) throw error;

    // Only charge card if there's an amount to charge
    if (paymentMethod === "card" && cardAmount > 0) {
      const bayName = bays.find(b => b.id === bayId)?.name || "Bay";
      const description = `${bayName} - ${format(date, "PPP")} at ${startTime} (${durationHours}hr)`;
      
      const { data: chargeResult, error: chargeError } = await supabase.functions.invoke("charge-booking", {
        body: {
          bookingId: bookingData.id,
          amount: cardAmount,
          description,
          paymentMethodId: newPaymentMethodId,
          isNativeApp: Capacitor.isNativePlatform(),
        },
      });

      if (chargeError) {
        // Restore balance if card payment fails
        if (balanceDeduction > 0) {
          await supabase
            .from("profiles")
            .update({ deposit_balance: currentDepositBalance })
            .eq("user_id", user.id);
          queryClient.invalidateQueries({ queryKey: QUERY_KEYS.USER_PROFILE() });
        }
        await supabase.from("bookings").delete().eq("id", bookingData.id);
        throw new Error(chargeError.message || "Payment failed");
      }

      if (chargeResult.error) {
        // Restore balance if card payment fails
        if (balanceDeduction > 0) {
          await supabase
            .from("profiles")
            .update({ deposit_balance: currentDepositBalance })
            .eq("user_id", user.id);
          queryClient.invalidateQueries({ queryKey: QUERY_KEYS.USER_PROFILE() });
        }
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

  return {
    bays,
    bookings,
    isLoading,
    userMembershipTier,
    depositBalance,
    savedCard: savedCard ?? null,
    isLoadingSavedCard,
    tierPricing,
    getHourlyRate,
    getRateInfo,
    canWeekdayMemberBook,
    fetchBookingsForDate,
    checkBayAvailability,
    createBooking,
    refetchSavedCard,
  };
}
