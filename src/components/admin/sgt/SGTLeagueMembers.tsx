import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Users, Search, Pencil, Check, X, Loader2, Info } from "lucide-react";
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

interface LeagueMember {
  user_id: number;
  user_name: string | null;
  email: string | null;
  hcp_index: number | null;  // Combo HCP from SGT
  custom_hcp: number | null;  // Manual override
  rounds_played: number;
}

export function SGTLeagueMembers() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [editingMemberId, setEditingMemberId] = useState<number | null>(null);
  const [editHandicapValue, setEditHandicapValue] = useState<string>("");

  // Fetch all onboarded members with their round counts
  const { data: members, isLoading } = useQuery({
    queryKey: ["sgt-league-members"],
    queryFn: async () => {
      // Get all tour members (onboarded)
      const { data: tourMembers, error: tmError } = await supabase
        .from("sgt_tour_members")
        .select("user_id, user_name, hcp_index, custom_hcp");

      if (tmError) throw tmError;

      // Get profile emails for matching
      const { data: profiles } = await supabase
        .from("profiles")
        .select("sgt_user_id, email")
        .not("sgt_user_id", "is", null);
      
      const sgtIdToEmail = new Map(
        (profiles || []).map(p => [p.sgt_user_id, p.email])
      );

      // Get round counts from scorecards (player_id is the correct column)
      const { data: scorecards } = await supabase
        .from("sgt_scorecards")
        .select("player_id");

      const roundCounts = new Map<number, number>();
      (scorecards || []).forEach(sc => {
        roundCounts.set(sc.player_id, (roundCounts.get(sc.player_id) || 0) + 1);
      });

      // Dedupe by user_id (a member might be in multiple tours)
      const memberMap = new Map<number, LeagueMember>();
      (tourMembers || []).forEach(tm => {
        if (!memberMap.has(tm.user_id)) {
          memberMap.set(tm.user_id, {
            user_id: tm.user_id,
            user_name: tm.user_name,
            email: sgtIdToEmail.get(tm.user_id) || null,
            hcp_index: tm.hcp_index,
            custom_hcp: tm.custom_hcp,
            rounds_played: roundCounts.get(tm.user_id) || 0,
          });
        } else {
          // Update if this record has more info
          const existing = memberMap.get(tm.user_id)!;
          if (tm.hcp_index !== null) existing.hcp_index = tm.hcp_index;
          if (tm.custom_hcp !== null) existing.custom_hcp = tm.custom_hcp;
        }
      });

      return Array.from(memberMap.values()).sort((a, b) => 
        (a.user_name || "").localeCompare(b.user_name || "")
      );
    },
  });

  // Mutation to update a member's custom handicap
  const updateHcpMutation = useMutation({
    mutationFn: async ({ userId, customHcp }: { userId: number; customHcp: number | null }) => {
      console.log(`[SGT-UPDATE-HCP] Setting custom HCP for user ${userId} to ${customHcp}`);

      // Update all tour_members records for this user
      const { error } = await supabase
        .from("sgt_tour_members")
        .update({ 
          custom_hcp: customHcp,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId);

      if (error) throw error;
      return { userId, customHcp };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["sgt-league-members"] });
      setEditingMemberId(null);
      setEditHandicapValue("");
      toast({ 
        title: "Handicap updated",
        description: data.customHcp !== null 
          ? `Custom handicap set to ${data.customHcp.toFixed(1)}`
          : "Custom handicap cleared - will use Combo HCP",
      });
    },
    onError: (error) => {
      toast({
        title: "Failed to update handicap",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    },
  });

  const handleSaveHcp = (userId: number) => {
    const value = editHandicapValue.trim();
    
    // Allow empty to clear custom HCP
    if (value === "") {
      updateHcpMutation.mutate({ userId, customHcp: null });
      return;
    }

    const hcp = parseFloat(value);
    if (isNaN(hcp) || hcp < -36 || hcp > 36) {
      toast({
        title: "Invalid handicap",
        description: "Please enter a handicap between -36 and 36, or leave empty to use Combo HCP",
        variant: "destructive",
      });
      return;
    }

    updateHcpMutation.mutate({ userId, customHcp: hcp });
  };

  const startEditing = (member: LeagueMember) => {
    setEditingMemberId(member.user_id);
    setEditHandicapValue(member.custom_hcp?.toFixed(1) ?? "");
  };

  const cancelEditing = () => {
    setEditingMemberId(null);
    setEditHandicapValue("");
  };

  const filteredMembers = members?.filter(m => {
    const query = searchQuery.toLowerCase();
    return m.user_name?.toLowerCase().includes(query) ||
      m.email?.toLowerCase().includes(query);
  });

  // Determine which HCP is active for a member
  const getActiveHcp = (member: LeagueMember): { value: number | null; isCustom: boolean } => {
    // Use custom HCP if set AND player has < 4 rounds
    if (member.custom_hcp !== null && member.rounds_played < 4) {
      return { value: member.custom_hcp, isCustom: true };
    }
    // Otherwise use Combo HCP
    return { value: member.hcp_index, isCustom: false };
  };

  const formatHcp = (value: number | null) => {
    if (value === null) return "—";
    return value >= 0 ? `+${value.toFixed(1)}` : value.toFixed(1);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              <CardTitle>League Members</CardTitle>
            </div>
            <Badge variant="secondary">
              {members?.length || 0} active
            </Badge>
          </div>
          <CardDescription>
            Manage member handicaps. Custom HCP is used for the first 4 rounds, then Combo HCP takes over.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Search */}
          <div className="max-w-xs">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search members..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredMembers && filteredMembers.length > 0 ? (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead className="text-center">SGT ID</TableHead>
                    <TableHead className="text-center">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger className="flex items-center gap-1 justify-center w-full">
                            Combo HCP
                            <Info className="h-3 w-3 text-muted-foreground" />
                          </TooltipTrigger>
                          <TooltipContent>
                            SGT's calculated handicap based on recent rounds
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </TableHead>
                    <TableHead className="text-center">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger className="flex items-center gap-1 justify-center w-full">
                            Custom HCP
                            <Info className="h-3 w-3 text-muted-foreground" />
                          </TooltipTrigger>
                          <TooltipContent>
                            Manual override used for first 4 rounds
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </TableHead>
                    <TableHead className="text-center">Rounds</TableHead>
                    <TableHead className="text-center w-24">Edit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredMembers.map((member) => {
                    const activeHcp = getActiveHcp(member);
                    const isEditing = editingMemberId === member.user_id;
                    const usingCustom = member.custom_hcp !== null && member.rounds_played < 4;

                    return (
                      <TableRow key={member.user_id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{member.user_name || "Unknown"}</p>
                            {member.email && (
                              <p className="text-xs text-muted-foreground">{member.email}</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline">{member.user_id}</Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className={!usingCustom && member.hcp_index !== null ? "font-semibold text-primary" : "text-muted-foreground"}>
                            {formatHcp(member.hcp_index)}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          {isEditing ? (
                            <Input
                              type="number"
                              step="0.1"
                              min="-36"
                              max="36"
                              value={editHandicapValue}
                              onChange={(e) => setEditHandicapValue(e.target.value)}
                              className="w-20 mx-auto text-center"
                              placeholder="—"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleSaveHcp(member.user_id);
                                if (e.key === "Escape") cancelEditing();
                              }}
                            />
                          ) : (
                            <span className={usingCustom ? "font-semibold text-accent-foreground" : "text-muted-foreground"}>
                              {formatHcp(member.custom_hcp)}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge 
                            variant={member.rounds_played >= 4 ? "default" : "secondary"}
                          >
                            {member.rounds_played}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          {isEditing ? (
                            <div className="flex items-center justify-center gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleSaveHcp(member.user_id)}
                                disabled={updateHcpMutation.isPending}
                              >
                                {updateHcpMutation.isPending ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Check className="h-4 w-4 text-primary" />
                                )}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={cancelEditing}
                                disabled={updateHcpMutation.isPending}
                              >
                                <X className="h-4 w-4 text-muted-foreground" />
                              </Button>
                            </div>
                          ) : (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => startEditing(member)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No members found</p>
              <p className="text-sm">Members appear here after being onboarded</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
