import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Search, Users, UserCheck, UserX } from "lucide-react";

export function SGTMembers() {
  const [searchQuery, setSearchQuery] = useState("");

  // Fetch members
  const { data: members, isLoading } = useQuery({
    queryKey: ["sgt-members"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sgt_members")
        .select("*")
        .order("user_name");
      if (error) throw error;
      return data;
    },
  });

  // Fetch linked profiles
  const { data: linkedProfiles } = useQuery({
    queryKey: ["sgt-linked-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("sgt_user_id, first_name, last_name, email")
        .not("sgt_user_id", "is", null);
      if (error) throw error;
      return data;
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
            <UserCheck className="h-4 w-4 text-green-500" />
            <span>{linkedUserIds.size} linked</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <UserX className="h-4 w-4 text-amber-500" />
            <span>{(members?.length || 0) - linkedUserIds.size} unlinked</span>
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
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredMembers.map((member) => {
                  const linkedProfile = getLinkedProfile(member.user_id);
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
                        <Badge variant={member.user_active === 1 ? "default" : "secondary"}>
                          {member.user_active === 1 ? "Active" : "Inactive"}
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
