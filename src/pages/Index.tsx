import { useNavigate, useSearchParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { AuthForm } from "@/components/auth/AuthForm";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import birdiesLogo from "@/assets/birdies-logo.png";
import birdiesAppIcon from "@/assets/birdies-app-icon.png";
import { Gift } from "lucide-react";

const Index = () => {
  const { isAuthenticated, isLoading: authLoading, user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const [giftToken, setGiftToken] = useState<string | null>(null);
  const [isRedeemingGift, setIsRedeemingGift] = useState(false);

  // Check for gift_token in URL
  useEffect(() => {
    const token = searchParams.get("gift_token");
    if (token) {
      setGiftToken(token);
    }
  }, [searchParams]);

  // Redeem gift card and navigate after authentication
  useEffect(() => {
    const handleAuthenticatedUser = async () => {
      if (!isAuthenticated || !user || isRedeemingGift) return;

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

      navigate("/dashboard");
    };

    handleAuthenticatedUser();
  }, [isAuthenticated, user, giftToken, navigate, toast, isRedeemingGift]);

  // Show loading state while checking auth OR if already authenticated (waiting for redirect)
  if (authLoading || isAuthenticated) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background safe-area-top safe-area-bottom">
        <img src={birdiesAppIcon} alt="Birdies" className="h-20 mb-6" />
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
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

          <AuthForm defaultToSignUp={!!giftToken} />
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

export default Index;
