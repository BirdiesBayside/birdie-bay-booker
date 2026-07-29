import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Download, FolderOpen, Loader2, Play, Trash2 } from "lucide-react";
import { formatBrisbane } from "@/lib/brisbane-time";
import ManualStreamUpload from "@/components/admin/ManualStreamUpload";

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

export function ScorecardGrid({ scorecard }: { scorecard: Scorecard }) {
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
  const [streamBusyIds, setStreamBusyIds] = useState<Set<string>>(new Set());
  const autoKickedRef = useRef<Set<string>>(new Set());


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
    // Session-driven: a recording is listable once it either has a Cloudflare
    // stream_uid (direct tus upload from the bay) or a hole-0 storage file
    // (legacy storage-then-copy path). Keying off recording_holes alone hid
    // every tus upload, because those never get a storage_path.
    const { data: sessRows } = await supabase
      .from("recording_sessions")
      .select("id, player_name, tournament_name, bay_number, started_at, stream_uid, stream_status, stream_error, round_number, trigger_source, scorecard")
      .gte("started_at", since)
      .or("stream_uid.not.is.null,status.eq.uploaded")
      .neq("status", "purged")
      .order("started_at", { ascending: false })
      .limit(200);

    const ids = (sessRows ?? []).map((s: any) => s.id);
    const pathBySession = new Map<string, string>();
    if (ids.length) {
      const { data: holeRows } = await supabase
        .from("recording_holes")
        .select("recording_session_id, storage_path")
        .eq("hole_number", 0)
        .in("recording_session_id", ids);
      for (const h of holeRows ?? []) {
        if (h.storage_path) pathBySession.set(h.recording_session_id, h.storage_path);
      }
    }

    const mapped: SessionRow[] = (sessRows ?? []).map((r: any) => ({
      session_id: r.id,
      storage_path: pathBySession.get(r.id) ?? null,
      stream_uid: r.stream_uid ?? null,
      stream_status: r.stream_status ?? null,
      stream_error: r.stream_error ?? null,
      player_name: r.player_name ?? null,
      tournament_name: r.tournament_name ?? null,
      bay_number: r.bay_number,
      started_at: r.started_at ?? null,
      round_number: r.round_number ?? null,
      trigger_source: r.trigger_source ?? null,
      scorecard: (r.scorecard as Scorecard | null) ?? null,
    }));
    setSessions(mapped);
    if (!silent) setLoading(false);
  };

  useEffect(() => {
    void load();
    const interval = setInterval(() => { void load(true); }, 10000);
    return () => clearInterval(interval);
  }, []);


  useEffect(() => {
    for (const sess of sessions) {
      if (sess.stream_status === "ready") continue;
      if (["failed", "status_failed", "error"].includes(sess.stream_status ?? "")) continue;
      // No uid and no file = nothing to kick.
      if (!sess.stream_uid && !sess.storage_path) continue;
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
      // Still encoding — allow another status refresh shortly.
      setTimeout(() => autoKickedRef.current.delete(sess.session_id), 30000);
      if (silent) return null;
      toast({ title: "Stream still processing", description: "The video is still being prepared. This page will update automatically when it is ready." });
      return null;

    } finally {
      setStreamBusyIds((prev) => { const next = new Set(prev); next.delete(sess.session_id); return next; });
    }
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
    if (!confirm(`Delete recording for ${sess.player_name ?? "player"}? This removes it from Cloudflare Stream, storage and the queue.`)) return;
    const { data, error } = await supabase.functions.invoke("delete-recording-session", { body: { session_id: sess.session_id } });
    if (error || !data?.ok) {
      const description = await getFunctionErrorMessage(error, data);
      toast({ title: "Delete failed", description: description || "Unknown error", variant: "destructive" });
    } else {
      const extra = data.stream_errors?.length ? ` (${data.stream_errors.length} CF warnings)` : "";
      toast({ title: "Deleted", description: `Removed from Cloudflare + storage${extra}` });
      void load();
    }
  };

  

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
      <ManualStreamUpload />
      <Card>
        <CardHeader><CardTitle>Recording Configuration</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <Switch id="rec-enabled" checked={enabled} onCheckedChange={(v) => { setEnabled(v); void saveConfig(v); }} />
              <Label htmlFor="rec-enabled">Enable League highlight recording</Label>
            </div>
            <p className="text-sm text-muted-foreground">Active on all bays with OBS installed</p>
            <div className="flex flex-wrap items-center gap-2">
              <Label className="w-full sm:w-auto">Auto-delete after:</Label>
              <Select value={retentionDays.toString()} onValueChange={(v) => { const n = parseInt(v); setRetentionDays(n); void saveConfig(enabled, n); }}>
                <SelectTrigger className="w-32 min-w-0"><SelectValue /></SelectTrigger>
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
                         {sess.started_at && <span className="text-muted-foreground text-xs">· {formatBrisbane(sess.started_at)}</span>}
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
                        <Button asChild size="sm" variant="outline">
                          <Link to={`/admin/highlights/${sess.session_id}/review`}><Play className="h-4 w-4 mr-1" />Open</Link>
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

    </div>
  );
}
