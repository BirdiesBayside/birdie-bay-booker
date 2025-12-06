import { useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { LogOut, Calendar, User } from "lucide-react";

const Dashboard = () => {
  const { user, isAuthenticated, isLoading, signOut } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate("/");
    }
  }, [isAuthenticated, isLoading, navigate]);

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

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-primary py-4 px-6 flex items-center justify-between">
        <span className="font-display text-2xl tracking-wide text-primary-foreground">
          BIRDIES
        </span>
        <div className="flex items-center gap-4">
          <span className="text-primary-foreground/80 text-sm hidden sm:block">
            Welcome, {firstName}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSignOut}
            className="text-primary-foreground hover:bg-primary-foreground/10"
          >
            <LogOut className="h-4 w-4 mr-2" />
            Sign Out
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
                  <User className="h-5 w-5 text-accent" />
                </div>
                <h2 className="font-semibold text-lg">My Profile</h2>
              </div>
              <p className="text-muted-foreground mb-4">
                View and update your account details and membership status.
              </p>
              <Button variant="outline" className="w-full">
                View Profile
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