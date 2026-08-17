import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface NicknameMap {
  byId: Map<number, string>;
  byName: Map<string, string>;
}

/**
 * Birdies-facing display names for SGT players.
 * SGT usernames must stay exactly as GSPro requires, so we keep an optional
 * nickname on sgt_tour_members and swap it in wherever we render a name.
 */
export function useSgtNicknames() {
  const { data } = useQuery({
    queryKey: ["sgt-nicknames"],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<NicknameMap> => {
      const { data, error } = await supabase
        .from("sgt_tour_members")
        .select("user_id, user_name, nickname")
        .not("nickname", "is", null);

      if (error) throw error;

      const byId = new Map<number, string>();
      const byName = new Map<string, string>();
      (data || []).forEach((row) => {
        const nick = (row.nickname || "").trim();
        if (!nick) return;
        if (row.user_id != null) byId.set(row.user_id, nick);
        if (row.user_name) byName.set(row.user_name.toLowerCase(), nick);
      });

      return { byId, byName };
    },
  });

  const displayName = (name?: string | null, playerId?: number | null): string => {
    if (playerId != null && data?.byId.has(playerId)) return data.byId.get(playerId)!;
    if (name && data?.byName.has(name.toLowerCase())) return data.byName.get(name.toLowerCase())!;
    return name || "";
  };

  return { displayName, nicknames: data };
}
