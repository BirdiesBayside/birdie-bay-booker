import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import birdiesLogo from "@/assets/birdies-logo.png";
import { Loader2, CheckCircle2, XCircle, ArrowLeft } from "lucide-react";

export default function LeagueRegister() {
  const { user, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [usernameStatus, setUsernameStatus] = useState<"idle" | "checking" | "available" | "taken">("idle");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [checkTimeout, setCheckTimeout] = useState<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/");
    }
  }, [user, authLoading, navigate]);

  // Check if user already has SGT account
  useEffect(() => {
    if (!user) return;

    async function checkExisting() {
      const { data: profile } = await supabase
        .from("profiles")
        .select("sgt_user_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (profile?.sgt_user_id) {
        // Already registered, redirect to league hub
        navigate("/league");
      }
    }

    checkExisting();
  }, [user, navigate]);

  // Debounced username availability check
  useEffect(() => {
    if (checkTimeout) {
      clearTimeout(checkTimeout);
    }

    if (!username || username.length < 2) {
      setUsernameStatus("idle");
      return;
    }

    // Validate format
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      setUsernameStatus("idle");
      return;
    }

    setUsernameStatus("checking");

    const timeout = setTimeout(async () => {
      try {
        const { data, error } = await supabase.functions.invoke("sgt-register", {
          body: { action: "check-username", username },
        });

        if (error) throw error;

        setUsernameStatus(data.available ? "available" : "taken");
      } catch (error) {
        console.error("Username check failed:", error);
        setUsernameStatus("idle");
      }
    }, 500);

    setCheckTimeout(timeout);

    return () => {
      if (timeout) clearTimeout(timeout);
    };
  }, [username]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!username || !password) {
      toast.error("Please fill in all fields");
      return;
    }

    if (usernameStatus !== "available") {
      toast.error("Please choose an available username");
      return;
    }

    if (password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }

    setIsSubmitting(true);

    try {
      const { data, error } = await supabase.functions.invoke("sgt-register", {
        body: { action: "register", username, password },
      });

      if (error) throw error;

      if (data.error) {
        toast.error(data.error);
        return;
      }

      toast.success("Welcome to the Birdies League!", {
        description: "Your account has been created and you're registered for upcoming tournaments.",
      });

      // Navigate to league hub
      navigate("/league");
    } catch (error: any) {
      console.error("Registration failed:", error);
      toast.error("Registration failed", {
        description: error.message || "Please try again later",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (authLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 text-birdies-orange animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="bg-primary py-4 px-4">
        <div className="container flex items-center gap-3">
          <button
            onClick={() => navigate("/dashboard")}
            className="text-primary-foreground/80 hover:text-primary-foreground transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <img src={birdiesLogo} alt="Birdies" className="h-8 w-auto" />
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl border border-border/50 shadow-sm p-6 md:p-8">
            <div className="text-center mb-6">
              <h1 className="font-anton text-2xl text-primary mb-2">
                JOIN BIRDIES LEAGUE
              </h1>
              <p className="font-inter text-sm text-muted-foreground">
                Create your Simulator Golf Tour account to compete in tournaments and track your stats.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Username */}
              <div className="space-y-2">
                <Label htmlFor="username" className="font-inter text-sm font-medium">
                  Choose a Username
                </Label>
                <div className="relative">
                  <Input
                    id="username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, ""))}
                    placeholder="e.g. TigerWoods99"
                    className="pr-10"
                    maxLength={64}
                    disabled={isSubmitting}
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    {usernameStatus === "checking" && (
                      <Loader2 className="h-4 w-4 text-muted-foreground animate-spin" />
                    )}
                    {usernameStatus === "available" && (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    )}
                    {usernameStatus === "taken" && (
                      <XCircle className="h-4 w-4 text-destructive" />
                    )}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground font-inter">
                  2-64 characters. Letters, numbers, and underscores only.
                </p>
                {usernameStatus === "taken" && (
                  <p className="text-xs text-destructive font-inter">
                    This username is already taken. Please try another.
                  </p>
                )}
              </div>

              {/* Password Confirmation */}
              <div className="space-y-2">
                <Label htmlFor="password" className="font-inter text-sm font-medium">
                  Confirm Your Password
                </Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your Hub password"
                  disabled={isSubmitting}
                />
                <p className="text-xs text-muted-foreground font-inter">
                  Enter your Birdies Hub password to create your SGT account with the same credentials.
                </p>
              </div>

              {/* Email Display */}
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-xs text-muted-foreground font-inter mb-1">
                  Your account will be linked to:
                </p>
                <p className="text-sm font-medium font-inter text-primary">
                  {user.email}
                </p>
              </div>

              {/* Submit */}
              <Button
                type="submit"
                className="w-full bg-birdies-orange hover:bg-birdies-orange/90 text-white font-inter font-semibold"
                disabled={isSubmitting || usernameStatus !== "available" || password.length < 6}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating Account...
                  </>
                ) : (
                  "Join the League"
                )}
              </Button>
            </form>

            <p className="text-xs text-center text-muted-foreground mt-6 font-inter">
              By joining, you'll be automatically registered for all upcoming tournaments.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
