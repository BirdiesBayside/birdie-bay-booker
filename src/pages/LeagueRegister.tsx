import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import birdiesLogo from "@/assets/birdies-logo.png";
import { Loader2, ArrowLeft, RefreshCw, ExternalLink, CheckCircle2 } from "lucide-react";

const SGT_REGISTRATION_URL = "https://simulatorgolftour.com/register?jc=168&jcc=6b0ba3da4ee33e88";

export default function LeagueRegister() {
  const { user, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [registrationComplete, setRegistrationComplete] = useState(false);

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

  // Trigger sync and check if account is now linked
  const handleCheckRegistration = useCallback(async () => {
    if (!user) return;
    
    setIsCheckingStatus(true);
    
    try {
      // Trigger a sync to pull in new SGT members
      const { error: syncError } = await supabase.functions.invoke("sgt-sync");
      
      if (syncError) {
        console.error("Sync error:", syncError);
      }
      
      // Wait a moment for the sync to process
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Check if the user now has an sgt_user_id
      const { data: profile } = await supabase
        .from("profiles")
        .select("sgt_user_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (profile?.sgt_user_id) {
        setRegistrationComplete(true);
        toast.success("Registration confirmed!", {
          description: "Your SGT account has been linked. Redirecting to League Hub...",
        });
        
        // Navigate after a short delay
        setTimeout(() => navigate("/league"), 2000);
      } else {
        toast.info("Registration not yet detected", {
          description: "Please complete the SGT registration form above, then try again.",
        });
      }
    } catch (error) {
      console.error("Check registration error:", error);
      toast.error("Failed to check registration status");
    } finally {
      setIsCheckingStatus(false);
    }
  }, [user, navigate]);

  if (authLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 text-birdies-orange animate-spin" />
      </div>
    );
  }

  if (registrationComplete) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <header className="bg-primary py-4 px-4 safe-area-top">
          <div className="container flex items-center gap-3">
            <img src={birdiesLogo} alt="Birdies" className="h-8 w-auto" />
          </div>
        </header>
        <main className="flex-1 flex items-center justify-center px-4 py-8">
          <div className="text-center">
            <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto mb-4" />
            <h1 className="font-anton text-2xl text-primary mb-2">
              WELCOME TO THE LEAGUE!
            </h1>
            <p className="font-inter text-muted-foreground">
              Redirecting you to the League Hub...
            </p>
            <Loader2 className="h-6 w-6 text-birdies-orange animate-spin mx-auto mt-4" />
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="bg-primary py-4 px-4 safe-area-top">
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
      <main className="flex-1 flex flex-col">
        {/* Instructions */}
        <div className="bg-white border-b border-border/50 px-4 py-4">
          <div className="container max-w-4xl">
            <h1 className="font-anton text-xl text-primary mb-1">
              JOIN BIRDIES LEAGUE
            </h1>
            <p className="font-inter text-sm text-muted-foreground">
              Complete the registration form below to create your Simulator Golf Tour account.
              <strong className="text-primary"> Use your Birdies Hub email ({user.email})</strong> so we can link your accounts.
            </p>
          </div>
        </div>

        {/* Iframe Container */}
        <div className="flex-1 relative">
          {!iframeLoaded && (
            <div className="absolute inset-0 flex items-center justify-center bg-background">
              <div className="text-center">
                <Loader2 className="h-8 w-8 text-birdies-orange animate-spin mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Loading registration form...</p>
              </div>
            </div>
          )}
          <iframe
            src={SGT_REGISTRATION_URL}
            title="SGT Registration"
            className="w-full h-full min-h-[500px] border-0"
            onLoad={() => setIframeLoaded(true)}
            allow="payment"
          />
        </div>

        {/* Bottom Actions */}
        <div className="bg-white border-t border-border/50 px-4 py-4 safe-area-bottom">
          <div className="container max-w-4xl space-y-3">
            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                onClick={handleCheckRegistration}
                disabled={isCheckingStatus}
                className="flex-1 bg-birdies-orange hover:bg-birdies-orange/90 text-white font-inter font-semibold"
              >
                {isCheckingStatus ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Checking...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    I've Completed Registration
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                onClick={() => window.open(SGT_REGISTRATION_URL, "_blank")}
                className="sm:w-auto"
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                Open in New Tab
              </Button>
            </div>
            <p className="text-xs text-center text-muted-foreground font-inter">
              After completing the form above, click "I've Completed Registration" to link your account.
              If the form doesn't display properly, use the "Open in New Tab" button.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
