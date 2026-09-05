import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { UserPlus, UserMinus, Check, Loader2, AlertCircle, X } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";

interface PendingMember {
  user_id: string;
  sgt_user_id: number;
  first_name: string;
  last_name: string;
  email: string;
  display_name: string | null;
  created_at: string;
}

export function SGTPendingOnboarding() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [onboardingMemberId, setOnboardingMemberId] = useState<number | null>(null);
  const [handicapValue, setHandicapValue] = useState<string>("");
  const [dismissMember, setDismissMember] = useState<PendingMember | null>(null);

  // Fetch pending members (have sgt_user_id but NOT in any sgt_tour_members)
  const { data: pendingMembers, isLoading } = useQuery({
    queryKey: ["sgt-pending-members"],
    queryFn: async () => {
      // Get all profiles with sgt_user_id
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("user_id, sgt_user_id, first_name, last_name, email, display_name, created_at")
        .not("sgt_user_id", "is", null)
        .is("sgt_onboarding_dismissed_at", null)
        .order("created_at", { ascending: false });

      if (profilesError) throw profilesError;
      if (!profiles || profiles.length === 0) return [];

      // Get user_ids that are already properly onboarded (in a tour WITH a handicap set).
      // Automated syncs can add a player to a tour with no custom_hcp - those still
      // need an admin to set a starting handicap, so they must stay in this list.
      const { data: tourMembers, error: tourMembersError } = await supabase
        .from("sgt_tour_members")
        .select("user_id, custom_hcp");

      if (tourMembersError) throw tourMembersError;

      // Get all unique player_ids that have played at least one scorecard.
      // Returning members (whose old tour_members row was removed when a tour
      // ended) shouldn't appear as "new", they already have a Birdies HCP
      // calculated from their history.
      const { data: scoredPlayers, error: scoredError } = await supabase
        .from("sgt_scorecards")
        .select("player_id")
        .not("player_id", "is", null);

      if (scoredError) throw scoredError;

      const onboardedUserIds = new Set(
        (tourMembers || [])
          .filter(tm => tm.custom_hcp !== null && tm.custom_hcp !== undefined)
          .map(tm => tm.user_id)
      );
      const playedUserIds = new Set((scoredPlayers || []).map(s => s.player_id));

      // Filter to only truly new pending (no handicap set AND no play history)
      const pending = profiles.filter(p =>
        p.sgt_user_id &&
        !onboardedUserIds.has(p.sgt_user_id) &&
        !playedUserIds.has(p.sgt_user_id)
      );


      return pending as PendingMember[];
    },
  });

  // Dismissed players: kept out of the league (club seats are paid per player)
  // until an admin explicitly rejoins them.
  const { data: dismissedMembers } = useQuery({
    queryKey: ["sgt-dismissed-members"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select(
          "user_id, sgt_user_id, first_name, last_name, email, display_name, created_at, membership_tier, sgt_onboarding_dismissed_at"
        )
        .not("sgt_onboarding_dismissed_at", "is", null)
        .order("sgt_onboarding_dismissed_at", { ascending: false });
      if (error) throw error;
      return (data || []) as (PendingMember & {
        membership_tier: string | null;
        sgt_onboarding_dismissed_at: string;
      })[];
    },
  });

  // Dismiss someone from the pending list without touching their SGT account.
  const dismissMutation = useMutation({
    mutationFn: async (member: PendingMember) => {
      const { data: auth } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("profiles")
        .update({
          sgt_onboarding_dismissed_at: new Date().toISOString(),
          sgt_onboarding_dismissed_by: auth?.user?.id ?? null,
        } as never)
        .eq("user_id", member.user_id)
        .select("user_id");
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error("No profile row was updated — admin permissions may be missing.");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sgt-pending-members"] });
      queryClient.invalidateQueries({ queryKey: ["sgt-dismissed-members"] });
      setDismissMember(null);
      toast({
        title: "Removed from onboarding",
        description: "They'll stay out of the league until you press Rejoin.",
      });
    },
    onError: (error) => {
      toast({
        title: "Failed to remove from pending",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    },
  });

  // Rejoin: clear the dismissal so they show in Awaiting Handicap again.
  const rejoinMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { data, error } = await supabase
        .from("profiles")
        .update({
          sgt_onboarding_dismissed_at: null,
          sgt_onboarding_dismissed_by: null,
        } as never)
        .eq("user_id", userId)
        .select("user_id");
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error("No profile row was updated — admin permissions may be missing.");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sgt-pending-members"] });
      queryClient.invalidateQueries({ queryKey: ["sgt-dismissed-members"] });
      toast({
        title: "Rejoined onboarding",
        description: "Set their handicap to add them back to the club and tour.",
      });
    },
    onError: (error) => {
      toast({
        title: "Failed to rejoin",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    },
  });


  // Mutation to onboard a member (set HCP and trigger registration)
  const onboardMutation = useMutation({
    mutationFn: async ({ sgtUserId, customHcp }: { sgtUserId: number; customHcp: number }) => {
      console.log(`[SGT-ONBOARD] Onboarding member ${sgtUserId} with HCP ${customHcp}`);

      // Get all active tours
      const { data: activeTours, error: toursError } = await supabase
        .from("sgt_tours")
        .select("tour_id, name")
        .eq("active", 1);

      if (toursError) throw toursError;
      if (!activeTours || activeTours.length === 0) {
        throw new Error("No active tours found");
      }

      // Get member info from sgt_members. A player who just registered may not
      // have been pulled into sgt_members by the sync yet, so fall back to any
      // existing tour member row, then to their Hub display name — never write
      // a null username (that's what showed as "Unknown").
      const { data: memberInfo } = await supabase
        .from("sgt_members")
        .select("user_name")
        .eq("user_id", sgtUserId)
        .maybeSingle();

      let resolvedName: string | null = memberInfo?.user_name ?? null;

      if (!resolvedName) {
        const { data: existingTm } = await supabase
          .from("sgt_tour_members")
          .select("user_name")
          .eq("user_id", sgtUserId)
          .not("user_name", "is", null)
          .limit(1)
          .maybeSingle();
        resolvedName = existingTm?.user_name ?? null;
      }

      if (!resolvedName) {
        const { data: profileInfo } = await supabase
          .from("profiles")
          .select("display_name, first_name, last_name")
          .eq("sgt_user_id", sgtUserId)
          .maybeSingle();
        resolvedName =
          profileInfo?.display_name ||
          [profileInfo?.first_name, profileInfo?.last_name].filter(Boolean).join(" ") ||
          null;
      }

      // Add member to all active tours with custom HCP in parallel
      // onboarding_hcp is the locked starting handicap used for first 6 rounds
      const upsertResults = await Promise.all(
        activeTours.map((tour) =>
          supabase
            .from("sgt_tour_members")
            .upsert({
              user_id: sgtUserId,
              tour_id: tour.tour_id,
              ...(resolvedName ? { user_name: resolvedName } : {}),
              custom_hcp: customHcp,
              onboarding_hcp: customHcp,
              updated_at: new Date().toISOString(),
            }, {
              onConflict: "user_id,tour_id",
            })
            .then((res) => ({ tour, error: res.error }))
        )
      );


      const failed = upsertResults.find((r) => r.error);
      if (failed) {
        console.error(`Failed to add to tour ${failed.tour.name}:`, failed.error);
        throw failed.error;
      }

      // Fire-and-forget the auto-registration edge function, it can take a while
      // because it hits the external SGT API for every open tournament. No need
      // to block the admin UI on it.
      supabase.functions
        .invoke("sgt-auto-register", { body: { sgt_user_id: sgtUserId } })
        .then(({ error }) => {
          if (error) console.error("Auto-registration failed:", error);
        });

      return { sgtUserId, tourCount: activeTours.length };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["sgt-pending-members"] });
      queryClient.invalidateQueries({ queryKey: ["sgt-league-members"] });
      setOnboardingMemberId(null);
      setHandicapValue("");
      toast({ 
        title: "Member onboarded successfully",
        description: `Added to ${data.tourCount} active tour(s) and registered for open tournaments.`,
      });
    },
    onError: (error) => {
      toast({
        title: "Failed to onboard member",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    },
  });

  const handleOnboard = (sgtUserId: number) => {
    const hcp = parseFloat(handicapValue);
    
    if (isNaN(hcp) || hcp < -36 || hcp > 36) {
      toast({
        title: "Invalid handicap",
        description: "Please enter a handicap between -36 and 36",
        variant: "destructive",
      });
      return;
    }

    onboardMutation.mutate({ sgtUserId, customHcp: hcp });
  };

  // ---- Auto-Onboard -------------------------------------------------------
  // When on, anyone waiting on a handicap who has posted a full 18-hole round
  // is enrolled automatically on (gross - par) from their most recent round.
  // They're still exempt (E) until 3 rounds, so a rough starting number is safe.
  const { data: autoOnboard } = useQuery({
    queryKey: ["sgt-auto-onboard-setting"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sgt_handicap_settings")
        .select("*")
        .eq("id", "global")
        .maybeSingle();
      if (error) throw error;
      return Boolean((data as Record<string, unknown> | null)?.auto_onboard);
    },
  });

  const toggleAutoOnboard = useMutation({
    mutationFn: async (enabled: boolean) => {
      const { error } = await supabase
        .from("sgt_handicap_settings")
        .update({ auto_onboard: enabled } as never)
        .eq("id", "global");
      if (error) throw error;
      return enabled;
    },
    onSuccess: (enabled) => {
      queryClient.invalidateQueries({ queryKey: ["sgt-auto-onboard-setting"] });
      toast({
        title: enabled ? "Auto-Onboard on" : "Auto-Onboard off",
        description: enabled
          ? "New players are enrolled automatically off their first 18-hole score."
          : "You'll set every starting handicap manually again.",
      });
    },
    onError: (error) => {
      toast({
        title: "Couldn't save that setting",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    },
  });

  const autoRunRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (!autoOnboard || !pendingMembers || pendingMembers.length === 0) return;

    const run = async () => {
      for (const member of pendingMembers) {
        if (autoRunRef.current.has(member.sgt_user_id)) continue;

        const { data: cards } = await supabase
          .from("sgt_scorecards")
          .select("total_gross, to_par_gross, in_gross, out_gross, hole_data, created_at")
          .eq("player_id", member.sgt_user_id)
          .not("total_gross", "is", null)
          .order("created_at", { ascending: false })
          .limit(10);

        const full = (cards || []).find((sc) => {
          const holes = sc.hole_data as Record<string, unknown> | null;
          if (holes && typeof holes === "object") {
            let scored = 0;
            for (let h = 1; h <= 18; h++) {
              const v = Number((holes as Record<string, unknown>)[`hole${h}_gross`]);
              if (Number.isFinite(v) && v > 0) scored++;
            }
            return scored === 18;
          }
          return Number(sc.in_gross) > 0 && Number(sc.out_gross) > 0;
        });

        if (!full) continue;

        const raw =
          full.to_par_gross !== null && full.to_par_gross !== undefined
            ? Number(full.to_par_gross)
            : Number(full.total_gross) - 72;
        if (!Number.isFinite(raw)) continue;

        const hcp = Math.max(-36, Math.min(36, Math.round(raw * 10) / 10));
        autoRunRef.current.add(member.sgt_user_id);
        onboardMutation.mutate({ sgtUserId: member.sgt_user_id, customHcp: hcp });
      }
    };

    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOnboard, pendingMembers]);


  return (
    <div className="space-y-6">
      {/* Info Alert */}
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>How Onboarding Works</AlertTitle>
        <AlertDescription>
          New league members appear here until you set their initial handicap. Once set, they're
          automatically added to all active tours and registered for open tournaments. They play
          off that starting handicap until they've completed 3 rounds, at which point their true
          Birdies Custom HCP is calculated and recalculates weekly. While provisional they're
          marked exempt (E) — they can't win weeks 1 and 2 — and they start earning points from
          their 4th round onwards.
        </AlertDescription>

      </Alert>

      {/* Pending Members */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-amber-500" />
              <CardTitle>Awaiting Handicap</CardTitle>
            </div>
            {pendingMembers && pendingMembers.length > 0 && (
              <Badge variant="secondary" className="bg-amber-100 text-amber-800">
                {pendingMembers.length} pending
              </Badge>
            )}
          </div>
          <CardDescription>
            Set an initial handicap to activate these members in the league
          </CardDescription>
          <div className="mt-3 flex items-start gap-3 rounded-md border p-3">
            <Switch
              id="auto-onboard"
              checked={!!autoOnboard}
              disabled={toggleAutoOnboard.isPending}
              onCheckedChange={(v) => toggleAutoOnboard.mutate(v)}
            />
            <div className="space-y-0.5">
              <Label htmlFor="auto-onboard" className="cursor-pointer">
                Auto-Onboard
              </Label>
              <p className="text-sm text-muted-foreground">
                Enrols anyone waiting here as soon as they post a full 18-hole round, using
                their score to par as the starting handicap. They stay exempt (E) until they
                have three rounds, so they can't win off it.
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : pendingMembers && pendingMembers.length > 0 ? (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Member</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead className="text-center">SGT ID</TableHead>
                    <TableHead className="text-center w-32">Handicap</TableHead>
                    <TableHead className="text-center w-24">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingMembers.map((member) => (
                    <TableRow key={member.sgt_user_id}>
                      <TableCell className="font-medium">
                        {member.display_name || `${member.first_name} ${member.last_name}`}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {member.email}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline">{member.sgt_user_id}</Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        {onboardingMemberId === member.sgt_user_id ? (
                          <Input
                            type="number"
                            step="0.1"
                            min="-36"
                            max="36"
                            value={handicapValue}
                            onChange={(e) => setHandicapValue(e.target.value)}
                            className="w-20 mx-auto text-center"
                            placeholder="0.0"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleOnboard(member.sgt_user_id);
                              if (e.key === "Escape") {
                                setOnboardingMemberId(null);
                                setHandicapValue("");
                              }
                            }}
                          />
                        ) : (
                          <span className="text-muted-foreground">,</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {onboardingMemberId === member.sgt_user_id ? (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  size="sm"
                                  variant="default"
                                  onClick={() => handleOnboard(member.sgt_user_id)}
                                  disabled={onboardMutation.isPending || !handicapValue}
                                >
                                  {onboardMutation.isPending ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Check className="h-4 w-4" />
                                  )}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Confirm & Onboard</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        ) : (
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setOnboardingMemberId(member.sgt_user_id);
                                setHandicapValue("");
                              }}
                            >
                              Set HCP
                            </Button>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    aria-label="Remove from pending"
                                    onClick={() => setDismissMember(member)}
                                  >
                                    <X className="h-4 w-4 text-muted-foreground" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Remove from pending</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <UserPlus className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No pending members</p>
              <p className="text-sm">All registered members have been onboarded</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Removed from onboarding */}
      {dismissedMembers && dismissedMembers.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <UserMinus className="h-5 w-5 text-muted-foreground" />
                <CardTitle>Removed from Onboarding</CardTitle>
              </div>
              <Badge variant="secondary">{dismissedMembers.length}</Badge>
            </div>
            <CardDescription>
              These players stay out of the SGT club (club seats are billed per player) until you
              press Rejoin — even if their membership becomes active again.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Member</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead className="text-center">Membership</TableHead>
                    <TableHead className="text-center">SGT ID</TableHead>
                    <TableHead className="text-center w-28">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dismissedMembers.map((member) => {
                    const isMember =
                      member.membership_tier === "birdie" || member.membership_tier === "eagle";
                    return (
                      <TableRow key={member.user_id}>
                        <TableCell className="font-medium">
                          {member.display_name || `${member.first_name} ${member.last_name}`}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{member.email}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant={isMember ? "default" : "outline"} className="capitalize">
                            {member.membership_tier || "visitor"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline">{member.sgt_user_id ?? "—"}</Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Button
                            size="sm"
                            variant={isMember ? "default" : "outline"}
                            onClick={() => rejoinMutation.mutate(member.user_id)}
                            disabled={rejoinMutation.isPending}
                          >
                            {rejoinMutation.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              "Rejoin"
                            )}
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}



      <AlertDialog open={dismissMember !== null} onOpenChange={(open) => !open && setDismissMember(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove from pending?</AlertDialogTitle>
            <AlertDialogDescription>
              {dismissMember?.display_name ||
                `${dismissMember?.first_name ?? ""} ${dismissMember?.last_name ?? ""}`.trim()}{" "}
              will be taken off the onboarding list. Nothing changes on SGT and their account is
              untouched — if they later become a member again the sync will reinstate them to the
              club with their previous handicap.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={dismissMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (dismissMember) dismissMutation.mutate(dismissMember);
              }}
              disabled={dismissMutation.isPending}
            >
              {dismissMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
