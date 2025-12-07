import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Check, Crown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import birdiesLogo from "@/assets/birdies-logo.png";

interface MembershipTier {
  name: string;
  priceId: string;
  productId: string;
  weeklyFee: number;
  hourlyRate: number;
  features: string[];
  color: string;
  badgeColor: string;
  popular?: boolean;
}

// Stripe price and product IDs for each membership tier
const MEMBERSHIP_TIERS: Record<string, MembershipTier> = {
  par: {
    name: "Par",
    priceId: "price_1SbVrRLpXZPXTNVBUcGdyz8u",
    productId: "prod_TYd7QY23jzF3P4",
    weeklyFee: 15,
    hourlyRate: 12,
    features: ["Cancel any time"],
    color: "border-emerald-500",
    badgeColor: "bg-emerald-100 text-emerald-800",
  },
  birdie: {
    name: "Birdie",
    priceId: "price_1SbVrcLpXZPXTNVB5WUvDHZt",
    productId: "prod_TYd7LDyVYD1bJs",
    weeklyFee: 20,
    hourlyRate: 10,
    features: ["Birdies League Access", "Cancel any time"],
    color: "border-blue-500",
    badgeColor: "bg-blue-100 text-blue-800",
  },
  eagle: {
    name: "Eagle",
    priceId: "price_1SbVroLpXZPXTNVBEwRcbDn7",
    productId: "prod_TYd8lH1kqVy713",
    weeklyFee: 25,
    hourlyRate: 9,
    features: ["Birdies League Access", "Cancel any time", "Free merch pack"],
    color: "border-purple-500",
    badgeColor: "bg-purple-100 text-purple-800",
    popular: true,
  },
  albatross: {
    name: "Albatross",
    priceId: "price_1SbVsELpXZPXTNVBTsNhk1H2",
    productId: "prod_TYd8J3bpTeqVAU",
    weeklyFee: 35,
    hourlyRate: 8,
    features: ["Birdies League Access", "Cancel any time", "Free merch pack", "Personal Locker"],
    color: "border-amber-500",
    badgeColor: "bg-amber-100 text-amber-800",
  },
};



const Membership = () => {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [currentTier, setCurrentTier] = useState<string>("visitor");
  const [isLoading, setIsLoading] = useState(true);
  const [subscribingTier, setSubscribingTier] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate("/");
    }
  }, [isAuthenticated, authLoading, navigate]);

  useEffect(() => {
    if (user) {
      fetchCurrentMembership();
    }
  }, [user]);

  const fetchCurrentMembership = async () => {
    if (!user) return;

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("membership_tier")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) throw error;
      setCurrentTier(data?.membership_tier || "visitor");
    } catch (error) {
      console.error("Error fetching membership:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubscribe = async (tierKey: string) => {
    const tier = MEMBERSHIP_TIERS[tierKey];
    setSubscribingTier(tierKey);

    try {
      const { data, error } = await supabase.functions.invoke("create-membership-checkout", {
        body: { 
          priceId: tier.priceId,
          tierKey: tierKey,
        },
      });

      if (error) throw error;

      // If subscription was created directly (using saved card)
      if (data.success && data.subscriptionId) {
        toast.success(`Successfully subscribed to ${tier.name} membership!`);
        // Refresh the page to update membership status
        navigate(`/membership?success=true&tier=${tierKey}`, { replace: true });
        fetchCurrentMembership();
        return;
      }

      // If redirecting to Stripe Checkout (no saved card)
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (error) {
      console.error("Error creating subscription:", error);
      toast.error("Failed to subscribe. Please ensure you have a payment method saved.");
    } finally {
      setSubscribingTier(null);
    }
  };

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  const isCurrentTier = (tierKey: string) => currentTier === tierKey;
  const hasActiveMembership = currentTier !== "visitor";

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="bg-primary py-4 px-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/dashboard")}
            className="text-primary-foreground hover:bg-primary-foreground/10"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <span className="font-display text-2xl tracking-wide text-primary-foreground">
            MEMBERSHIP
          </span>
        </div>
        <img 
          src={birdiesLogo} 
          alt="Birdies" 
          className="h-10 w-auto"
        />
      </header>

      {/* Main content */}
      <main className="flex-1 p-6">
        <div className="container max-w-5xl mx-auto">
          {/* Current membership info */}
          {hasActiveMembership && (
            <Card className="mb-8">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <Crown className="h-6 w-6 text-accent" />
                  <div>
                    <CardTitle>Your Current Membership</CardTitle>
                    <CardDescription>
                      You are currently on the{" "}
                      <Badge className={MEMBERSHIP_TIERS[currentTier]?.badgeColor || ""}>
                        {MEMBERSHIP_TIERS[currentTier]?.name || currentTier}
                      </Badge>{" "}
                      plan at <span className="font-semibold">${MEMBERSHIP_TIERS[currentTier]?.hourlyRate || 30}/hour</span>
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
            </Card>
          )}

          {/* Intro text */}
          <div className="text-center mb-8">
            <h1 className="font-display text-3xl md:text-4xl text-primary mb-2">
              {hasActiveMembership ? "UPGRADE YOUR MEMBERSHIP" : "BECOME A MEMBER"}
            </h1>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Join the Birdies family and enjoy discounted hourly rates, exclusive access to leagues, and more perks. 
              All memberships are billed weekly with no lock-in contracts.
            </p>
          </div>

          {/* Membership tiers grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {Object.entries(MEMBERSHIP_TIERS).map(
              ([key, tier]) => (
                <Card 
                  key={key} 
                  className={`relative flex flex-col ${tier.color} border-2 ${
                    isCurrentTier(key) ? "ring-2 ring-accent ring-offset-2" : ""
                  } ${tier.popular ? "lg:-mt-4 lg:mb-4" : ""}`}
                >
                  {tier.popular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <Badge className="bg-accent text-accent-foreground">Most Popular</Badge>
                    </div>
                  )}
                  {isCurrentTier(key) && (
                    <div className="absolute -top-3 right-4">
                      <Badge variant="outline" className="bg-background">Your Plan</Badge>
                    </div>
                  )}
                  
                  <CardHeader className="text-center pb-2">
                    <CardTitle className="font-display text-2xl">{tier.name.toUpperCase()}</CardTitle>
                    <div className="mt-4">
                      <span className="text-4xl font-bold text-accent">${tier.hourlyRate}</span>
                      <span className="text-muted-foreground"> Per Hour</span>
                    </div>
                  </CardHeader>
                  
                  <CardContent className="flex-1 flex flex-col">
                    <ul className="space-y-3 mb-6 flex-1">
                      {tier.features.map((feature, index) => (
                        <li key={index} className="flex items-center gap-2 text-sm">
                          <Check className="h-4 w-4 text-accent flex-shrink-0" />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                    
                    <div className="text-center mb-4">
                      <span className="text-2xl font-bold">${tier.weeklyFee}</span>
                      <span className="text-muted-foreground"> per week</span>
                    </div>
                    
                    <Button
                      onClick={() => handleSubscribe(key)}
                      disabled={isCurrentTier(key) || subscribingTier !== null}
                      className={`w-full ${
                        isCurrentTier(key) 
                          ? "bg-muted text-muted-foreground" 
                          : "bg-accent text-accent-foreground hover:bg-accent/90"
                      }`}
                    >
                      {subscribingTier === key ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Processing...
                        </>
                      ) : isCurrentTier(key) ? (
                        "Current Plan"
                      ) : hasActiveMembership ? (
                        "Switch Plan"
                      ) : (
                        "Subscribe"
                      )}
                    </Button>
                  </CardContent>
                </Card>
              )
            )}
          </div>

          {/* Footer note */}
          <p className="text-center text-sm text-muted-foreground mt-8">
            Need to cancel? Email us at support@birdiesbayside.com.au and we'll help you out.
          </p>
        </div>
      </main>
    </div>
  );
};

export default Membership;
