import { useNavigate, useSearchParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { AuthForm } from "@/components/auth/AuthForm";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import birdiesLogo from "@/assets/birdies-logo.png";
import { Gift } from "lucide-react";

const Index = () => {
  const { isAuthenticated, isLoading, user } = useAuth();
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

  // Redeem gift card after authentication
  useEffect(() => {
    const redeemGiftCard = async () => {
      if (isAuthenticated && user && !isRedeemingGift) {
        // Check if there are any pending gift cards for this email
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
      } else if (isAuthenticated && !giftToken) {
        navigate("/dashboard");
      }
    };

    redeemGiftCard();
  }, [isAuthenticated, user, giftToken, navigate, toast, isRedeemingGift]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
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