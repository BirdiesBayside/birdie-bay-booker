import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Download, Loader2, Play, RefreshCw, Trash2, Video } from "lucide-react";

interface Bay { id: string; bay_number: number; name: string | null }
interface HoleChapter {
  hole_id: string;
  hole_number: number;
  par: number | null;
  score: number | null;
  offset_seconds: number | null; // seconds from session start
  events: Array<{ rule_key: string; tag_label: string; tag_emoji: string }>;
}
interface SessionRow {
  session_id: string;
  storage_path: string | null;
  player_name: string | null;
  tournament_name: string | null;
  bay_number: number;
  started_at: string | null;
  chapters: HoleChapter[];
  has_highlights: boolean;
}

function fmtOffset(secs: number | null): string {
  if (secs == null || !Number.isFinite(secs) || secs < 0) return "--:--";
  const s = Math.floor(secs);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}` : `${m}:${String(r).padStart(2, "0")}`;
}

function scoreLabel(par: number | null, score: number | null): string {
  if (par == null || score == null) return "";
  const diff = score - par;
  if (par === 3 && score === 1) return "HIO";
  if (diff === -3) return "Albatross";
  if (diff === -2) return "Eagle";
  if (diff === -1) return "Birdie";
  if (diff === 0) return "Par";
  if (diff === 1) return "Bogey";
  return diff > 0 ? `+${diff}` : String(diff);
}

export function LeagueHighlights() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [bays, setBays] = useState<Bay[]>([]);
  const [pilotBay, setPilotBay] = useState<number | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [runningTagger, setRunningTagger] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [activeSession, setActiveSession] = useState<SessionRow | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const load = async () => {
    setLoading(true);
    const [{ data: bayRows }, { data: cfg }] = await Promise.all([
      supabase.from("bays").select("id, bay_number, name").order("bay_number"),
      supabase.from("system_settings").select("highlight_recording_pilot_bay, highlight_recording_enabled").eq("id", "global").maybeSingle(),
    ]);
    setBays(bayRows ?? []);
    setPilotBay(cfg?.highlight_recording_pilot_bay ?? null);
    setEnabled(!!cfg?.highlight_recording_enabled);

    const since = new Date(Date.now() - 14 * 86400_000).toISOString();
    // Full-session rows (hole_number = 0) hold the storage_path for the raw video.
    const { data: sessRows } = await supabase
      .from("recording_holes")
      .select(`id, hole_number, storage_path, recording_session_id,
               recording_sessions!inner(player_name, tournament_name, bay_number, started_at)`)
      .eq("status", "uploaded")
      .eq("hole_number", 0)
      .gte("updated_at", since)
      .order("updated_at", { ascending: false })
      .limit(200);

    const sessionIds = (sessRows ?? []).map((r: any) => r.recording_session_id);
    // Per-hole chapter data (all holes for those sessions)
    const { data: holeRows } = sessionIds.length
      ? await supabase
          .from("recording_holes")
          .select(`id, hole_number, par, score, hole_completed_at, recording_session_id, pre_existing,
                   highlight_events(rule_key, tag_label, tag_emoji)`)
          .in("recording_session_id", sessionIds)
          .neq("hole_number", 0)
          .eq("pre_existing", false)
      : { data: [] as any[] };

    const chaptersBySession = new Map<string, HoleChapter[]>();
    for (const h of holeRows ?? []) {
      const startedAt = (sessRows ?? []).find((s: any) => s.recording_session_id === h.recording_session_id)?.recording_sessions?.started_at;
      const startMs = startedAt ? new Date(startedAt).getTime() : null;
      const completedMs = h.hole_completed_at ? new Date(h.hole_completed_at).getTime() : null;
      const offset = startMs && completedMs ? Math.max(0, (completedMs - startMs) / 1000) : null;
      const chapter: HoleChapter = {
        hole_id: h.id,
        hole_number: h.hole_number,
        par: h.par,
        score: h.score,
        offset_seconds: offset,
        events: (h.highlight_events ?? []) as any,
      };
      const list = chaptersBySession.get(h.recording_session_id) ?? [];
      list.push(chapter);
      chaptersBySession.set(h.recording_session_id, list);
    }

    const mapped: SessionRow[] = (sessRows ?? []).map((r: any) => {
      const chapters = (chaptersBySession.get(r.recording_session_id) ?? []).sort((a, b) => a.hole_number - b.hole_number);
      return {
        session_id: r.recording_session_id,
        storage_path: r.storage_path,
        player_name: r.recording_sessions?.player_name ?? null,
        tournament_name: r.recording_sessions?.tournament_name ?? null,
        bay_number: r.recording_sessions?.bay_number,
        started_at: r.recording_sessions?.started_at ?? null,
        chapters,
        has_highlights: chapters.some((c) => c.events.length > 0),
      };
    });
    setSessions(mapped);
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

  const openSession = async (sess: SessionRow) => {
    if (!sess.storage_path) return;
    const { data, error } = await supabase.functions.invoke("league-highlights-signed-url", { body: { path: sess.storage_path, expires_in: 3600 } });
    if (error || !data?.signed_url) return toast({ title: "Cannot load clip", description: error?.message ?? "no url", variant: "destructive" });
    setActiveSession(sess);
    setVideoUrl(data.signed_url);
  };

  const seekTo = (secs: number) => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = secs;
    void videoRef.current.play().catch(() => {});
  };

  const downloadSession = async (sess: SessionRow) => {
    if (!sess.storage_path) return;
    const { data, error } = await supabase.functions.invoke("league-highlights-signed-url", { body: { path: sess.storage_path, expires_in: 3600 } });
    if (error || !data?.signed_url) return toast({ title: "Download failed", description: error?.message ?? "no url", variant: "destructive" });
    const filename = `${sess.player_name ?? "session"}-bay${sess.bay_number}-${(sess.started_at ?? "").slice(0, 10)}.mkv`.replace(/\s+/g, "_");
    const a = document.createElement("a");
    a.href = data.signed_url;
    a.download = filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const dismissSession = async (sess: SessionRow) => {
    const holeIds = [sess.session_id]; // delete session row + child chapters
    if (!confirm(`Dismiss recording for ${sess.player_name ?? "player"}? This removes it from the queue.`)) return;
    const { error } = await supabase.from("recording_sessions").delete().eq("id", sess.session_id);
    if (error) toast({ title: "Dismiss failed", description: error.message, variant: "destructive" });
    else { toast({ title: "Dismissed" }); void load(); void holeIds; }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle>Recording Configuration</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4 flex-wrap">
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
            Raw MKVs are kept intact. Per-hole timestamps come from the SGT scorecard poller (every 1 min) and are shown as chapter markers you can jump to. Highlights auto-tag birdies, eagles, albatrosses, and holes-in-one.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Review Queue ({sessions.length})</CardTitle>
          <Button size="sm" variant="outline" onClick={runTagger} disabled={runningTagger}>
            {runningTagger ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Re-scan holes
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? <div className="flex justify-center py-8"><Loader2 className="animate-spin" /></div> :
           sessions.length === 0 ? <p className="text-muted-foreground text-sm py-8 text-center">No recorded sessions yet.</p> :
           <div className="space-y-3">
             {sessions.map((sess) => {
               const highlights = sess.chapters.filter((c) => c.events.length > 0);
               return (
                 <div key={sess.session_id} className="border rounded-lg p-4">
                   <div className="flex items-start gap-4">
                     <div className="flex-1 min-w-0">
                       <div className="flex items-center gap-2 flex-wrap">
                         <span className="font-semibold">{sess.player_name ?? "Unknown"}</span>
                         <span className="text-muted-foreground text-sm">· Bay {sess.bay_number} · {sess.tournament_name}</span>
                         {sess.started_at && <span className="text-muted-foreground text-xs">· {new Date(sess.started_at).toLocaleString()}</span>}
                       </div>
                       <div className="flex gap-2 mt-2 flex-wrap">
                         {sess.chapters.length === 0 && (
                           <Badge variant="outline">Raw recording — no SGT scorecard yet</Badge>
                         )}
                         {highlights.length > 0 && (
                           <Badge variant="secondary">
                             {highlights.map((h) => `${h.events[0].tag_emoji} H${h.hole_number}`).join(" · ")}
                           </Badge>
                         )}
                         {sess.chapters.length > 0 && highlights.length === 0 && (
                           <Badge variant="outline">{sess.chapters.length} holes tracked · no highlights</Badge>
                         )}
                       </div>
                     </div>
                     <Button size="sm" variant="outline" onClick={() => openSession(sess)}><Play className="h-4 w-4 mr-1" />Open</Button>
                     <Button size="sm" variant="ghost" onClick={() => dismissSession(sess)}><Trash2 className="h-4 w-4" /></Button>
                   </div>
                 </div>
               );
             })}
           </div>}
        </CardContent>
      </Card>

      {videoUrl && activeSession && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={() => { setVideoUrl(null); setActiveSession(null); }}>
          <div className="bg-background rounded-lg max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 flex items-center justify-between border-b">
              <div className="flex items-center gap-2"><Video className="h-4 w-4" /><span className="font-semibold">{activeSession.player_name} — {activeSession.tournament_name}</span></div>
              <Button size="sm" variant="ghost" onClick={() => { setVideoUrl(null); setActiveSession(null); }}>Close</Button>
            </div>
            <div className="flex flex-col md:flex-row min-h-0 flex-1">
              <div className="flex-1 bg-black flex items-center justify-center">
                <video ref={videoRef} src={videoUrl} controls autoPlay className="max-w-full max-h-[70vh]" />
              </div>
              <div className="w-full md:w-80 border-l overflow-y-auto p-3 space-y-1">
                <div className="text-xs font-semibold text-muted-foreground uppercase mb-2">Chapters</div>
                {activeSession.chapters.length === 0 && <div className="text-sm text-muted-foreground">No hole timestamps yet.</div>}
                {activeSession.chapters.map((c) => {
                  const label = scoreLabel(c.par, c.score);
                  const highlight = c.events[0];
                  return (
                    <button
                      key={c.hole_id}
                      onClick={() => c.offset_seconds != null && seekTo(c.offset_seconds)}
                      disabled={c.offset_seconds == null}
                      className="w-full text-left p-2 rounded hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      <span className="font-mono text-xs w-16 text-muted-foreground">{fmtOffset(c.offset_seconds)}</span>
                      <span className="font-semibold w-14">Hole {c.hole_number}</span>
                      <span className="text-xs text-muted-foreground w-24">Par {c.par ?? "?"} · {c.score ?? "?"} ({label})</span>
                      {highlight && <Badge variant="secondary" className="ml-auto">{highlight.tag_emoji} {highlight.tag_label}</Badge>}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
