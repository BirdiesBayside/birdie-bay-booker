import { useNavigate, useSearchParams } from "react-router-dom";
import { useEffect, useState, useRef } from "react";
import { AuthForm } from "@/components/auth/AuthForm";
import { BiometricPrompt } from "@/components/auth/BiometricPrompt";
import { useAuth } from "@/hooks/useAuth";
import { useBiometric } from "@/hooks/useBiometric";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import birdiesLogo from "@/assets/birdies-logo.png";
import { Gift, Fingerprint } from "lucide-react";

const Index = () => {
  const { isAuthenticated, isLoading: authLoading, user } = useAuth();
  const biometric = useBiometric();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const [giftToken, setGiftToken] = useState<string | null>(null);
  const [isRedeemingGift, setIsRedeemingGift] = useState(false);
  const [isBiometricLoading, setIsBiometricLoading] = useState(false);
  const biometricAttemptRef = useRef(false);

  const [showBiometricEnrollPrompt, setShowBiometricEnrollPrompt] = useState(false);
  const [pendingBiometricEnroll, setPendingBiometricEnroll] = useState<
    { email: string; password: string } | null
  >(null);

  const handleConfirmBiometricEnroll = async () => {
    if (!pendingBiometricEnroll) return;

    try {
      await biometric.saveCredentials(pendingBiometricEnroll.email, pendingBiometricEnroll.password);
      await biometric.refresh();
      toast({
        title: `${biometric.getBiometryName()} enabled!`,
        description: "Next time you open the app, you can sign in with Face ID.",
      });
    } catch (error) {
      console.error("[Biometric] Save error:", error);
      toast({
        title: "Couldn't enable Face ID",
        description: "Please try again in My Account → Security.",
        variant: "destructive",
      });
    } finally {
      setShowBiometricEnrollPrompt(false);
      setPendingBiometricEnroll(null);
    }
  };

  const handleSkipBiometricEnroll = () => {
    setShowBiometricEnrollPrompt(false);
    setPendingBiometricEnroll(null);
  };
  // Check for gift_token in URL
  useEffect(() => {
    const token = searchParams.get("gift_token");
    if (token) {
      setGiftToken(token);
    }
  }, [searchParams]);

  // Reset biometric attempt flag when user is not authenticated (e.g., after logout)
  useEffect(() => {
    if (!isAuthenticated && !authLoading) {
      biometricAttemptRef.current = false;
    }
  }, [isAuthenticated, authLoading]);

  // Auto-trigger biometric login when available and no session
  useEffect(() => {
    const attemptBiometricLogin = async () => {
      // Skip if already attempted, still checking, no credentials, or already authenticated
      if (
        biometricAttemptRef.current ||
        biometric.isChecking ||
        authLoading ||
        isAuthenticated ||
        !biometric.hasCredentials
      ) {
        return;
      }

      biometricAttemptRef.current = true;
      setIsBiometricLoading(true);

      try {
        const credentials = await biometric.authenticate();
        if (credentials) {
          const { error } = await supabase.auth.signInWithPassword({
            email: credentials.email,
            password: credentials.password,
          });

          if (error) {
            toast({
              title: "Sign in failed",
              description: "Please sign in with your email and password.",
              variant: "destructive",
            });

            // Only delete saved credentials if they're actually invalid.
            // (Network/temporary errors shouldn't wipe Face ID login.)
            const msg = (error.message ?? "").toLowerCase();
            if (msg.includes("invalid login credentials")) {
              await biometric.deleteCredentials();
            }
          }
        }
      } catch (error) {
        console.error("[Biometric] Auto-login error:", error);
      } finally {
        setIsBiometricLoading(false);
      }
    };

    attemptBiometricLogin();
  }, [biometric.isChecking, biometric.hasCredentials, authLoading, isAuthenticated, biometric, toast]);

  // Redeem gift card and navigate after authentication
  useEffect(() => {
    const handleAuthenticatedUser = async () => {
      console.log("[Index] handleAuthenticatedUser - isAuthenticated:", isAuthenticated, 
        "user:", !!user, "isRedeemingGift:", isRedeemingGift, 
        "showBiometricEnrollPrompt:", showBiometricEnrollPrompt,
        "pendingBiometricEnroll:", !!pendingBiometricEnroll);
      
      // Don't navigate if biometric enrollment prompt is showing or pending
      if (!isAuthenticated || !user || isRedeemingGift || showBiometricEnrollPrompt || pendingBiometricEnroll) {
        console.log("[Index] Skipping navigation - waiting for biometric enrollment decision or not ready");
        return;
      }

      setIsRedeemingGift(true);
      try {
        const { data, error } = await supabase.functions.invoke("redeem-gift-card", {
          body: {
            email: user.email,
            user_id: user.id,
            token: giftToken || undefined,
          },
        });

        if (!error && data?.redeemed > 0) {
          toast({
            title: "Gift card redeemed!",
            description: `$${data.totalAmount.toFixed(2)} credit has been added to your account.`,
          });
        }
      } catch (err) {
        console.error("Failed to redeem gift card:", err);
      }

      console.log("[Index] Navigating to /dashboard");
      navigate("/dashboard");
    };

    handleAuthenticatedUser();
  }, [isAuthenticated, user, giftToken, navigate, toast, isRedeemingGift, showBiometricEnrollPrompt, pendingBiometricEnroll]);

  // Show loading while checking auth or attempting biometric
  const isLoading = authLoading || biometric.isChecking || isBiometricLoading;

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background safe-area-top safe-area-bottom">
        <img src={birdiesLogo} alt="Birdies" className="h-16 mb-6" />
        {isBiometricLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Fingerprint className="h-5 w-5 animate-pulse" />
            <span>Authenticating...</span>
          </div>
        ) : (
          <div className="animate-pulse text-muted-foreground">Loading...</div>
        )}
      </div>
    );
  }

  return (
    <>
      <BiometricPrompt
        open={showBiometricEnrollPrompt}
        onOpenChange={setShowBiometricEnrollPrompt}
        biometryName={biometric.getBiometryName()}
        onConfirm={handleConfirmBiometricEnroll}
        onCancel={handleSkipBiometricEnroll}
      />

      <div className="min-h-screen flex flex-col">
        {/* Header */}
        <header className="bg-primary py-4 px-6 safe-area-top">
          <img src={birdiesLogo} alt="Birdies" className="h-10" />
        </header>

        {/* Main content */}
        <main className="flex-1 flex items-center justify-center p-6">
          <div className="w-full max-w-md animate-fade-in space-y-4">
            {/* Gift Card Banner */}
            {giftToken && (
              <div className="bg-accent/10 border border-accent/30 rounded-lg p-4 flex items-center gap-3">
                <div className="bg-accent rounded-full p-2">
                  <Gift className="h-5 w-5 text-accent-foreground" />
                </div>
                <div>
                  <p className="font-semibold text-foreground">You have a gift card!</p>
                  <p className="text-sm text-muted-foreground">
                    Sign up or log in to redeem your credit.
                  </p>
                </div>
              </div>
            )}

            <AuthForm
              defaultToSignUp={!!giftToken}
              onSignInSuccess={({ email, password }) => {
                console.log("[Index] onSignInSuccess called");
                console.log("[Index] biometric.isNative:", biometric.isNative);
                console.log("[Index] biometric.isAvailable:", biometric.isAvailable);
                console.log("[Index] biometric.hasCredentials:", biometric.hasCredentials);
                console.log("[Index] biometric.biometryType:", biometric.biometryType);
                
                // IMPORTANT: Index immediately redirects to /dashboard after auth.
                // We capture creds here so the user can actually confirm enabling Face ID *before* redirect.
                if (biometric.isNative && biometric.isAvailable && !biometric.hasCredentials) {
                  console.log("[Index] Showing biometric enrollment prompt");
                  setPendingBiometricEnroll({ email, password });
                  setShowBiometricEnrollPrompt(true);
                } else {
                  console.log("[Index] Not showing biometric prompt - conditions not met");
                }
              }}
            />
          </div>
        </main>

        {/* Footer */}
        <footer className="bg-primary py-4 px-6 text-center">
          <p className="text-primary-foreground/60 text-sm">
            © {new Date().getFullYear()} Birdies. All rights reserved.
          </p>
        </footer>
      </div>
    </>
  );
};

export default Index;