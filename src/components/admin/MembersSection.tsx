import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Users,
  UserPlus,
  UserMinus,
  Pause,
  Search,
  TrendingUp,
  TrendingDown,
  AlertCircle,
} from "lucide-react";
import { format, subDays, isAfter, parseISO } from "date-fns";

interface MemberProfile {
  id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  membership_tier: string;
  membership_on_hold: boolean;
  payment_failed_at: string | null;
  created_at: string;
  updated_at: string;
}

type StatusFilter = "all" | "active" | "on_hold" | "payment_failed";

const MEMBER_TIERS = ["weekday", "par", "birdie", "eagle", "albatross"];

const getTierColor = (tier: string) => {
  switch (tier?.toLowerCase()) {
    case "albatross":
      return "bg-purple-500/10 text-purple-600 border-purple-200";
    case "eagle":
      return "bg-amber-500/10 text-amber-600 border-amber-200";
    case "birdie":
      return "bg-blue-500/10 text-blue-600 border-blue-200";
    case "par":
      return "bg-green-500/10 text-green-600 border-green-200";
    case "weekday":
      return "bg-teal-500/10 text-teal-600 border-teal-200";
    default:
      return "bg-muted text-muted-foreground";
  }
};

export function MembersSection() {
  const [members, setMembers] = useState<MemberProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [tierFilter, setTierFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  useEffect(() => {
    fetchMembers();
  }, []);

  const fetchMembers = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from("profiles")
      .select("id, user_id, first_name, last_name, email, phone, membership_tier, membership_on_hold, payment_failed_at, created_at, updated_at")
      .neq("membership_tier", "visitor")
      .order("last_name");

    if (!error && data) {
      setMembers(data as MemberProfile[]);
    }
    setIsLoading(false);
  };

  const oneWeekAgo = useMemo(() => subDays(new Date(), 7), []);

  // Weekly activity
  const newThisWeek = useMemo(
    () => members.filter((m) => isAfter(parseISO(m.created_at), oneWeekAgo) && MEMBER_TIERS.includes(m.membership_tier)),
    [members, oneWeekAgo]
  );

  // Members whose payment_failed_at was set in the last 7 days
  const droppedThisWeek = useMemo(
    () =>
      members.filter(
        (m) => m.payment_failed_at && isAfter(parseISO(m.payment_failed_at), oneWeekAgo)
      ),
    [members, oneWeekAgo]
  );

  const onHoldMembers = useMemo(
    () => members.filter((m) => m.membership_on_hold),
    [members]
  );

  const activeMembers = useMemo(
    () => members.filter((m) => !m.membership_on_hold && !m.payment_failed_at),
    [members]
  );

  // Filtered list
  const filteredMembers = useMemo(() => {
    return members.filter((m) => {
      // Search
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const fullName = `${m.first_name} ${m.last_name}`.toLowerCase();
        if (
          !fullName.includes(q) &&
          !m.email?.toLowerCase().includes(q) &&
          !m.phone?.includes(q)
        )
          return false;
      }
      // Tier
      if (tierFilter !== "all" && m.membership_tier !== tierFilter) return false;
      // Status
      if (statusFilter === "active" && (m.membership_on_hold || m.payment_failed_at))
        return false;
      if (statusFilter === "on_hold" && !m.membership_on_hold) return false;
      if (statusFilter === "payment_failed" && !m.payment_failed_at) return false;

      return true;
    });
  }, [members, searchQuery, tierFilter, statusFilter]);

  // -- Note: we also want to detect "visitors" who were recently members (dropped off).
  // payment_failed_at on a visitor profile means they were downgraded this week.
  // We fetch those separately.
  const [recentDropoffs, setRecentDropoffs] = useState<MemberProfile[]>([]);
  useEffect(() => {
    const fetchDropoffs = async () => {
      const weekAgo = format(subDays(new Date(), 7), "yyyy-MM-dd");
      const { data } = await supabase
        .from("profiles")
        .select("id, user_id, first_name, last_name, email, phone, membership_tier, membership_on_hold, payment_failed_at, created_at, updated_at")
        .eq("membership_tier", "visitor")
        .gte("payment_failed_at", weekAgo)
        .order("payment_failed_at", { ascending: false });

      if (data) setRecentDropoffs(data as MemberProfile[]);
    };
    fetchDropoffs();
  }, []);

  const allDroppedThisWeek = useMemo(
    () => [...droppedThisWeek, ...recentDropoffs],
    [droppedThisWeek, recentDropoffs]
  );

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Users className="h-4 w-4" />
              Active Members
            </div>
            <p className="mt-2 text-3xl font-bold tracking-tight">{activeMembers.length}</p>
          </CardContent>
        </Card>
        <Card className={newThisWeek.length > 0 ? "border-emerald-200 dark:border-emerald-800" : ""}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-emerald-600 dark:text-emerald-400">
              <UserPlus className="h-4 w-4" />
              New This Week
            </div>
            <p className="mt-2 text-3xl font-bold tracking-tight">{newThisWeek.length}</p>
          </CardContent>
        </Card>
        <Card className={allDroppedThisWeek.length > 0 ? "border-destructive/50" : ""}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-destructive">
              <UserMinus className="h-4 w-4" />
              Lost This Week
            </div>
            <p className="mt-2 text-3xl font-bold tracking-tight">{allDroppedThisWeek.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Pause className="h-4 w-4" />
              On Hold
            </div>
            <p className="mt-2 text-3xl font-bold tracking-tight">{onHoldMembers.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Weekly Activity Feed */}
      {(newThisWeek.length > 0 || allDroppedThisWeek.length > 0) && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">
              This Week's Changes
            </h3>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {newThisWeek.map((m) => (
                <div
                  key={`new-${m.id}`}
                  className="flex items-center gap-3 text-sm py-1.5 px-2 rounded-md bg-emerald-50 dark:bg-emerald-950/30"
                >
                  <TrendingUp className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span className="font-medium">
                    {m.first_name} {m.last_name}
                  </span>
                  <Badge variant="outline" className={getTierColor(m.membership_tier)}>
                    {m.membership_tier}
                  </Badge>
                  <span className="text-muted-foreground ml-auto text-xs">
                    Joined {format(parseISO(m.created_at), "EEE d MMM")}
                  </span>
                </div>
              ))}
              {allDroppedThisWeek.map((m) => (
                <div
                  key={`dropped-${m.id}`}
                  className="flex items-center gap-3 text-sm py-1.5 px-2 rounded-md bg-destructive/5"
                >
                  <TrendingDown className="h-4 w-4 text-destructive shrink-0" />
                  <span className="font-medium">
                    {m.first_name} {m.last_name}
                  </span>
                  <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20">
                    {m.membership_tier === "visitor" ? "cancelled" : "payment failed"}
                  </Badge>
                  <span className="text-muted-foreground ml-auto text-xs">
                    {m.payment_failed_at
                      ? format(parseISO(m.payment_failed_at), "EEE d MMM")
                      : ""}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search members..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={tierFilter} onValueChange={setTierFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="All Tiers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Tiers</SelectItem>
            <SelectItem value="weekday">Weekday</SelectItem>
            <SelectItem value="par">Par</SelectItem>
            <SelectItem value="birdie">Birdie</SelectItem>
            <SelectItem value="eagle">Eagle</SelectItem>
            <SelectItem value="albatross">Albatross</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="on_hold">On Hold</SelectItem>
            <SelectItem value="payment_failed">Payment Failed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Members Table */}
      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Tier</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Member Since</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredMembers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  No members found
                </TableCell>
              </TableRow>
            ) : (
              filteredMembers.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="font-medium">
                    {m.first_name} {m.last_name}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{m.email}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={getTierColor(m.membership_tier)}>
                      {m.membership_tier}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {m.payment_failed_at ? (
                      <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20 gap-1">
                        <AlertCircle className="h-3 w-3" />
                        Payment Failed
                      </Badge>
                    ) : m.membership_on_hold ? (
                      <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-200 gap-1">
                        <Pause className="h-3 w-3" />
                        On Hold
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-200">
                        Active
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {format(parseISO(m.created_at), "d MMM yyyy")}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-muted-foreground">
        Showing {filteredMembers.length} of {members.length} members
      </p>
    </div>
  );
}
