import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Trophy, Calendar, Users, FileText, RefreshCw, MapPin, Mail, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { format } from "date-fns";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

export function SGTDashboard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [syncing, setSyncing] = useState(false);

  // Fetch tour count
  const { data: toursData } = useQuery({
    queryKey: ["sgt-tours-count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("sgt_tours")
        .select("*", { count: "exact", head: true });
      if (error) throw error;
      return count || 0;
    },
  });

  // Fetch active tours count
  const { data: activeToursData } = useQuery({
    queryKey: ["sgt-active-tours-count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("sgt_tours")
        .select("*", { count: "exact", head: true })
        .eq("active", 1);
      if (error) throw error;
      return count || 0;
    },
  });

  // Fetch tournament count
  const { data: tournamentsData } = useQuery({
    queryKey: ["sgt-tournaments-count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("sgt_tournaments")
        .select("*", { count: "exact", head: true });
      if (error) throw error;
      return count || 0;
    },
  });

  // Fetch member count
  const { data: membersData } = useQuery({
    queryKey: ["sgt-members-count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("sgt_members")
        .select("*", { count: "exact", head: true });
      if (error) throw error;
      return count || 0;
    },
  });

  // Fetch scorecard count
  const { data: scorecardsData } = useQuery({
    queryKey: ["sgt-scorecards-count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("sgt_scorecards")
        .select("*", { count: "exact", head: true });
      if (error) throw error;
      return count || 0;
    },
  });

  // Fetch course count
  const { data: coursesData } = useQuery({
    queryKey: ["sgt-courses-count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("sgt_courses")
        .select("*", { count: "exact", head: true });
      if (error) throw error;
      return count || 0;
    },
  });

  // Fetch recent tournaments
  const { data: recentTournaments } = useQuery({
    queryKey: ["sgt-recent-tournaments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sgt_tournaments")
        .select("*")
        .order("start_date", { ascending: false })
        .limit(5);
      if (error) throw error;
      return data;
    },
  });

  // Fetch notification settings
  const { data: notificationSettings } = useQuery({
    queryKey: ["sgt-notification-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sgt_notification_settings")
        .select("*")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Mutation to update notification settings
  const updateNotificationMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      // Check if settings row exists
      const { data: existing } = await supabase
        .from("sgt_notification_settings")
        .select("id")
        .limit(1)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from("sgt_notification_settings")
          .update({ 
            new_member_email_enabled: enabled,
            updated_at: new Date().toISOString()
          })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("sgt_notification_settings")
          .insert({ new_member_email_enabled: enabled });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sgt-notification-settings"] });
      toast({
        title: "Settings updated",
        description: "Notification preferences saved.",
      });
    },
    onError: (error) => {
      toast({
        title: "Failed to update settings",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    },
  });

  const handleSync = async () => {
    setSyncing(true);
    try {
      const { error } = await supabase.functions.invoke("sgt-sync");
      if (error) throw error;
      toast({
        title: "Sync started",
        description: "SGT data sync has been triggered.",
      });
    } catch (error) {
      toast({
        title: "Sync failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSyncing(false);
    }
  };

  const stats = [
    {
      title: "Total Tours",
      value: toursData ?? 0,
      subtitle: `${activeToursData ?? 0} active`,
      icon: Trophy,
      color: "text-amber-500",
      bgColor: "bg-amber-500/10",
    },
    {
      title: "Tournaments",
      value: tournamentsData ?? 0,
      subtitle: "All time",
      icon: Calendar,
      color: "text-blue-500",
      bgColor: "bg-blue-500/10",
    },
    {
      title: "Members",
      value: membersData ?? 0,
      subtitle: "Registered",
      icon: Users,
      color: "text-green-500",
      bgColor: "bg-green-500/10",
    },
    {
      title: "Scorecards",
      value: scorecardsData ?? 0,
      subtitle: "Recorded",
      icon: FileText,
      color: "text-purple-500",
      bgColor: "bg-purple-500/10",
    },
    {
      title: "Courses",
      value: coursesData ?? 0,
      subtitle: "Available",
      icon: MapPin,
      color: "text-orange-500",
      bgColor: "bg-orange-500/10",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header with Sync Button */}
      <div className="flex justify-between items-center">
        <div className="flex-1" />
        <Button onClick={handleSync} disabled={syncing} variant="outline" className="gap-2">
          <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? "Syncing..." : "Sync Data"}
        </Button>
      </div>

      {/* Notification Settings Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" />
            <CardTitle>Notifications</CardTitle>
          </div>
          <CardDescription>
            Configure email notifications for SGT events
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Mail className="h-4 w-4 text-primary" />
              </div>
              <div>
                <Label htmlFor="new-member-email" className="text-sm font-medium">
                  New Member Email
                </Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Receive an email when a new member joins the Birdies League
                </p>
              </div>
            </div>
            <Switch
              id="new-member-email"
              checked={notificationSettings?.new_member_email_enabled ?? false}
              onCheckedChange={(checked) => updateNotificationMutation.mutate(checked)}
              disabled={updateNotificationMutation.isPending}
            />
          </div>
        </CardContent>
      </Card>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.title}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {stat.title}
                  </CardTitle>
                  <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                    <Icon className={`h-4 w-4 ${stat.color}`} />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground mt-1">{stat.subtitle}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Recent Tournaments */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Tournaments</CardTitle>
        </CardHeader>
        <CardContent>
          {recentTournaments && recentTournaments.length > 0 ? (
            <div className="space-y-3">
              {recentTournaments.map((tournament) => (
                <div
                  key={tournament.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                >
                  <div>
                    <p className="font-medium">{tournament.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {tournament.course_name || "No course"}
                    </p>
                  </div>
                  <div className="text-right">
                    <span
                      className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                        tournament.status === "Completed"
                          ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                          : tournament.status === "Active"
                          ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400"
                          : "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400"
                      }`}
                    >
                      {tournament.status}
                    </span>
                    {tournament.start_date && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {format(new Date(tournament.start_date), "MMM d, yyyy")}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-center py-8">No tournaments found</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
