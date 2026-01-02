import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  Search, 
  Users, 
  UserCheck, 
  UserX, 
  MoreVertical,
  Trash2,
  UserMinus,
  UserPlus,
  Trophy,
  Unlink
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Member {
  id: string;
  user_id: number;
  user_name: string;
  user_email: string | null;
  user_country_code: string | null;
  user_active: number;
  user_has_avatar: string | null;
}

interface LinkedProfile {
  sgt_user_id: number | null;
  first_name: string;
  last_name: string;
  email: string;
  user_id: string;
}

export function SGTMembers() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    action: "delete" | "deactivate" | "activate" | "unlink" | null;
    member: Member | null;
  }>({ open: false, action: null, member: null });

  // Fetch members
  const { data: members, isLoading } = useQuery({
    queryKey: ["sgt-members"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sgt_members")
        .select("*")
        .order("user_name");
      if (error) throw error;
      return data as Member[];
    },
  });

  // Fetch linked profiles
  const { data: linkedProfiles } = useQuery({
    queryKey: ["sgt-linked-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("sgt_user_id, first_name, last_name, email, user_id")
        .not("sgt_user_id", "is", null);
      if (error) throw error;
      return data as LinkedProfile[];
    },
  });

  // Member management mutation
  const memberAction = useMutation({
    mutationFn: async ({ action, userId }: { action: string; userId: number }) => {
      const { data, error } = await supabase.functions.invoke("sgt-member-management", {
        body: { action, userId },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["sgt-members"] });
      queryClient.invalidateQueries({ queryKey: ["sgt-linked-profiles"] });
      
      const actionLabels: Record<string, string> = {
        "delete-member": "deleted",
        "deactivate-member": "deactivated",
        "activate-member": "activated",
      };
      
      toast({
        title: "Success",
        description: `Member ${actionLabels[variables.action] || "updated"} successfully`,
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update member",
        variant: "destructive",
      });
    },
  });

  // Unlink profile mutation
  const unlinkProfile = useMutation({
    mutationFn: async (userId: number) => {
      const { error } = await supabase
        .from("profiles")
        .update({ sgt_user_id: null })
        .eq("sgt_user_id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sgt-linked-profiles"] });
      toast({
        title: "Success",
        description: "Profile unlinked from SGT account",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to unlink profile",
        variant: "destructive",
      });
    },
  });

  const linkedUserIds = new Set(linkedProfiles?.map((p) => p.sgt_user_id) || []);

  const filteredMembers = members?.filter((member) =>
    member.user_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    member.user_email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getLinkedProfile = (userId: number) => {
    return linkedProfiles?.find((p) => p.sgt_user_id === userId);
  };

  const handleConfirmAction = () => {
    if (!confirmDialog.member || !confirmDialog.action) return;

    if (confirmDialog.action === "unlink") {
      unlinkProfile.mutate(confirmDialog.member.user_id);
    } else {
      memberAction.mutate({
        action: `${confirmDialog.action}-member`,
        userId: confirmDialog.member.user_id,
      });
    }
    setConfirmDialog({ open: false, action: null, member: null });
  };

  const getConfirmDialogContent = () => {
    const { action, member } = confirmDialog;
    if (!member) return { title: "", description: "" };

    switch (action) {
      case "delete":
        return {
          title: "Delete Member",
          description: `Are you sure you want to permanently delete "${member.user_name}" from SGT? This action cannot be undone and will remove all their tour history.`,
        };
      case "deactivate":
        return {
          title: "Deactivate Member",
          description: `Are you sure you want to deactivate "${member.user_name}"? They will no longer be able to participate in tours until reactivated.`,
        };
      case "activate":
        return {
          title: "Activate Member",
          description: `Reactivate "${member.user_name}" to allow them to participate in tours again?`,
        };
      case "unlink":
        return {
          title: "Unlink Profile",
          description: `Unlink the Birdies account from "${member.user_name}"'s SGT account? They will need to re-register to link again.`,
        };
      default:
        return { title: "", description: "" };
    }
  };

  const activeCount = members?.filter(m => m.user_active === 1).length || 0;
  const inactiveCount = members?.filter(m => m.user_active !== 1).length || 0;

  return (
    <div className="space-y-6">
      {/* Search and Stats */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search members..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        
        <div className="flex gap-4 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Users className="h-4 w-4" />
            <span>{members?.length || 0} total</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <UserCheck className="h-4 w-4 text-green-500" />
            <span>{linkedUserIds.size} linked</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <UserX className="h-4 w-4 text-amber-500" />
            <span>{inactiveCount} inactive</span>
          </div>
        </div>
      </div>

      {/* Members Table */}
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : filteredMembers && filteredMembers.length > 0 ? (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SGT Name</TableHead>
                  <TableHead>SGT Email</TableHead>
                  <TableHead>Country</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Linked Account</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredMembers.map((member) => {
                  const linkedProfile = getLinkedProfile(member.user_id);
                  const isActive = member.user_active === 1;
                  
                  return (
                    <TableRow key={member.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{member.user_name}</p>
                          <p className="text-xs text-muted-foreground">
                            ID: {member.user_id}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {member.user_email || "-"}
                      </TableCell>
                      <TableCell>
                        {member.user_country_code ? (
                          <span className="text-lg" title={member.user_country_code}>
                            {getFlagEmoji(member.user_country_code)}
                          </span>
                        ) : (
                          "-"
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={isActive ? "default" : "secondary"}>
                          {isActive ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {linkedProfile ? (
                          <div className="flex items-center gap-2">
                            <UserCheck className="h-4 w-4 text-green-500" />
                            <div className="text-sm">
                              <p className="font-medium">
                                {linkedProfile.first_name} {linkedProfile.last_name}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {linkedProfile.email}
                              </p>
                            </div>
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-sm">Not linked</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {isActive ? (
                              <DropdownMenuItem
                                onClick={() => setConfirmDialog({
                                  open: true,
                                  action: "deactivate",
                                  member,
                                })}
                              >
                                <UserMinus className="h-4 w-4 mr-2" />
                                Deactivate
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem
                                onClick={() => setConfirmDialog({
                                  open: true,
                                  action: "activate",
                                  member,
                                })}
                              >
                                <UserPlus className="h-4 w-4 mr-2" />
                                Activate
                              </DropdownMenuItem>
                            )}
                            
                            {linkedProfile && (
                              <DropdownMenuItem
                                onClick={() => setConfirmDialog({
                                  open: true,
                                  action: "unlink",
                                  member,
                                })}
                              >
                                <Unlink className="h-4 w-4 mr-2" />
                                Unlink Profile
                              </DropdownMenuItem>
                            )}
                            
                            <DropdownMenuSeparator />
                            
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => setConfirmDialog({
                                open: true,
                                action: "delete",
                                member,
                              })}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete Member
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <Users className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">No members found</p>
          </CardContent>
        </Card>
      )}

      {/* Confirmation Dialog */}
      <AlertDialog 
        open={confirmDialog.open} 
        onOpenChange={(open) => !open && setConfirmDialog({ open: false, action: null, member: null })}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{getConfirmDialogContent().title}</AlertDialogTitle>
            <AlertDialogDescription>
              {getConfirmDialogContent().description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmAction}
              className={confirmDialog.action === "delete" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}
            >
              {confirmDialog.action === "activate" ? "Activate" : "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// Helper function to convert country code to flag emoji
function getFlagEmoji(countryCode: string): string {
  if (!countryCode || countryCode.length !== 2) return "🏳️";
  const codePoints = countryCode
    .toUpperCase()
    .split("")
    .map((char) => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}
