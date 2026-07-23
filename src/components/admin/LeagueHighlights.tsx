import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import Hls from "hls.js";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Download, FolderOpen, Loader2, Play, Scissors, Trash2, Video, X } from "lucide-react";

interface Bay { id: string; bay_number: number; name: string | null }

export interface Scorecard {
  player_name?: string | null;
  hcp_index?: number | null;
  round?: number | null;
  course_name?: string | null;
  total_gross?: number | null;
  total_net?: number | null;
  to_par_gross?: number | null;
  to_par_net?: number | null;
  in_gross?: number | null;
  out_gross?: number | null;
  hole_data?: Record<string, number | string> | null;
  fetched_at?: string | null;
}

interface SessionRow {
  session_id: string;
  storage_path: string | null;
  stream_uid: string | null;
  stream_status: string | null;
  stream_error: string | null;
  player_name: string | null;
  tournament_name: string | null;
  bay_number: number;
  started_at: string | null;
  round_number: number | null;
  trigger_source: string | null;
  scorecard: Scorecard | null;
}

export function fmtOffset(secs: number | null): string {
  if (secs == null || !Number.isFinite(secs) || secs < 0) return "--:--";
  const s = Math.floor(secs);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}` : `${m}:${String(r).padStart(2, "0")}`;
}

function scoreClass(par: number | null | undefined, score: number | null | undefined): string {
  if (par == null || score == null || score === 0) return "bg-muted text-muted-foreground";
  const diff = score - par;
  if (par === 3 && score === 1) return "bg-purple-600 text-white font-bold";
  if (diff <= -3) return "bg-purple-500 text-white font-bold";
  if (diff === -2) return "bg-orange-500 text-white font-bold";
  if (diff === -1) return "bg-red-500 text-white font-semibold";
  if (diff === 0) return "bg-secondary text-foreground";
  if (diff === 1) return "bg-blue-100 text-blue-900";
  return "bg-blue-200 text-blue-950";
}

function fmtToPar(n: number | null | undefined): string {
  if (n == null) return "";
  if (n === 0) return "E";
  return n > 0 ? `+${n}` : String(n);
}

export async function getFunctionErrorMessage(error: any, data?: any): Promise<string> {
  if (data?.error) return String(data.error);
  const fallback = error?.message ?? "unknown";
  const response = error?.context;
  if (!response) return fallback;
  try {
    const body = typeof response.clone === "function" ? response.clone() : response;
    if (typeof body.json === "function") {
      const json = await body.json();
      return json?.error || json?.message || json?.cf_body || fallback;
    }
  } catch { /* fall through */ }
  try {
    const body = typeof response.clone === "function" ? response.clone() : response;
    if (typeof body.text === "function") {
      const text = await body.text();
      return text || fallback;
    }
  } catch { /* fall through */ }
  return fallback;
}

function ScorecardGrid({ scorecard }: { scorecard: Scorecard }) {
  const holes = Array.from({ length: 18 }, (_, i) => i + 1);
  const hd = scorecard.hole_data ?? {};
  const getPar = (h: number) => (hd[`h${h}_Par`] as number) ?? null;
  const getScore = (h: number) => (hd[`hole${h}_gross`] as number) ?? null;

  const renderNine = (start: number, end: number, label: string) => {
    const range = holes.slice(start, end);
    const parSum = range.reduce((s, h) => s + (getPar(h) ?? 0), 0);
    const scoreSum = range.reduce((s, h) => s + (getScore(h) ?? 0), 0);
    return (
      <div className="mb-3">
        <div className="grid gap-1 text-[10px] font-medium mb-1" style={{ gridTemplateColumns: `40px repeat(9, 1fr) 40px` }}>
          <div className="text-muted-foreground">Hole</div>
          {range.map((h) => <div key={h} className="text-center text-muted-foreground">{h}</div>)}
          <div className="text-center text-muted-foreground">{label}</div>
        </div>
        <div className="grid gap-1 text-[10px] mb-1" style={{ gridTemplateColumns: `40px repeat(9, 1fr) 40px` }}>
          <div className="text-muted-foreground">Par</div>
          {range.map((h) => <div key={h} className="text-center text-muted-foreground">{getPar(h) ?? "-"}</div>)}
          <div className="text-center text-muted-foreground font-medium">{parSum || "-"}</div>
        </div>
        <div className="grid gap-1 text-xs" style={{ gridTemplateColumns: `40px repeat(9, 1fr) 40px` }}>
          <div className="font-medium">Score</div>
          {range.map((h) => (
            <div key={h} className={cn("text-center py-1 rounded font-medium", scoreClass(getPar(h), getScore(h)))}>
              {getScore(h) ?? "-"}
            </div>
          ))}
          <div className="text-center py-1 font-bold">{scoreSum || "-"}</div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3 text-xs mb-2 pb-2 border-b">
        <div><span className="text-muted-foreground">Gross:</span> <span className="font-semibold">{scorecard.total_gross ?? "-"}</span> <span className="text-muted-foreground">({fmtToPar(scorecard.to_par_gross)})</span></div>
        <div><span className="text-muted-foreground">Net:</span> <span className="font-semibold">{scorecard.total_net ?? "-"}</span> <span className="text-muted-foreground">({fmtToPar(scorecard.to_par_net)})</span></div>
        {scorecard.hcp_index != null && <div><span className="text-muted-foreground">HCP:</span> <span className="font-semibold">{scorecard.hcp_index}</span></div>}
        {scorecard.course_name && <div className="text-muted-foreground truncate">{scorecard.course_name}</div>}
      </div>
      {renderNine(0, 9, "OUT")}
      {renderNine(9, 18, "IN")}
      <div className="flex flex-wrap gap-2 text-[10px] pt-1">
        <div className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-purple-600" /> HIO/Alb</div>
        <div className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-orange-500" /> Eagle</div>
        <div className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-500" /> Birdie</div>
        <div className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-secondary border" /> Par</div>
        <div className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-blue-100" /> Bogey+</div>
      </div>
    </div>
  );
}

export function LeagueHighlights() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [_bays, setBays] = useState<Bay[]>([]);
  const [enabled, setEnabled] = useState(false);
  const [retentionDays, setRetentionDays] = useState<number>(14);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [activeSession, setActiveSession] = useState<SessionRow | null>(null);
  const [streamBusyIds, setStreamBusyIds] = useState<Set<string>>(new Set());
  const autoKickedRef = useRef<Set<string>>(new Set());
  const [clipStart, setClipStartState] = useState<number | null>(null);
  const [clipEnd, setClipEndState] = useState<number | null>(null);
  const [clipLoading, setClipLoading] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoUrl) return;
    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = videoUrl;
    } else if (Hls.isSupported()) {
      const hls = new Hls({ maxBufferLength: 60, maxMaxBufferLength: 120 });
      hls.loadSource(videoUrl);
      hls.attachMedia(video);
      hlsRef.current = hls;
    }
    return () => { hlsRef.current?.destroy(); hlsRef.current = null; };
  }, [videoUrl]);

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    const [{ data: bayRows }, { data: cfg }] = await Promise.all([
      supabase.from("bays").select("id, bay_number, name").order("bay_number"),
      supabase.from("system_settings").select("highlight_recording_enabled, highlight_retention_days").eq("id", "global").maybeSingle(),
    ]);
    setBays(bayRows ?? []);
    setEnabled(!!cfg?.highlight_recording_enabled);
    setRetentionDays(cfg?.highlight_retention_days ?? 14);

    const since = new Date(Date.now() - 14 * 86400_000).toISOString();
    // Full-session rows (hole_number = 0) hold the storage_path for the raw video.
    const { data: sessRows } = await supabase
      .from("recording_holes")
      .select(`storage_path, recording_session_id,
               recording_sessions!inner(id, player_name, tournament_name, bay_number, started_at, stream_uid, stream_status, stream_error, round_number, trigger_source, scorecard)`)
      .eq("status", "uploaded")
      .eq("hole_number", 0)
      .gte("updated_at", since)
      .order("updated_at", { ascending: false })
      .limit(200);

    const mapped: SessionRow[] = (sessRows ?? []).map((r: any) => ({
      session_id: r.recording_session_id,
      storage_path: r.storage_path,
      stream_uid: r.recording_sessions?.stream_uid ?? null,
      stream_status: r.recording_sessions?.stream_status ?? null,
      stream_error: r.recording_sessions?.stream_error ?? null,
      player_name: r.recording_sessions?.player_name ?? null,
      tournament_name: r.recording_sessions?.tournament_name ?? null,
      bay_number: r.recording_sessions?.bay_number,
      started_at: r.recording_sessions?.started_at ?? null,
      round_number: r.recording_sessions?.round_number ?? null,
      trigger_source: r.recording_sessions?.trigger_source ?? null,
      scorecard: (r.recording_sessions?.scorecard as Scorecard | null) ?? null,
    }));
    setSessions(mapped);
    if (!silent) setLoading(false);
  };

  useEffect(() => {
    void load();
    const interval = setInterval(() => { void load(true); }, 10000);
    return () => clearInterval(interval);
  }, []);

  // Keep activeSession in sync with fresh scorecard/stream data after each reload.
  useEffect(() => {
    if (!activeSession) return;
    const fresh = sessions.find((s) => s.session_id === activeSession.session_id);
    if (fresh && fresh !== activeSession) setActiveSession(fresh);
  }, [sessions, activeSession]);

  useEffect(() => {
    for (const sess of sessions) {
      if (sess.stream_uid) continue;
      if (sess.stream_status === "failed") continue;
      if (!sess.storage_path) continue;
      if (autoKickedRef.current.has(sess.session_id)) continue;
      autoKickedRef.current.add(sess.session_id);
      void ensureStream(sess, { silent: true });
    }
  }, [sessions]);

  const saveConfig = async (nextEnabled: boolean, nextRetention: number = retentionDays) => {
    const { error } = await supabase.from("system_settings").update({
      highlight_recording_enabled: nextEnabled,
      highlight_retention_days: nextRetention,
    }).eq("id", "global");
    if (error) { toast({ title: "Save failed", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Saved", description: `Recording ${nextEnabled ? "enabled on all bays" : "disabled"} · keep ${nextRetention}d.` });
  };

  const applyRetentionToExisting = async () => {
    const nextIso = new Date(Date.now() + retentionDays * 86400_000).toISOString();
    const { error, count } = await supabase
      .from("recording_sessions")
      .update({ retention_until: nextIso }, { count: "exact" })
      .neq("status", "purged");
    if (error) toast({ title: "Update failed", description: error.message, variant: "destructive" });
    else toast({ title: "Retention updated", description: `${count ?? 0} session${count === 1 ? "" : "s"} now expire in ${retentionDays} days.` });
  };

  const ensureStream = async (sess: SessionRow, opts: { silent?: boolean } = {}): Promise<string | null> => {
    const { silent = false } = opts;
    setStreamBusyIds((prev) => { const next = new Set(prev); next.add(sess.session_id); return next; });
    try {
      const { data, error } = await supabase.functions.invoke("stream-upload", { body: { recording_session_id: sess.session_id } });
      if (error || data?.error || !data?.stream_uid) {
        const description = await getFunctionErrorMessage(error, data);
        if (!silent) toast({ title: "Stream upload failed", description, variant: "destructive" });
        setSessions((prev) => prev.map((s) => s.session_id === sess.session_id ? { ...s, stream_status: data?.status ?? "failed", stream_error: description } : s));
        return null;
      }
      if (data?.playback_url) {
        setSessions((prev) => prev.map((s) => s.session_id === sess.session_id ? { ...s, stream_uid: data.stream_uid, stream_status: "ready", stream_error: null } : s));
        return data.playback_url as string;
      }
      if (["failed", "status_failed", "error"].includes(data.status)) {
        const description = data.error ?? "Cloudflare Stream status check failed.";
        setSessions((prev) => prev.map((s) => s.session_id === sess.session_id ? { ...s, stream_uid: data.stream_uid, stream_status: data.status, stream_error: description } : s));
        if (!silent) toast({ title: "Stream status check failed", description, variant: "destructive" });
        return null;
      }
      setSessions((prev) => prev.map((s) => s.session_id === sess.session_id ? { ...s, stream_uid: data.stream_uid, stream_status: data.status ?? "inprogress", stream_error: null } : s));
      if (silent) return null;
      toast({ title: "Stream still processing", description: "The video is still being prepared. This page will update automatically when it is ready." });
      return null;
    } finally {
      setStreamBusyIds((prev) => { const next = new Set(prev); next.delete(sess.session_id); return next; });
    }
  };

  const openSession = async (sess: SessionRow) => {
    const url = await ensureStream(sess);
    if (!url) return;
    setActiveSession(sess);
    setVideoUrl(url);
  };

  const setClipStart = () => { if (videoRef.current) setClipStartState(videoRef.current.currentTime); };
  const setClipEnd = () => { if (videoRef.current) setClipEndState(videoRef.current.currentTime); };
  const clearClip = () => { setClipStartState(null); setClipEndState(null); };

  const queueClip = async () => {
    if (!activeSession || clipStart == null || clipEnd == null || clipStart >= clipEnd) return;
    setClipLoading(true);
    const start = clipStart;
    const end = clipEnd;
    const { data, error } = await supabase.functions.invoke("stream-clip", {
      body: { recording_session_id: activeSession.session_id, start_seconds: start, end_seconds: end },
    });
    setClipLoading(false);
    if (error || !data?.clip_id) {
      const description = await getFunctionErrorMessage(error, data);
      toast({ title: "Clip failed", description: description || "unknown error", variant: "destructive" });
      return;
    }
    clearClip();
    toast({ title: "Clipped", description: `Queued ${fmtOffset(start)}–${fmtOffset(end)} · check Exports when ready.` });
  };

  const downloadSession = async (sess: SessionRow) => {
    if (!sess.storage_path) return;
    const { data, error } = await supabase.functions.invoke("league-highlights-signed-url", { body: { path: sess.storage_path, expires_in: 3600 } });
    if (error || !data?.signed_url) {
      const description = await getFunctionErrorMessage(error, data);
      return toast({ title: "Download failed", description: description || "no url", variant: "destructive" });
    }
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
    if (!confirm(`Dismiss recording for ${sess.player_name ?? "player"}? This removes it from the queue.`)) return;
    const { error } = await supabase.from("recording_sessions").delete().eq("id", sess.session_id);
    if (error) toast({ title: "Dismiss failed", description: error.message, variant: "destructive" });
    else { toast({ title: "Dismissed" }); void load(); }
  };

  const closeModal = () => { setVideoUrl(null); setActiveSession(null); clearClip(); };

  const countHighlights = (sc: Scorecard | null): number => {
    if (!sc?.hole_data) return 0;
    let n = 0;
    for (let h = 1; h <= 18; h++) {
      const par = sc.hole_data[`h${h}_Par`] as number;
      const score = sc.hole_data[`hole${h}_gross`] as number;
      if (par && score && score - par <= -1) n++;
    }
    return n;
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle>Recording Configuration</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Switch id="rec-enabled" checked={enabled} onCheckedChange={(v) => { setEnabled(v); void saveConfig(v); }} />
              <Label htmlFor="rec-enabled">Enable League highlight recording</Label>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-sm text-muted-foreground">Active on all bays with OBS installed</Label>
            </div>
            <div className="flex items-center gap-2">
              <Label>Auto-delete after:</Label>
              <Select value={retentionDays.toString()} onValueChange={(v) => { const n = parseInt(v); setRetentionDays(n); void saveConfig(enabled, n); }}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">7 days</SelectItem>
                  <SelectItem value="14">14 days</SelectItem>
                  <SelectItem value="21">21 days</SelectItem>
                  <SelectItem value="30">30 days</SelectItem>
                  <SelectItem value="60">60 days</SelectItem>
                </SelectContent>
              </Select>
              <Button size="sm" variant="outline" onClick={applyRetentionToExisting}>Apply to existing</Button>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            Raw MKVs are kept intact. When a round finishes, the full scorecard is pulled once from SGT and shown alongside the video so you can scrub to any hole and clip birdies, eagles or holes-in-one. When retention expires the storage MKV <strong>and</strong> the Cloudflare Stream copy are both deleted by the daily purge job.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Review Queue ({sessions.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? <div className="flex justify-center py-8"><Loader2 className="animate-spin" /></div> :
           sessions.length === 0 ? <p className="text-muted-foreground text-sm py-8 text-center">No recorded sessions yet.</p> :
           <div className="space-y-3">
             {sessions.map((sess) => {
               const streamReady = sess.stream_status === "ready";
               const streamFailed = ["failed", "status_failed", "error"].includes(sess.stream_status ?? "");
               const highlightCount = countHighlights(sess.scorecard);
               const roundLabel = sess.round_number ? ` — Round ${sess.round_number}` : "";
               return (
                 <div key={sess.session_id} className="border rounded-lg p-4">
                   <div className="flex flex-col md:flex-row md:items-start gap-3 md:gap-4">
                     <div className="flex-1 min-w-0">
                       <div className="flex items-center gap-2 flex-wrap">
                         <span className="font-semibold">{sess.player_name ?? "Unknown"}</span>
                         <span className="text-muted-foreground text-sm">· Bay {sess.bay_number} · {sess.tournament_name}{roundLabel}</span>
                         {sess.started_at && <span className="text-muted-foreground text-xs">· {new Date(sess.started_at).toLocaleString()}</span>}
                       </div>
                       <div className="flex gap-2 mt-2 flex-wrap">
                         {sess.trigger_source === "local_comp" && <Badge variant="secondary">Local Comp</Badge>}
                         {sess.scorecard ? (
                           <Badge variant="outline">
                             {sess.scorecard.total_gross ?? "-"} gross ({fmtToPar(sess.scorecard.to_par_gross)})
                             {highlightCount > 0 && ` · ${highlightCount} birdie${highlightCount === 1 ? "" : "s"}+`}
                           </Badge>
                         ) : (
                           <Badge variant="outline">Awaiting scorecard</Badge>
                         )}
                         {streamReady && <Badge variant="outline" className="text-green-600">Stream ready</Badge>}
                         {streamFailed && <Badge variant="destructive">Stream check failed</Badge>}
                         {sess.stream_status && !streamReady && !streamFailed && <Badge variant="outline">Stream: {sess.stream_status}</Badge>}
                       </div>
                       {sess.stream_error && <p className="text-xs text-destructive mt-2 break-words">{sess.stream_error}</p>}
                     </div>
                     <div className="flex gap-2 flex-wrap md:flex-nowrap md:shrink-0">
                       <Button size="sm" variant="outline" onClick={() => openSession(sess)} disabled={streamBusyIds.has(sess.session_id)}>
                         {streamBusyIds.has(sess.session_id) ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Play className="h-4 w-4 mr-1" />}Open
                       </Button>
                       <Button size="sm" variant="outline" onClick={() => downloadSession(sess)} disabled={!sess.storage_path}><Download className="h-4 w-4 mr-1" />Download</Button>
                       <Button asChild size="sm" variant="outline">
                         <Link to={`/admin/highlights/${sess.session_id}/exports`}><FolderOpen className="h-4 w-4 mr-1" />Exports</Link>
                       </Button>
                       <Button size="sm" variant="ghost" onClick={() => dismissSession(sess)}><Trash2 className="h-4 w-4" /></Button>
                     </div>
                   </div>
                 </div>
               );
             })}
           </div>}
        </CardContent>
      </Card>

      {activeSession && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={closeModal}>
          <div className="bg-background rounded-lg max-w-6xl w-full max-h-[95vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 flex items-center justify-between border-b">
              <div className="flex items-center gap-2">
                <Video className="h-4 w-4" />
                <span className="font-semibold">
                  {activeSession.player_name} — {activeSession.tournament_name}{activeSession.round_number ? ` — Round ${activeSession.round_number}` : ""}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button asChild size="sm" variant="outline"><Link to={`/admin/highlights/${activeSession.session_id}/exports`}><FolderOpen className="h-4 w-4 mr-1" />Exports</Link></Button>
                <Button size="sm" variant="ghost" onClick={closeModal}>Close</Button>
              </div>
            </div>
            <div className="flex flex-col md:flex-row min-h-0 flex-1">
              <div className="flex-1 bg-black flex flex-col">
                <div className="flex-1 flex items-center justify-center">
                  {videoUrl ? (
                    <video ref={videoRef} controls autoPlay playsInline className="max-w-full max-h-[60vh] md:max-h-[70vh]" />
                  ) : (
                    <div className="text-white p-8"><Loader2 className="animate-spin inline mr-2" /> Preparing stream…</div>
                  )}
                </div>
                {videoUrl && (
                  <div className="p-3 border-t bg-background space-y-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <Button size="sm" variant={clipStart != null ? "default" : "outline"} onClick={setClipStart}>
                        <Scissors className="h-4 w-4 mr-1" /> Start clip {clipStart != null && <span className="ml-1 font-mono">({fmtOffset(clipStart)})</span>}
                      </Button>
                      <Button size="sm" variant={clipEnd != null ? "default" : "outline"} onClick={setClipEnd}>
                        Stop clip {clipEnd != null && <span className="ml-1 font-mono">({fmtOffset(clipEnd)})</span>}
                      </Button>
                      {(clipStart != null || clipEnd != null) && (
                        <Button size="sm" variant="ghost" onClick={clearClip}><X className="h-4 w-4 mr-1" /> Clear</Button>
                      )}
                      {clipStart != null && clipEnd != null && clipEnd > clipStart && (
                        <Button size="sm" onClick={queueClip} disabled={clipLoading}>
                          {clipLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Scissors className="h-4 w-4 mr-1" />}
                          Clip ({fmtOffset(clipEnd - clipStart)})
                        </Button>
                      )}
                    </div>
                    {clipStart != null && clipEnd != null && (
                      <div className="text-sm text-muted-foreground">
                        Clip: <span className="font-mono">{fmtOffset(clipStart)}</span> → <span className="font-mono">{fmtOffset(clipEnd)}</span> · Duration <span className="font-mono">{fmtOffset(Math.max(0, clipEnd - clipStart))}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="w-full md:w-[420px] border-l overflow-y-auto p-4">
                <div className="text-xs font-semibold text-muted-foreground uppercase mb-3">Scorecard</div>
                {activeSession.scorecard ? (
                  <ScorecardGrid scorecard={activeSession.scorecard} />
                ) : (
                  <div className="text-sm text-muted-foreground">
                    Scorecard will appear here once the round is finished and pulled from SGT.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
