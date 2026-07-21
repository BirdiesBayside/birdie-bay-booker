import { useEffect, useMemo, useRef, useState } from "react";
import Hls from "hls.js";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Download, Loader2, Play, RefreshCw, Scissors, Trash2, Video, X } from "lucide-react";

interface Bay { id: string; bay_number: number; name: string | null }
interface HoleChapter {
  hole_id: string;
  hole_number: number;
  par: number | null;
  score: number | null;
  offset_seconds: number | null;
  events: Array<{ rule_key: string; tag_label: string; tag_emoji: string }>;
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

async function getFunctionErrorMessage(error: any, data?: any): Promise<string> {
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
  } catch {
    // Try text below.
  }

  try {
    const body = typeof response.clone === "function" ? response.clone() : response;
    if (typeof body.text === "function") {
      const text = await body.text();
      return text || fallback;
    }
  } catch {
    // Fall through to generic invoke error.
  }

  return fallback;
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

    // Clean up previous Hls instance.
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      // Safari / native HLS support.
      video.src = videoUrl;
    } else if (Hls.isSupported()) {
      const hls = new Hls({ maxBufferLength: 60, maxMaxBufferLength: 120 });
      hls.loadSource(videoUrl);
      hls.attachMedia(video);
      hlsRef.current = hls;
    }

    return () => {
      hlsRef.current?.destroy();
      hlsRef.current = null;
    };
  }, [videoUrl]);

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
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
                recording_sessions!inner(id, player_name, tournament_name, bay_number, started_at, stream_uid, stream_status, stream_error)`)
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
        stream_uid: r.recording_sessions?.stream_uid ?? null,
        stream_status: r.recording_sessions?.stream_status ?? null,
        stream_error: r.recording_sessions?.stream_error ?? null,
        player_name: r.recording_sessions?.player_name ?? null,
        tournament_name: r.recording_sessions?.tournament_name ?? null,
        bay_number: r.recording_sessions?.bay_number,
        started_at: r.recording_sessions?.started_at ?? null,
        chapters,
        has_highlights: chapters.some((c) => c.events.length > 0),
      };
    });
    setSessions(mapped);
    if (!silent) setLoading(false);
  };

  useEffect(() => {
    void load();
    // Live poll stream status / new sessions every 10s without flashing the UI.
    const interval = setInterval(() => { void load(true); }, 10000);
    return () => clearInterval(interval);
  }, []);

  // Auto-kick Cloudflare Stream ingest for any session that has an uploaded MKV
  // but no stream yet. Runs silently so highlights are ready to edit on open.
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
      // Reflect in-progress status immediately so the badge updates.
      setSessions((prev) => prev.map((s) => s.session_id === sess.session_id ? { ...s, stream_uid: data.stream_uid, stream_status: data.status ?? "inprogress", stream_error: null } : s));
      if (silent) return null; // Background kickoff — poller will pick it up.
      toast({ title: "Stream still processing", description: "The video is still being prepared. This page will update automatically when it is ready.", variant: "default" });
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

  const seekTo = (secs: number) => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = secs;
    void videoRef.current.play().catch(() => {});
  };

  const setClipStart = () => {
    if (!videoRef.current) return;
    setClipStartState(videoRef.current.currentTime);
  };

  const setClipEnd = () => {
    if (!videoRef.current) return;
    setClipEndState(videoRef.current.currentTime);
  };

  const clearClip = () => { setClipStartState(null); setClipEndState(null); };

  const downloadClip = async () => {
    if (!activeSession || clipStart == null || clipEnd == null || clipStart >= clipEnd) return;
    setClipLoading(true);
    const { data, error } = await supabase.functions.invoke("stream-clip", {
      body: { recording_session_id: activeSession.session_id, start_seconds: clipStart, end_seconds: clipEnd },
    });
    setClipLoading(false);
    if (error || !data?.download_url) {
      const description = await getFunctionErrorMessage(error, data);
      toast({ title: "Clip failed", description: description || "no download url", variant: "destructive" });
      return;
    }
    const filename = `${activeSession.player_name ?? "clip"}-bay${activeSession.bay_number}-${(activeSession.started_at ?? "").slice(0, 10)}-${fmtOffset(clipStart)}-${fmtOffset(clipEnd)}.mp4`.replace(/\s+/g, "_").replace(/:/g, "-");
    const a = document.createElement("a");
    a.href = data.download_url;
    a.download = filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    toast({ title: "Clip ready", description: `Downloaded ${fmtOffset(clipEnd - clipStart)} clip.` });
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

  const closeModal = () => {
    setVideoUrl(null);
    setActiveSession(null);
    clearClip();
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
               const streamReady = sess.stream_status === "ready";
                const streamFailed = ["failed", "status_failed", "error"].includes(sess.stream_status ?? "");
               return (
                 <div key={sess.session_id} className="border rounded-lg p-4">
                   <div className="flex flex-col md:flex-row md:items-start gap-3 md:gap-4">
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
              <div className="flex items-center gap-2"><Video className="h-4 w-4" /><span className="font-semibold">{activeSession.player_name} — {activeSession.tournament_name}</span></div>
              <Button size="sm" variant="ghost" onClick={closeModal}>Close</Button>
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
                        <Button size="sm" onClick={downloadClip} disabled={clipLoading}>
                          {clipLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Download className="h-4 w-4 mr-1" />}
                          Download clip ({fmtOffset(clipEnd - clipStart)})
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
