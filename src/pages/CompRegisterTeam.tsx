import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { ArrowLeft, Users, CheckCircle } from "lucide-react";

export default function CompRegisterTeam() {
  const navigate = useNavigate();
  const { user, isLoading: authLoading } = useAuth();
  const [teamName, setTeamName] = useState("");
  const [player1, setPlayer1] = useState("");
  const [player2, setPlayer2] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const p1 = player1.trim();
    const p2 = player2.trim();
    const name = teamName.trim();

    if (!p1 || !p2 || !name) {
      toast.error("All fields are required");
      return;
    }

    setSubmitting(true);
    const { error } = await supabase.from("local_comp_saved_teams").insert({
      team_name: name,
      player1_name: p1,
      player2_name: p2,
      player1_handicap: 0,
      player2_handicap: 0,
    });

    setSubmitting(false);

    if (error) {
      toast.error("Failed to register team. Please try again.");
      console.error(error);
      return;
    }

    setSubmitted(true);
  }

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
        <Users className="h-12 w-12 text-muted-foreground mb-4" />
        <h1 className="text-xl font-bold mb-2">Sign in Required</h1>
        <p className="text-muted-foreground mb-6">You need to be signed in to register a team.</p>
        <Button onClick={() => navigate("/")}>Go to Login</Button>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
        <CheckCircle className="h-16 w-16 text-primary mb-4" />
        <h1 className="text-2xl font-bold mb-2">Team Registered!</h1>
        <p className="text-muted-foreground mb-6">
          Your team has been submitted. The admin will confirm your handicaps before the comp.
        </p>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => { setSubmitted(false); setTeamName(""); setPlayer1(""); setPlayer2(""); }}>
            Register Another
          </Button>
          <Button onClick={() => navigate("/comp")}>Back to Comp Area</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-md mx-auto p-4 pt-6 space-y-6 safe-area-top">
        <button
          onClick={() => navigate("/dashboard")}
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Hub
        </button>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              Register Your Team
            </CardTitle>
            <CardDescription>
              Sign up your 2-man Ambrose team for the weekly competition. Handicaps will be confirmed by the admin.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="player1">Player 1 Full Name *</Label>
                <Input
                  id="player1"
                  value={player1}
                  onChange={(e) => setPlayer1(e.target.value)}
                  placeholder="e.g. John Smith"
                  maxLength={100}
                  required
                />
              </div>
              <div>
                <Label htmlFor="player2">Player 2 Full Name *</Label>
                <Input
                  id="player2"
                  value={player2}
                  onChange={(e) => setPlayer2(e.target.value)}
                  placeholder="e.g. Jane Doe"
                  maxLength={100}
                  required
                />
              </div>
              <div>
                <Label htmlFor="teamName">Team Name *</Label>
                <Input
                  id="teamName"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  placeholder="e.g. The Eagles"
                  maxLength={100}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? "Registering..." : "Register Team"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
