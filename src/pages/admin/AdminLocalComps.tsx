import { AdminLayout } from "@/components/admin/AdminLayout";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CompetitionList } from "@/components/admin/local-comps/CompetitionList";
import { ScoreEntry } from "@/components/admin/local-comps/ScoreEntry";
import { CompResults } from "@/components/admin/local-comps/CompResults";
import { SavedTeams } from "@/components/admin/local-comps/SavedTeams";
import { HandicapCalculator } from "@/components/admin/local-comps/HandicapCalculator";
import { HcpAdjustments } from "@/components/admin/local-comps/HcpAdjustments";
import { Trophy, ClipboardList, Award, Users, Calculator, History } from "lucide-react";

export default function AdminLocalComps() {
  const { isLoading } = useAdminAuth();

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">
            Local Competitions
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage weekly in-house Ambrose tournaments
          </p>
        </div>

        <Tabs defaultValue="competitions" className="space-y-6">
          <TabsList className="bg-muted/50 p-1">
            <TabsTrigger value="competitions" className="gap-2">
              <Trophy className="h-4 w-4" />
              <span className="hidden sm:inline">Competitions</span>
            </TabsTrigger>
            <TabsTrigger value="scores" className="gap-2">
              <ClipboardList className="h-4 w-4" />
              <span className="hidden sm:inline">Score Entry</span>
            </TabsTrigger>
            <TabsTrigger value="results" className="gap-2">
              <Award className="h-4 w-4" />
              <span className="hidden sm:inline">Results</span>
            </TabsTrigger>
            <TabsTrigger value="teams" className="gap-2">
              <Users className="h-4 w-4" />
              <span className="hidden sm:inline">Teams</span>
            </TabsTrigger>
            <TabsTrigger value="hcp-calc" className="gap-2">
              <Calculator className="h-4 w-4" />
              <span className="hidden sm:inline">HCP Calc</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="competitions" className="mt-6">
            <CompetitionList />
          </TabsContent>

          <TabsContent value="scores" className="mt-6">
            <ScoreEntry />
          </TabsContent>

          <TabsContent value="results" className="mt-6">
            <CompResults />
          </TabsContent>

          <TabsContent value="teams" className="mt-6">
            <SavedTeams />
          </TabsContent>

          <TabsContent value="hcp-calc" className="mt-6">
            <HandicapCalculator />
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}
