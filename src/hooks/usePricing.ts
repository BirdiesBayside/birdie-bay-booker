import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface PricingTier {
  id: string;
  tier: string;
  hourly_rate: number;
  weekly_subscription_price: number | null;
  stripe_product_id: string | null;
  stripe_price_id: string | null;
  display_name: string;
  display_order: number;
  is_subscription: boolean;
}

// Updated fallback rates for new tier structure
const FALLBACK_RATES: Record<string, number> = {
  visitor: 35, // Peak rate
  weekday: 10,
  birdie: 10,
  eagle: 8,
};

export function usePricing() {
  const [pricing, setPricing] = useState<PricingTier[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPricing = async () => {
    setIsLoading(true);
    setError(null);

    const { data, error: fetchError } = await supabase
      .from("pricing_config")
      .select("*")
      .order("display_order");

    if (fetchError) {
      console.error("Error fetching pricing:", fetchError);
      setError(fetchError.message);
    } else if (data) {
      setPricing(data as PricingTier[]);
    }

    setIsLoading(false);
  };

  const getHourlyRate = (tier: string): number => {
    const tierPricing = pricing.find(p => p.tier === tier.toLowerCase());
    if (tierPricing) {
      return Number(tierPricing.hourly_rate);
    }
    return FALLBACK_RATES[tier.toLowerCase()] || FALLBACK_RATES.visitor;
  };

  const getWeeklyPrice = (tier: string): number | null => {
    const tierPricing = pricing.find(p => p.tier === tier.toLowerCase());
    return tierPricing?.weekly_subscription_price 
      ? Number(tierPricing.weekly_subscription_price) 
      : null;
  };

  const getStripePriceId = (tier: string): string | null => {
    const tierPricing = pricing.find(p => p.tier === tier.toLowerCase());
    return tierPricing?.stripe_price_id || null;
  };

  useEffect(() => {
    fetchPricing();
  }, []);

  return {
    pricing,
    isLoading,
    error,
    getHourlyRate,
    getWeeklyPrice,
    getStripePriceId,
    refetch: fetchPricing,
  };
}