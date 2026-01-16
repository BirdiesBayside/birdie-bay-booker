import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { QUERY_KEYS, STALE_TIMES } from "@/lib/query-keys";

export interface SavedCard {
  brand: string;
  last4: string;
  expMonth?: number;
  expYear?: number;
}

const fetchSavedCard = async (): Promise<SavedCard | null> => {
  const { data, error } = await supabase.functions.invoke("get-payment-methods");
  if (error || !data?.paymentMethods?.length) return null;
  
  const card = data.paymentMethods.find((pm: any) => pm.type === "card");
  if (!card) return null;
  
  return {
    brand: card.brand,
    last4: card.last4,
    expMonth: card.expMonth,
    expYear: card.expYear,
  };
};

export function useSavedCard() {
  const queryClient = useQueryClient();
  
  const { data: savedCard, isLoading: isLoadingSavedCard, refetch: refetchSavedCard } = useQuery({
    queryKey: QUERY_KEYS.SAVED_CARD,
    queryFn: fetchSavedCard,
    staleTime: STALE_TIMES.SEMI_STATIC,
  });

  const invalidateSavedCard = () => {
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.SAVED_CARD });
  };

  return {
    savedCard: savedCard ?? null,
    isLoadingSavedCard,
    refetchSavedCard,
    invalidateSavedCard,
  };
}
