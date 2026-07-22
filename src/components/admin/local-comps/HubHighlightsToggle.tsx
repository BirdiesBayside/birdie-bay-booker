import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Video } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export function HubHighlightsToggle() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: settings } = useQuery({
    queryKey: ["local-comp-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("local_comp_settings")
        .select("id, hub_highlights_enabled")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      if (!settings?.id) throw new Error("Settings row missing");
      const { error } = await supabase
        .from("local_comp_settings")
        .update({ hub_highlights_enabled: enabled })
        .eq("id", settings.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["local-comp-settings"] });
      toast({ title: "Saved", duration: 2000 });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const enabled = !!settings?.hub_highlights_enabled;

  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-4 py-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 h-9 w-9 rounded-lg bg-accent/15 flex items-center justify-center shrink-0">
            <Video className="h-4 w-4 text-accent" />
          </div>
          <div>
            <Label htmlFor="hub-hl-toggle" className="text-base font-semibold cursor-pointer">
              Hub Highlights for Local Comp
            </Label>
            <p className="text-sm text-muted-foreground mt-0.5">
              When on, any booking tagged with the comp{" "}
              <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-accent text-accent-foreground text-[8px] font-bold align-middle">C</span>{" "}
              on a comp day is auto-recorded and lands in SGT → Highlights (no hole-tagging).
            </p>
          </div>
        </div>
        <Switch
          id="hub-hl-toggle"
          checked={enabled}
          onCheckedChange={(v) => toggleMutation.mutate(v)}
          disabled={toggleMutation.isPending || !settings}
        />
      </CardContent>
    </Card>
  );
}
