import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { TermsContent } from "./TermsContent";
import { CURRENT_TERMS_VERSION } from "@/lib/terms-version";

// Routes that must never be blocked (kiosks, embeds, admin tooling, public pages)
const EXEMPT_PREFIXES = [
  "/admin",
  "/bay-controller",
  "/embed",
  "/welcome-preview",
  "/order",
  "/unsubscribe",
  "/feedback",
  "/reset-password",
  "/privacy",
  "/compete",
  "/gift",
  "/comp-survey",
];

export function TermsGate() {
  const { user, isLoading } = useAuth();
  const location = useLocation();
  const { toast } = useToast();
  const [needsAccept, setNeedsAccept] = useState(false);
  const [checked, setChecked] = useState(false);
  const [saving, setSaving] = useState(false);

  const exempt = EXEMPT_PREFIXES.some((p) => location.pathname.startsWith(p));

  useEffect(() => {
    if (isLoading || !user || exempt) return;
    let active = true;

    (async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("terms_version_accepted")
        .eq("id", user.id)
        .maybeSingle();

      if (!active || error) return;
      setNeedsAccept(data?.terms_version_accepted !== CURRENT_TERMS_VERSION);
    })();

    return () => {
      active = false;
    };
  }, [user, isLoading, exempt]);

  const handleAccept = async () => {
    if (!user || !checked) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        terms_version_accepted: CURRENT_TERMS_VERSION,
        terms_accepted_at: new Date().toISOString(),
      })
      .eq("id", user.id);
    setSaving(false);

    if (error) {
      toast({
        title: "Could not save",
        description: "Please try again, or contact Birdies if this keeps happening.",
        variant: "destructive",
      });
      return;
    }
    setNeedsAccept(false);
  };

  if (exempt || !user || !needsAccept) return null;

  return (
    <Dialog open>
      <DialogContent
        className="max-w-2xl max-h-[90vh]"
        hideClose
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="font-display text-xl text-primary">
            We've updated our Terms and Conditions
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          Our bays now have cameras and we record gameplay for league rounds, competitions
          and highlights. Please review and accept the updated terms to keep using Birdies.
        </p>

        <ScrollArea className="h-[45vh] pr-4 border rounded-md p-4">
          <TermsContent />
        </ScrollArea>

        <div className="flex items-start space-x-2">
          <Checkbox
            id="terms-gate"
            checked={checked}
            onCheckedChange={(v) => setChecked(v === true)}
          />
          <label htmlFor="terms-gate" className="text-sm font-medium leading-snug">
            I have read and accept the updated Terms and Conditions, including consent to
            being recorded in the bays.
          </label>
        </div>

        <div className="flex gap-2 justify-end">
          <Button
            variant="ghost"
            onClick={() => supabase.auth.signOut()}
            disabled={saving}
          >
            Sign out
          </Button>
          <Button onClick={handleAccept} disabled={!checked || saving}>
            {saving ? "Saving..." : "Accept and continue"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
