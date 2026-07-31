import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { formatBrisbane } from "@/lib/brisbane-time";

interface SgtConfig {
  club_url: string;
  username: string;
  has_password: boolean;
  credentials_valid: boolean;
  last_verified_at: string | null;
  last_error: string | null;
  api_key_expires_at: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SGTSettingsDialog({ open, onOpenChange }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [config, setConfig] = useState<SgtConfig | null>(null);
  const [clubUrl, setClubUrl] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const loadConfig = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("sgt-member-management", {
        body: { action: "get-config" },
      });
      if (error) throw error;
      const cfg = (data?.result ?? data) as SgtConfig;
      setConfig(cfg);
      setClubUrl(cfg?.club_url ?? "");
      setUsername(cfg?.username ?? "");
      setPassword("");
    } catch (e) {
      toast({
        title: "Couldn't load SGT settings",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) loadConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const save = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.functions.invoke("sgt-member-management", {
        body: { action: "save-config", club_url: clubUrl, username, password },
      });
      if (error) throw error;
      setPassword("");
      toast({ title: "SGT settings saved" });
      await loadConfig();
    } catch (e) {
      toast({
        title: "Save failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async () => {
    setTesting(true);
    try {
      // Persist anything typed before testing so the test uses current values
      await supabase.functions.invoke("sgt-member-management", {
        body: { action: "save-config", club_url: clubUrl, username, password },
      });
      setPassword("");

      const { data, error } = await supabase.functions.invoke("sgt-member-management", {
        body: { action: "verify-credentials" },
      });
      if (error) throw error;
      const res = (data?.result ?? data) as {
        success: boolean;
        member_count?: number;
        club_url?: string;
        error?: string;
      };

      if (res?.success) {
        toast({
          title: "Connected to SGT",
          description: `${res.club_url} · ${res.member_count ?? 0} club members found`,
        });
      } else {
        toast({
          title: "Connection failed",
          description: res?.error ?? "SGT rejected these details",
          variant: "destructive",
        });
      }
      await loadConfig();
    } catch (e) {
      toast({
        title: "Connection failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>SGT Connection</DialogTitle>
          <DialogDescription>
            Your Simulator Golf Tour club-admin details. Everything in SGT Manager —
            members, tours, tournaments, registrations, handicaps and highlights —
            runs off these credentials.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="sgt-club-url">Club URL</Label>
              <Input
                id="sgt-club-url"
                value={clubUrl}
                onChange={(e) => setClubUrl(e.target.value)}
                placeholder="yourclubslug"
              />
              <p className="text-xs text-muted-foreground break-words">
                The slug from your SGT club address:
                simulatorgolftour.com/club/<strong>yourclubslug</strong>
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="sgt-username">SGT username</Label>
              <Input
                id="sgt-username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="off"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="sgt-password">SGT password</Label>
              <Input
                id="sgt-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={config?.has_password ? "•••••••• (saved)" : "Enter password"}
                autoComplete="new-password"
              />
              <p className="text-xs text-muted-foreground">
                Leave blank to keep the saved password. Stored server-side only — it is
                never sent back to the browser.
              </p>
            </div>

            <div className="rounded-md border border-border bg-muted/30 p-3 space-y-2 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-muted-foreground">Status</span>
                {config?.credentials_valid ? (
                  <Badge className="gap-1">
                    <CheckCircle2 className="h-3 w-3" /> Connected
                  </Badge>
                ) : (
                  <Badge variant="destructive" className="gap-1">
                    <AlertTriangle className="h-3 w-3" /> Not verified
                  </Badge>
                )}
              </div>
              <div className="text-xs text-muted-foreground space-y-1 break-words">
                <div>
                  API key valid until:{" "}
                  {config?.api_key_expires_at
                    ? formatBrisbane(new Date(config.api_key_expires_at), "d MMM yyyy, h:mm a")
                    : "—"}
                </div>
                <div>
                  Last checked:{" "}
                  {config?.last_verified_at
                    ? formatBrisbane(new Date(config.last_verified_at), "d MMM yyyy, h:mm a")
                    : "Never"}
                </div>
                {config?.last_error && (
                  <div className="text-destructive">Last error: {config.last_error}</div>
                )}
              </div>
            </div>

            <div className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground space-y-1">
              <p className="font-medium text-foreground">Getting started</p>
              <p>1. Enter your club URL, username and password, then Test connection.</p>
              <p>2. Create your Tour, then add your first Tournament in the Tournaments tab.</p>
              <p>
                3. Automation (member sync, daily registration, handicaps, highlights)
                begins on the next scheduled run and stays quiet until a tournament exists.
              </p>
            </div>
          </div>
        )}

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={testConnection} disabled={testing || saving}>
            {testing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Test connection
          </Button>
          <Button onClick={save} disabled={saving || testing}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
