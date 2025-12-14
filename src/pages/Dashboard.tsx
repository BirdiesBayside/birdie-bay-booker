import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { LogOut, Calendar, Settings, ClipboardList, Trophy, Lock, ExternalLink, Shield } from "lucide-react";
import birdiesLogo from "@/assets/birdies-logo.png";
import { supabase } from "@/integrations/supabase/client";

type MembershipTier = "visitor" | "par" | "birdie" | "eagle" | "albatross";

const Dashboard = () => {
  const { user, isAuthenticated, isLoading, signOut } = useAuth();
  const navigate = useNavigate();
  const [membershipTier, setMembershipTier] = useState<MembershipTier>("visitor");
  const [hasSgtAccount, setHasSgtAccount] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate("/");
    }
  }, [isAuthenticated, isLoading, navigate]);

  useEffect(() => {
    const fetchProfile = async () => {
      if (!user) return;
      const { data } = await supabase
        .from("profiles")
        .select("membership_tier, sgt_user_id")
        .eq("user_id", user.id)
        .single();
      if (data?.membership_tier) {
        setMembershipTier(data.membership_tier as MembershipTier);
      }
      setHasSgtAccount(!!data?.sgt_user_id);
    };
    fetchProfile();
  }, [user]);

  useEffect(() => {
    const checkAdminStatus = async () => {
      if (!user) return;
      const { data } = await supabase.rpc('has_role', { 
        _user_id: user.id, 
        _role: 'admin' 
      });
      setIsAdmin(!!data);
    };
    checkAdminStatus();
  }, [user]);

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  const firstName = user?.user_metadata?.first_name || "Member";
  const hasLeagueAccess = ["birdie", "eagle", "albatross"].includes(membershipTier);

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-primary py-4 px-6 flex items-center justify-between">
        <img 
          src={birdiesLogo} 
          alt="Birdies" 
          className="h-10 w-auto"
        />
        <div className="flex items-center gap-2 sm:gap-4">
          <span className="text-primary-foreground/80 text-sm hidden sm:block">
            Welcome, {firstName}
          </span>
          {isAdmin && (
            <Button
              size="sm"
              onClick={() => navigate("/admin")}
              className="bg-accent text-accent-foreground hover:bg-accent/90"
            >
              <Shield className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Admin</span>
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSignOut}
            className="text-primary-foreground hover:bg-primary-foreground/10"
          >
            <LogOut className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Sign Out</span>
          </Button>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 p-6">
        <div className="container max-w-4xl mx-auto">
          <h1 className="font-display text-4xl text-primary mb-8">
            WELCOME, {firstName.toUpperCase()}
          </h1>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-card rounded-lg p-6 shadow-md border border-border">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-10 w-10 rounded-lg bg-accent/10 flex items-center justify-center">
                  <Calendar className="h-5 w-5 text-accent" />
                </div>
                <h2 className="font-semibold text-lg">Book a Bay</h2>
              </div>
              <p className="text-muted-foreground mb-4">
                Reserve your spot at one of our 6 premium golf simulator bays.
              </p>
              <Button 
                className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
                onClick={() => navigate("/booking")}
              >
                Book Now
              </Button>
            </div>

            <div className="bg-card rounded-lg p-6 shadow-md border border-border">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-10 w-10 rounded-lg bg-accent/10 flex items-center justify-center">
                  <ClipboardList className="h-5 w-5 text-accent" />
                </div>
                <h2 className="font-semibold text-lg">My Bookings</h2>
              </div>
              <p className="text-muted-foreground mb-4">
                View, edit, or cancel your upcoming bay reservations.
              </p>
              <Button 
                className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
                onClick={() => navigate("/my-bookings")}
              >
                View Bookings
              </Button>
            </div>

            {/* Birdies League Section */}
            <div className={`bg-card rounded-lg p-6 shadow-md border relative ${!hasLeagueAccess ? "border-border opacity-60" : "border-league-primary/30"}`}>
              {!hasLeagueAccess && (
                <div className="absolute top-3 right-3">
                  <div className="flex items-center gap-1 text-xs text-muted-foreground bg-muted px-2 py-1 rounded-full">
                    <Lock className="h-3 w-3" />
                    <span>Members Only</span>
                  </div>
                </div>
              )}
              <div className="flex items-center gap-3 mb-4">
                <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${hasLeagueAccess ? "bg-league-primary/15" : "bg-muted"}`}>
                  <Trophy className={`h-5 w-5 ${hasLeagueAccess ? "text-league-primary-dark" : "text-muted-foreground"}`} />
                </div>
                <h2 className="font-semibold text-lg">Birdies League</h2>
              </div>
              {hasLeagueAccess ? (
                <>
                  <p className="text-muted-foreground mb-4">
                    Compete in weekly leagues and track your progress.
                  </p>
                  <div className="flex gap-2">
                    {!hasSgtAccount && (
                      <Button 
                        className="flex-1 bg-league-primary text-league-foreground hover:bg-league-primary-dark"
                        onClick={() => navigate("/league/register")}
                      >
                        Register
                      </Button>
                    )}
                    <Button 
                      className={`${hasSgtAccount ? 'w-full' : 'flex-1'} bg-league-primary text-league-foreground hover:bg-league-primary-dark`}
                      onClick={() => navigate("/league")}
                    >
                      View League
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-muted-foreground mb-4">
                    Upgrade to Birdie, Eagle, or Albatross membership to access the league.
                  </p>
                  <Button 
                    className="w-full"
                    variant="secondary"
                    onClick={() => navigate("/membership")}
                  >
                    View Memberships
                  </Button>
                </>
              )}
            </div>

            <div className="bg-card rounded-lg p-6 shadow-md border border-border">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-10 w-10 rounded-lg bg-accent/10 flex items-center justify-center">
                  <Settings className="h-5 w-5 text-accent" />
                </div>
                <h2 className="font-semibold text-lg">My Account</h2>
              </div>
              <p className="text-muted-foreground mb-4">
                Manage membership, payment methods, and account settings.
              </p>
              <Button 
                className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
                onClick={() => navigate("/my-account")}
              >
                Account Settings
              </Button>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-primary py-4 px-6 text-center">
        <p className="text-primary-foreground/60 text-sm">
          © {new Date().getFullYear()} Birdies. All rights reserved.
        </p>
      </footer>
    </div>
  );
};

export default Dashboard;