import { useState } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SGTDashboard } from "@/components/admin/sgt/SGTDashboard";
import { SGTTours } from "@/components/admin/sgt/SGTTours";
import { SGTTournaments } from "@/components/admin/sgt/SGTTournaments";
import { SGTMembers } from "@/components/admin/sgt/SGTMembers";
import { SGTScorecards } from "@/components/admin/sgt/SGTScorecards";
import { LayoutDashboard, Trophy, Calendar, Users, FileText } from "lucide-react";

export default function AdminSGTManager() {
  const { isLoading } = useAdminAuth();
  const [activeTab, setActiveTab] = useState("dashboard");

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">
            SGT Manager
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage tours, tournaments, members, and scorecards
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="bg-muted/50 p-1">
            <TabsTrigger value="dashboard" className="gap-2">
              <LayoutDashboard className="h-4 w-4" />
              <span className="hidden sm:inline">Dashboard</span>
            </TabsTrigger>
            <TabsTrigger value="tours" className="gap-2">
              <Trophy className="h-4 w-4" />
              <span className="hidden sm:inline">Tours</span>
            </TabsTrigger>
            <TabsTrigger value="tournaments" className="gap-2">
              <Calendar className="h-4 w-4" />
              <span className="hidden sm:inline">Tournaments</span>
            </TabsTrigger>
            <TabsTrigger value="members" className="gap-2">
              <Users className="h-4 w-4" />
              <span className="hidden sm:inline">Members</span>
            </TabsTrigger>
            <TabsTrigger value="scorecards" className="gap-2">
              <FileText className="h-4 w-4" />
              <span className="hidden sm:inline">Scorecards</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard" className="mt-6">
            <SGTDashboard />
          </TabsContent>

          <TabsContent value="tours" className="mt-6">
            <SGTTours />
          </TabsContent>

          <TabsContent value="tournaments" className="mt-6">
            <SGTTournaments />
          </TabsContent>

          <TabsContent value="members" className="mt-6">
            <SGTMembers />
          </TabsContent>

          <TabsContent value="scorecards" className="mt-6">
            <SGTScorecards />
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}
