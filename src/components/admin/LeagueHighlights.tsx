import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Play, RefreshCw, Trash2, Video } from "lucide-react";

interface Bay { id: string; bay_number: number; name: string | null }
interface HighlightRow {
  hole_id: string;
  session_id: string;
  hole_number: number;
  par: number | null;
  score: number | null;
  storage_path: string | null;
  player_name: string | null;
  tournament_name: string | null;
  bay_number: number;
  started_at: string | null;
  events: Array<{ rule_key: string; tag_label: string; tag_emoji: string; metric_value: number | null; metric_unit: string | null }>;
}

export function LeagueHighlights() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [bays, setBays] = useState<Bay[]>([]);
  const [pilotBay, setPilotBay] = useState<number | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [rows, setRows] = useState<HighlightRow[]>([]);
  const [runningTagger, setRunningTagger] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoTitle, setVideoTitle] = useState<string>("");

  const load = async () => {
    setLoading(true);
    const [{ data: bayRows }, { data: cfg }] = await Promise.all([
      supabase.from("bays").select("id, bay_number, name").order("bay_number"),
      supabase.from("system_settings").select("highlight_recording_pilot_bay, highlight_recording_enabled").eq("id", "global").maybeSingle(),
    ]);
    setBays(bayRows ?? []);
    setPilotBay(cfg?.highlight_recording_pilot_bay ?? null);
    setEnabled(!!cfg?.highlight_recording_enabled);

    // Recent tagged holes (last 14 days)
    const since = new Date(Date.now() - 14 * 86400_000).toISOString();
    const { data: holes } = await supabase
      .from("recording_holes")
      .select(`id, hole_number, par, score, storage_path, recording_session_id,
               recording_sessions!inner(player_name, tournament_name, bay_number, started_at),
               highlight_events(rule_key, tag_label, tag_emoji, metric_value, metric_unit)`)
      .eq("status", "uploaded")
      .eq("pre_existing", false)
      .gte("updated_at", since)
      .order("updated_at", { ascending: false })
      .limit(200);

    const mapped: HighlightRow[] = (holes ?? [])
      .map((h: any) => ({
        hole_id: h.id,
        session_id: h.recording_session_id,
        hole_number: h.hole_number,
        par: h.par,
        score: h.score,
        storage_path: h.storage_path,
        player_name: h.recording_sessions?.player_name ?? null,
        tournament_name: h.recording_sessions?.tournament_name ?? null,
        bay_number: h.recording_sessions?.bay_number,
        started_at: h.recording_sessions?.started_at ?? null,
        events: h.highlight_events ?? [],
      }))
      // Show rows with tagged highlights OR full-session uploads (hole_number = 0)
      // so raw recordings never stay invisible when the poller couldn't reach SGT.
      .filter((r) => r.events.length > 0 || r.hole_number === 0);
    setRows(mapped);
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const saveConfig = async (nextEnabled: boolean, nextBay: number | null) => {
    const { error } = await supabase.from("system_settings").update({
      highlight_recording_enabled: nextEnabled,
      highlight_recording_pilot_bay: nextBay,
    }).eq("id", "global");
    if (error) toast({ title: "Save failed", description: error.message, variant: "destructive" });
    else toast({ title: "Saved", description: `Recording ${nextEnabled ? "enabled" : "disabled"}${nextBay ? ` on Bay ${nextBay}` : ""}.` });
  };

  const runTagger = async () => {
    setRunningTagger(true);
    const { data, error } = await supabase.functions.invoke("sgt-highlight-tagger", { body: {} });
    setRunningTagger(false);
    if (error) toast({ title: "Tagger failed", description: error.message, variant: "destructive" });
    else { toast({ title: "Tagger complete", description: `Processed ${data?.holes_processed} holes, created ${data?.events_created} tags.` }); void load(); }
  };

  const openClip = async (row: HighlightRow) => {
    if (!row.storage_path) return;
    const { data, error } = await supabase.functions.invoke("league-highlights-signed-url", { body: { path: row.storage_path, expires_in: 3600 } });
    if (error || !data?.signed_url) return toast({ title: "Cannot load clip", description: error?.message ?? "no url", variant: "destructive" });
    setVideoUrl(data.signed_url);
    setVideoTitle(`${row.player_name ?? "Player"} — Hole ${row.hole_number}`);
  };

  const approve = async (row: HighlightRow) => {
    if (!row.storage_path) return;
    const { data: user } = await supabase.auth.getUser();
    const { error } = await supabase.from("highlight_clips").insert({
      recording_hole_id: row.hole_id,
      storage_path: row.storage_path,
      player_name: row.player_name,
      tournament_name: row.tournament_name,
      hole_number: row.hole_number,
      tags: row.events.map((e) => e.rule_key),
      approved_by: user.user?.id ?? null,
    });
    if (error) toast({ title: "Approve failed", description: error.message, variant: "destructive" });
    else toast({ title: "Saved to Approved Clips" });
  };

  const dismiss = async (row: HighlightRow) => {
    const { error } = await supabase.from("highlight_events").delete().eq("recording_hole_id", row.hole_id);
    if (error) toast({ title: "Dismiss failed", description: error.message, variant: "destructive" });
    else { toast({ title: "Dismissed" }); setRows((r) => r.filter((x) => x.hole_id !== row.hole_id)); }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle>Recording Configuration</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Switch id="rec-enabled" checked={enabled} onCheckedChange={(v) => { setEnabled(v); void saveConfig(v, pilotBay); }} />
              <Label htmlFor="rec-enabled">Enable League highlight recording</Label>
            </div>
            <div className="flex items-center gap-2">
              <Label>Pilot Bay:</Label>
              <Select value={pilotBay?.toString() ?? "none"} onValueChange={(v) => { const n = v === "none" ? null : parseInt(v); setPilotBay(n); void saveConfig(enabled, n); }}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— None —</SelectItem>
                  {bays.map((b) => <SelectItem key={b.id} value={b.bay_number.toString()}>Bay {b.bay_number}{b.name ? ` (${b.name})` : ""}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            The pilot bay must have OBS Studio + obs-websocket installed. See <code>docs/LEAGUE_HIGHLIGHTS_SETUP.md</code>.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Review Queue ({rows.length})</CardTitle>
          <Button size="sm" variant="outline" onClick={runTagger} disabled={runningTagger}>
            {runningTagger ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Re-scan holes
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? <div className="flex justify-center py-8"><Loader2 className="animate-spin" /></div> :
           rows.length === 0 ? <p className="text-muted-foreground text-sm py-8 text-center">No tagged highlights yet. Recordings appear here after the tagger scans them (auto-runs hourly).</p> :
           <div className="space-y-3">
             {rows.map((row) => (
               <div key={row.hole_id} className="border rounded-lg p-4 flex items-center gap-4">
                 <div className="flex-1 min-w-0">
                   <div className="flex items-center gap-2 flex-wrap">
                     <span className="font-semibold">{row.player_name ?? "Unknown"}</span>
                     <span className="text-muted-foreground text-sm">· Hole {row.hole_number} · Par {row.par ?? "?"} · Score {row.score ?? "?"}</span>
                     <span className="text-muted-foreground text-xs">· Bay {row.bay_number} · {row.tournament_name}</span>
                   </div>
                   <div className="flex gap-2 mt-2 flex-wrap">
                     {row.events.map((e, i) => (
                       <Badge key={i} variant="secondary">{e.tag_emoji} {e.tag_label}{e.metric_value != null ? ` (${e.metric_value.toFixed(1)}${e.metric_unit ?? ""})` : ""}</Badge>
                     ))}
                   </div>
                 </div>
                 <Button size="sm" variant="outline" onClick={() => openClip(row)}><Play className="h-4 w-4" /></Button>
                 <Button size="sm" onClick={() => approve(row)}>Approve</Button>
                 <Button size="sm" variant="ghost" onClick={() => dismiss(row)}><Trash2 className="h-4 w-4" /></Button>
               </div>
             ))}
           </div>}
        </CardContent>
      </Card>

      {videoUrl && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={() => setVideoUrl(null)}>
          <div className="bg-background rounded-lg max-w-4xl w-full" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-2"><Video className="h-4 w-4" /><span className="font-semibold">{videoTitle}</span></div>
              <Button size="sm" variant="ghost" onClick={() => setVideoUrl(null)}>Close</Button>
            </div>
            <video src={videoUrl} controls autoPlay className="w-full max-h-[70vh]" />
          </div>
        </div>
      )}
    </div>
  );
}
