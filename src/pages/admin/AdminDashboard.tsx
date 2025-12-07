import { useAdminAuth } from "@/hooks/useAdminAuth";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar, DollarSign, TrendingUp, Users, UserCheck, Repeat } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

interface DashboardStats {
  todaysBookings: number;
  todaysRevenue: number;
  todaysOccupancy: number;
  memberCount: number;
  memberRevenue: number;
  momGrowth: number;
}

export default function AdminDashboard() {
  const { isAdmin, isLoading } = useAdminAuth();
  const [stats, setStats] = useState<DashboardStats>({
    todaysBookings: 0,
    todaysRevenue: 0,
    todaysOccupancy: 0,
    memberCount: 0,
    memberRevenue: 0,
    momGrowth: 0,
  });
  const [loadingStats, setLoadingStats] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      const today = new Date();
      const todayStr = format(today, 'yyyy-MM-dd');
      
      // Fetch today's bookings
      const { data: bookings, error } = await supabase
        .from('bookings')
        .select('total_price, duration_hours, status')
        .eq('booking_date', todayStr)
        .neq('status', 'cancelled');

      if (error) {
        console.error('Error fetching stats:', error);
        setLoadingStats(false);
        return;
      }

      const todaysBookings = bookings?.length || 0;
      const todaysRevenue = bookings?.reduce((sum, b) => sum + Number(b.total_price), 0) || 0;
      
      // Calculate occupancy: 6 bays * 18 hours (5am-11pm) = 108 total hours available
      const totalHoursAvailable = 6 * 18;
      const bookedHours = bookings?.reduce((sum, b) => sum + b.duration_hours, 0) || 0;
      const todaysOccupancy = Math.round((bookedHours / totalHoursAvailable) * 100);

      // Fetch member count (non-visitor tiers)
      const { data: members, error: membersError } = await supabase
        .from('profiles')
        .select('membership_tier')
        .neq('membership_tier', 'visitor');
      
      const memberCount = members?.length || 0;

      // Calculate member revenue (weekly subscription fees per tier)
      const weeklyFees: Record<string, number> = {
        par: 29,
        birdie: 39,
        eagle: 49,
        albatross: 59,
      };
      
      const memberRevenue = members?.reduce((sum, m) => {
        const fee = weeklyFees[m.membership_tier as string] || 0;
        return sum + fee;
      }, 0) || 0;

      // Calculate MoM growth (compare current month period to same period last month)
      const currentDay = today.getDate();
      const currentMonthStart = format(new Date(today.getFullYear(), today.getMonth(), 1), 'yyyy-MM-dd');
      const lastMonthStart = format(new Date(today.getFullYear(), today.getMonth() - 1, 1), 'yyyy-MM-dd');
      const lastMonthSameDay = format(new Date(today.getFullYear(), today.getMonth() - 1, currentDay), 'yyyy-MM-dd');

      // Current month bookings (1st to today)
      const { data: currentMonthBookings } = await supabase
        .from('bookings')
        .select('duration_hours')
        .gte('booking_date', currentMonthStart)
        .lte('booking_date', todayStr)
        .neq('status', 'cancelled');

      // Last month bookings (1st to same day)
      const { data: lastMonthBookings } = await supabase
        .from('bookings')
        .select('duration_hours')
        .gte('booking_date', lastMonthStart)
        .lte('booking_date', lastMonthSameDay)
        .neq('status', 'cancelled');

      const currentMonthHours = currentMonthBookings?.reduce((sum, b) => sum + b.duration_hours, 0) || 0;
      const lastMonthHours = lastMonthBookings?.reduce((sum, b) => sum + b.duration_hours, 0) || 0;
      
      let momGrowth = 0;
      if (lastMonthHours > 0) {
        momGrowth = Math.round(((currentMonthHours - lastMonthHours) / lastMonthHours) * 100);
      } else if (currentMonthHours > 0) {
        momGrowth = 100;
      }

      setStats({
        todaysBookings,
        todaysRevenue,
        todaysOccupancy,
        memberCount,
        memberRevenue,
        momGrowth,
      });
      setLoadingStats(false);
    };

    if (isAdmin) {
      fetchStats();
    }
  }, [isAdmin]);

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="p-6 space-y-6">
          <Skeleton className="h-10 w-48" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
        </div>
      </AdminLayout>
    );
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="font-display text-3xl uppercase tracking-wide text-foreground">
            Dashboard
          </h1>
          <p className="text-muted-foreground mt-1">
            Overview of your business
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Today's Bookings
              </CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {loadingStats ? (
                <Skeleton className="h-8 w-12" />
              ) : (
                <div className="text-2xl font-display">{stats.todaysBookings}</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Today's Revenue
              </CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {loadingStats ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <div className="text-2xl font-display">${stats.todaysRevenue.toFixed(0)}</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Today's Occupancy
              </CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {loadingStats ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <div className="text-2xl font-display">{stats.todaysOccupancy}%</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Member Count
              </CardTitle>
              <UserCheck className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {loadingStats ? (
                <Skeleton className="h-8 w-12" />
              ) : (
                <div className="text-2xl font-display">{stats.memberCount}</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Member Revenue
              </CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {loadingStats ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <div className="text-2xl font-display">${stats.memberRevenue}/wk</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                MoM Growth
              </CardTitle>
              <Repeat className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {loadingStats ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <div className={`text-2xl font-display ${stats.momGrowth >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {stats.momGrowth >= 0 ? '+' : ''}{stats.momGrowth}%
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Quick Links */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => window.location.href = '/admin/timetable'}>
            <CardContent className="p-6 flex items-center gap-4">
              <div className="p-3 rounded-lg bg-primary/10">
                <Calendar className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h3 className="font-medium">View Timetable</h3>
                <p className="text-sm text-muted-foreground">Manage bay bookings and schedule</p>
              </div>
            </CardContent>
          </Card>

          <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => window.location.href = '/admin/customers'}>
            <CardContent className="p-6 flex items-center gap-4">
              <div className="p-3 rounded-lg bg-accent/10">
                <Users className="h-6 w-6 text-accent" />
              </div>
              <div>
                <h3 className="font-medium">Manage Customers</h3>
                <p className="text-sm text-muted-foreground">View and edit customer details</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AdminLayout>
  );
}
