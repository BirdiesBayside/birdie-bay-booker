import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { startOfMonth, subMonths, format, startOfWeek, subWeeks, startOfDay, subDays, startOfYear, isWithinInterval } from "date-fns";

export type AnalyticsTimeframe = "today" | "7d" | "30d" | "90d" | "6m" | "12m" | "all";

export interface AnalyticsData {
  // Growth metrics
  newCustomersThisWeek: number;
  newCustomersLastWeek: number;
  returnRate: number;
  memberConversionRate: number;
  churnRate: number;
  totalCustomers: number;
  
  // Revenue
  monthlyRevenue: { month: string; bookings: number; pos: number; memberships: number }[];
  avgBookingValue: number;
  avgSessionDuration: number;
  
  // Engagement
  bookingFrequency: { range: string; count: number; percentage: number }[];
  dayOfWeekUtilization: { day: string; hours: number }[];
  
  // Hourly heatmap
  hourlyHeatmap: { day: number; hour: number; bookings: number }[];
}

function getTimeframeRange(timeframe: AnalyticsTimeframe): { start: Date; end: Date } {
  const now = new Date();
  const end = now;
  let start: Date;

  switch (timeframe) {
    case "today":
      start = startOfDay(now);
      break;
    case "7d":
      start = subDays(now, 7);
      break;
    case "30d":
      start = subDays(now, 30);
      break;
    case "90d":
      start = subDays(now, 90);
      break;
    case "6m":
      start = subMonths(now, 6);
      break;
    case "12m":
      start = subMonths(now, 12);
      break;
    case "all":
      start = new Date(2020, 0, 1);
      break;
  }

  return { start, end };
}

export function useAnalyticsData(timeframe: AnalyticsTimeframe = "30d") {
  return useQuery({
    queryKey: ["analytics-dashboard", timeframe],
    queryFn: async (): Promise<AnalyticsData> => {
      const now = new Date();
      const { start: rangeStart } = getTimeframeRange(timeframe);
      const thisWeekStart = startOfWeek(now, { weekStartsOn: 1 });
      const lastWeekStart = startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });

      // Fetch all required data in parallel
      const [
        bookingsData,
        profilesData,
        posData,
        membershipPaymentsData,
      ] = await Promise.all([
        supabase
          .from("bookings")
          .select("id, user_id, created_at, booking_date, start_time, end_time, duration_hours, total_price, status")
          .neq("status", "cancelled"),
        supabase
          .from("profiles")
          .select("user_id, membership_tier, created_at, updated_at"),
        supabase
          .from("pos_transactions")
          .select("id, total, created_at"),
        supabase
          .from("membership_payments")
          .select("id, amount, paid_at, user_id"),
      ]);

      const allBookings = bookingsData.data || [];
      const profiles = profilesData.data || [];
      const allPosTransactions = posData.data || [];
      const allMembershipPayments = membershipPaymentsData.data || [];

      // Filter data by timeframe
      const bookings = allBookings.filter(b => new Date(b.created_at) >= rangeStart);
      const posTransactions = allPosTransactions.filter(t => new Date(t.created_at) >= rangeStart);
      const membershipPayments = allMembershipPayments.filter(p => new Date(p.paid_at) >= rangeStart);

      // Calculate first booking date for each user (within timeframe)
      const userFirstBooking = new Map<string, Date>();
      bookings.forEach((b) => {
        const date = new Date(b.created_at);
        const existing = userFirstBooking.get(b.user_id);
        if (!existing || date < existing) {
          userFirstBooking.set(b.user_id, date);
        }
      });

      // For "new customers" we check if their first-ever booking is within the timeframe
      const allUserFirstBooking = new Map<string, Date>();
      allBookings.forEach((b) => {
        const date = new Date(b.created_at);
        const existing = allUserFirstBooking.get(b.user_id);
        if (!existing || date < existing) {
          allUserFirstBooking.set(b.user_id, date);
        }
      });

      // New customers this week vs last week
      let newCustomersThisWeek = 0;
      let newCustomersLastWeek = 0;
      allUserFirstBooking.forEach((firstDate) => {
        if (firstDate >= thisWeekStart) {
          newCustomersThisWeek++;
        } else if (firstDate >= lastWeekStart && firstDate < thisWeekStart) {
          newCustomersLastWeek++;
        }
      });

      // Return rate (users with 2+ bookings in timeframe)
      const userBookingCounts = new Map<string, number>();
      bookings.forEach((b) => {
        userBookingCounts.set(b.user_id, (userBookingCounts.get(b.user_id) || 0) + 1);
      });
      const totalUniqueCustomers = userBookingCounts.size;
      let returningCustomers = 0;
      userBookingCounts.forEach((count) => {
        if (count >= 2) returningCustomers++;
      });
      const returnRate = totalUniqueCustomers > 0 
        ? (returningCustomers / totalUniqueCustomers) * 100 
        : 0;

      // Member conversion rate
      const totalProfiles = profiles.length;
      const members = profiles.filter((p) => p.membership_tier !== "visitor").length;
      const memberConversionRate = totalProfiles > 0 
        ? (members / totalProfiles) * 100 
        : 0;

      // Churn rate
      const paidMemberUserIds = new Set(membershipPayments.map((p) => p.user_id));
      const churnedMembers = profiles.filter(
        (p) => p.membership_tier === "visitor" && paidMemberUserIds.has(p.user_id)
      ).length;
      const churnRate = members + churnedMembers > 0 
        ? (churnedMembers / (members + churnedMembers)) * 100 
        : 0;

      // Monthly revenue - adapt bucket count based on timeframe
      const monthCount = timeframe === "today" ? 1 
        : timeframe === "7d" ? 1 
        : timeframe === "30d" ? 1 
        : timeframe === "90d" ? 3 
        : timeframe === "6m" ? 6 
        : timeframe === "12m" ? 12 
        : 12;

      const monthlyRevenue: { month: string; bookings: number; pos: number; memberships: number }[] = [];
      for (let i = monthCount - 1; i >= 0; i--) {
        const monthStart = startOfMonth(subMonths(now, i));
        const monthEnd = startOfMonth(subMonths(now, i - 1));
        const monthLabel = format(monthStart, "MMM");

        const bookingRev = bookings
          .filter((b) => {
            const date = new Date(b.created_at);
            return date >= monthStart && date < monthEnd;
          })
          .reduce((sum, b) => sum + Number(b.total_price), 0);

        const posRev = posTransactions
          .filter((t) => {
            const date = new Date(t.created_at);
            return date >= monthStart && date < monthEnd;
          })
          .reduce((sum, t) => sum + Number(t.total), 0);

        const memberRev = membershipPayments
          .filter((p) => {
            const date = new Date(p.paid_at);
            return date >= monthStart && date < monthEnd;
          })
          .reduce((sum, p) => sum + Number(p.amount), 0);

        monthlyRevenue.push({
          month: monthLabel,
          bookings: Math.round(bookingRev),
          pos: Math.round(posRev),
          memberships: Math.round(memberRev),
        });
      }

      // Average booking value and duration (within timeframe)
      const completedBookings = bookings.filter((b) => b.status === "confirmed");
      const avgBookingValue = completedBookings.length > 0
        ? completedBookings.reduce((sum, b) => sum + Number(b.total_price), 0) / completedBookings.length
        : 0;
      const avgSessionDuration = completedBookings.length > 0
        ? completedBookings.reduce((sum, b) => sum + (b.duration_hours || 1), 0) / completedBookings.length
        : 0;

      // Booking frequency distribution (within timeframe)
      const frequencyRanges = [
        { range: "1 booking", min: 1, max: 1 },
        { range: "2-3 bookings", min: 2, max: 3 },
        { range: "4-10 bookings", min: 4, max: 10 },
        { range: "10+ bookings", min: 11, max: Infinity },
      ];
      const bookingFrequency = frequencyRanges.map(({ range, min, max }) => {
        let count = 0;
        userBookingCounts.forEach((bookingCount) => {
          if (bookingCount >= min && bookingCount <= max) count++;
        });
        return {
          range,
          count,
          percentage: totalUniqueCustomers > 0 ? (count / totalUniqueCustomers) * 100 : 0,
        };
      });

      // Day of week utilization (within timeframe)
      const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
      const dayHours = [0, 0, 0, 0, 0, 0, 0];
      bookings
        .filter((b) => new Date(b.booking_date) >= rangeStart)
        .forEach((b) => {
          const date = new Date(b.booking_date);
          let dayIndex = date.getDay() - 1;
          if (dayIndex < 0) dayIndex = 6;
          dayHours[dayIndex] += b.duration_hours || 1;
        });
      const dayOfWeekUtilization = days.map((day, i) => ({
        day,
        hours: Math.round(dayHours[i]),
      }));

      // Hourly heatmap (within timeframe)
      const heatmapData = new Map<string, number>();
      bookings
        .filter((b) => new Date(b.booking_date) >= rangeStart)
        .forEach((b) => {
          const date = new Date(b.booking_date);
          let dayIndex = date.getDay() - 1;
          if (dayIndex < 0) dayIndex = 6;
          
          const startHour = parseInt(b.start_time.split(":")[0], 10);
          const duration = b.duration_hours || 1;
          
          for (let h = 0; h < duration; h++) {
            const hour = startHour + h;
            if (hour < 24) {
              const key = `${dayIndex}-${hour}`;
              heatmapData.set(key, (heatmapData.get(key) || 0) + 1);
            }
          }
        });
      
      const hourlyHeatmap: { day: number; hour: number; bookings: number }[] = [];
      for (let day = 0; day < 7; day++) {
        for (let hour = 6; hour <= 22; hour++) {
          hourlyHeatmap.push({
            day,
            hour,
            bookings: heatmapData.get(`${day}-${hour}`) || 0,
          });
        }
      }

      return {
        newCustomersThisWeek,
        newCustomersLastWeek,
        returnRate,
        memberConversionRate,
        churnRate,
        totalCustomers: totalUniqueCustomers,
        monthlyRevenue,
        avgBookingValue,
        avgSessionDuration,
        bookingFrequency,
        dayOfWeekUtilization,
        hourlyHeatmap,
      };
    },
    staleTime: 1000 * 60 * 5,
    refetchInterval: 1000 * 60,
  });
}
