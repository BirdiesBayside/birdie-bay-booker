import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Settings, Users, Trophy, Search, Save, X, Edit2, Check } from "lucide-react";
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface TourSettings {
  id: string;
  tour_id: number;
  auto_register_members: boolean;
  auto_register_tournaments: boolean;
  use_combo_handicap: boolean;
}

interface Tour {
  tour_id: number;
  name: string;
  active: number;
}

interface TourMember {
  id: string;
  user_id: number;
  user_name: string | null;
  tour_id: number;
  custom_hcp: number | null;
  hcp_index: number | null;
}

interface Member {
  user_id: number;
  user_name: string;
  user_active: number;
}

export function SGTRegistrations() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTourId, setSelectedTourId] = useState<number | null>(null);
  const [editingMemberId, setEditingMemberId] = useState<number | null>(null);
  const [editingHcp, setEditingHcp] = useState<string>("");

  // Fetch active tours
  const { data: tours } = useQuery({
    queryKey: ["sgt-tours-active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sgt_tours")
        .select("tour_id, name, active")
        .eq("active", 1)
        .order("name");
      if (error) throw error;
      return data as Tour[];
    },
  });

  // Set default selected tour
  if (tours && tours.length > 0 && selectedTourId === null) {
    setSelectedTourId(tours[0].tour_id);
  }

  // Fetch tour settings
  const { data: tourSettings } = useQuery({
    queryKey: ["sgt-tour-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sgt_tour_settings")
        .select("*");
      if (error) throw error;
      return data as TourSettings[];
    },
  });

  // Fetch tour members for selected tour
  const { data: tourMembers, isLoading: membersLoading } = useQuery({
    queryKey: ["sgt-tour-members", selectedTourId],
    queryFn: async () => {
      if (!selectedTourId) return [];
      const { data, error } = await supabase
        .from("sgt_tour_members")
        .select("id, user_id, user_name, tour_id, custom_hcp, hcp_index")
        .eq("tour_id", selectedTourId)
        .order("user_name");
      if (error) throw error;
      return data as TourMember[];
    },
    enabled: !!selectedTourId,
  });

  // Fetch all members for reference
  const { data: allMembers } = useQuery({
    queryKey: ["sgt-members-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sgt_members")
        .select("user_id, user_name, user_active")
        .eq("user_active", 1)
        .order("user_name");
      if (error) throw error;
      return data as Member[];
    },
  });

  // Mutation to update tour settings
  const updateSettingsMutation = useMutation({
    mutationFn: async ({ 
      tourId, 
      field, 
      value 
    }: { 
      tourId: number; 
      field: keyof Omit<TourSettings, 'id' | 'tour_id' | 'created_at' | 'updated_at'>; 
      value: boolean 
    }) => {
      const existingSettings = tourSettings?.find(s => s.tour_id === tourId);
      
      if (existingSettings) {
        const { error } = await supabase
          .from("sgt_tour_settings")
          .update({ 
            [field]: value,
            updated_at: new Date().toISOString()
          })
          .eq("id", existingSettings.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("sgt_tour_settings")
          .insert({ 
            tour_id: tourId,
            [field]: value,
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sgt-tour-settings"] });
      toast({ title: "Settings updated" });
    },
    onError: (error) => {
      toast({ 
        title: "Failed to update settings", 
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive" 
      });
    },
  });

  // Mutation to update custom handicap
  const updateCustomHcpMutation = useMutation({
    mutationFn: async ({ 
      memberId, 
      customHcp 
    }: { 
      memberId: string; 
      customHcp: number | null 
    }) => {
      const { error } = await supabase
        .from("sgt_tour_members")
        .update({ 
          custom_hcp: customHcp,
          updated_at: new Date().toISOString()
        })
        .eq("id", memberId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sgt-tour-members", selectedTourId] });
      setEditingMemberId(null);
      setEditingHcp("");
      toast({ title: "Custom handicap updated" });
    },
    onError: (error) => {
      toast({ 
        title: "Failed to update handicap", 
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive" 
      });
    },
  });

  const getSettingsForTour = (tourId: number): TourSettings | undefined => {
    return tourSettings?.find(s => s.tour_id === tourId);
  };

  const handleEditHcp = (member: TourMember) => {
    setEditingMemberId(member.user_id);
    setEditingHcp(member.custom_hcp?.toString() || "");
  };

  const handleSaveHcp = (member: TourMember) => {
    const hcpValue = editingHcp.trim() === "" ? null : parseFloat(editingHcp);
    
    if (hcpValue !== null && (isNaN(hcpValue) || hcpValue < -10 || hcpValue > 54)) {
      toast({ 
        title: "Invalid handicap", 
        description: "Handicap must be between -10 and 54",
        variant: "destructive" 
      });
      return;
    }
    
    updateCustomHcpMutation.mutate({ 
      memberId: member.id, 
      customHcp: hcpValue 
    });
  };

  const handleCancelEdit = () => {
    setEditingMemberId(null);
    setEditingHcp("");
  };

  const filteredMembers = tourMembers?.filter(member => 
    member.user_name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const membersWithCustomHcp = tourMembers?.filter(m => m.custom_hcp !== null).length || 0;

  return (
    <div className="space-y-6">
      {/* Auto-Registration Settings */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-primary" />
            <CardTitle>Auto-Registration Settings</CardTitle>
          </div>
          <CardDescription>
            Configure automatic registration behavior for new members joining tours
          </CardDescription>
        </CardHeader>
        <CardContent>
          {tours && tours.length > 0 ? (
            <div className="space-y-4">
              {tours.map((tour) => {
                const settings = getSettingsForTour(tour.tour_id);
                return (
                  <div 
                    key={tour.tour_id} 
                    className="p-4 rounded-lg bg-muted/50 space-y-4"
                  >
                    <div className="flex items-center gap-2">
                      <Trophy className="h-4 w-4 text-amber-500" />
                      <span className="font-medium">{tour.name}</span>
                    </div>
                    
                    <div className="grid gap-4 sm:grid-cols-3">
                      <div className="flex items-center justify-between gap-2">
                        <Label htmlFor={`auto-members-${tour.tour_id}`} className="text-sm">
                          Auto-register to Tour
                        </Label>
                        <Switch
                          id={`auto-members-${tour.tour_id}`}
                          checked={settings?.auto_register_members ?? false}
                          onCheckedChange={(checked) => 
                            updateSettingsMutation.mutate({ 
                              tourId: tour.tour_id, 
                              field: "auto_register_members", 
                              value: checked 
                            })
                          }
                          disabled={updateSettingsMutation.isPending}
                        />
                      </div>
                      
                      <div className="flex items-center justify-between gap-2">
                        <Label htmlFor={`auto-tournaments-${tour.tour_id}`} className="text-sm">
                          Auto-register to Tournaments
                        </Label>
                        <Switch
                          id={`auto-tournaments-${tour.tour_id}`}
                          checked={settings?.auto_register_tournaments ?? false}
                          onCheckedChange={(checked) => 
                            updateSettingsMutation.mutate({ 
                              tourId: tour.tour_id, 
                              field: "auto_register_tournaments", 
                              value: checked 
                            })
                          }
                          disabled={updateSettingsMutation.isPending}
                        />
                      </div>
                      
                      <div className="flex items-center justify-between gap-2">
                        <Label htmlFor={`combo-hcp-${tour.tour_id}`} className="text-sm">
                          Use Combo Handicap
                        </Label>
                        <Switch
                          id={`combo-hcp-${tour.tour_id}`}
                          checked={settings?.use_combo_handicap ?? true}
                          onCheckedChange={(checked) => 
                            updateSettingsMutation.mutate({ 
                              tourId: tour.tour_id, 
                              field: "use_combo_handicap", 
                              value: checked 
                            })
                          }
                          disabled={updateSettingsMutation.isPending}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-muted-foreground text-center py-4">
              No active tours found
            </p>
          )}
        </CardContent>
      </Card>

      {/* Custom Handicap Management */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            <CardTitle>Custom Handicaps</CardTitle>
          </div>
          <CardDescription>
            Set custom handicaps for members that will be used when registering for tournaments. 
            Leave empty to use their tour/combo handicap.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Tour selector and search */}
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 sm:max-w-xs">
              <Label htmlFor="tour-select" className="text-sm text-muted-foreground mb-1.5 block">
                Select Tour
              </Label>
              <Select
                value={selectedTourId?.toString() || ""}
                onValueChange={(value) => setSelectedTourId(parseInt(value))}
              >
                <SelectTrigger id="tour-select">
                  <SelectValue placeholder="Select a tour" />
                </SelectTrigger>
                <SelectContent>
                  {tours?.map((tour) => (
                    <SelectItem key={tour.tour_id} value={tour.tour_id.toString()}>
                      {tour.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex-1 sm:max-w-xs">
              <Label htmlFor="member-search" className="text-sm text-muted-foreground mb-1.5 block">
                Search Members
              </Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="member-search"
                  placeholder="Search by name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            <div className="flex items-end">
              <Badge variant="secondary" className="h-10 px-4 flex items-center gap-2">
                <span className="text-lg font-semibold">{membersWithCustomHcp}</span>
                <span className="text-muted-foreground">with custom HCP</span>
              </Badge>
            </div>
          </div>

          {/* Members table */}
          {selectedTourId ? (
            membersLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
              </div>
            ) : filteredMembers && filteredMembers.length > 0 ? (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Member</TableHead>
                      <TableHead className="text-center">Tour HCP</TableHead>
                      <TableHead className="text-center">Custom HCP</TableHead>
                      <TableHead className="text-center w-24">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredMembers.map((member) => (
                      <TableRow key={member.id}>
                        <TableCell className="font-medium">
                          {member.user_name || `User ${member.user_id}`}
                        </TableCell>
                        <TableCell className="text-center">
                          {member.hcp_index !== null ? member.hcp_index.toFixed(1) : "-"}
                        </TableCell>
                        <TableCell className="text-center">
                          {editingMemberId === member.user_id ? (
                            <Input
                              type="number"
                              step="0.1"
                              min="-10"
                              max="54"
                              value={editingHcp}
                              onChange={(e) => setEditingHcp(e.target.value)}
                              className="w-20 mx-auto text-center"
                              placeholder="—"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleSaveHcp(member);
                                if (e.key === "Escape") handleCancelEdit();
                              }}
                            />
                          ) : (
                            <span className={member.custom_hcp !== null ? "font-semibold text-primary" : "text-muted-foreground"}>
                              {member.custom_hcp !== null ? member.custom_hcp.toFixed(1) : "—"}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {editingMemberId === member.user_id ? (
                            <div className="flex items-center justify-center gap-1">
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-50"
                                      onClick={() => handleSaveHcp(member)}
                                      disabled={updateCustomHcpMutation.isPending}
                                    >
                                      <Check className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Save</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                      onClick={handleCancelEdit}
                                    >
                                      <X className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Cancel</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </div>
                          ) : (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() => handleEditHcp(member)}
                                  >
                                    <Edit2 className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Edit custom handicap</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-8">
                {searchQuery ? "No members match your search" : "No members in this tour"}
              </p>
            )
          ) : (
            <p className="text-muted-foreground text-center py-8">
              Select a tour to manage member handicaps
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
