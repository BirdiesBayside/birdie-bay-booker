import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { LeagueLayout } from "@/components/league/LeagueLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Download, Film, Loader2, RefreshCw } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { formatBrisbane } from "@/lib/brisbane-time";
import { fetchVideoFile, saveFileFallback, shareVideoFile, supportsVideoFileShare } from "@/lib/share-video";

interface Clip {
  id: string;
  start_seconds: number;
  end_seconds: number;
  status: string;
  download_url: string | null;
  error: string | null;
  created_at: string;
}
interface Session {
  id: string;
  player_name: string | null;
  tournament_name: string | null;
  bay_number: number;
  started_at: string | null;
  stream_uid: string | null;
  stream_status: string | null;
}

function fmtOffset(secs: number): string {
  const s = Math.max(0, Math.floor(secs));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`
    : `${m}:${String(r).padStart(2, "0")}`;
}

const safe = (s: string) =>
  s.replace(/[^a-z0-9-]+/gi, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").toLowerCase();

export default function LeagueHighlightExports() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { user, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [clips, setClips] = useState<Clip[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [readyFiles, setReadyFiles] = useState<Record<string, File>>({});
  const canSaveToPhotos = supportsVideoFileShare();

  useEffect(() => {
    if (!authLoading && !user) navigate("/");
  }, [user, authLoading, navigate]);

  const load = async (silent = false) => {
    if (!sessionId) return;
    if (!silent) setLoading(true);
    const [{ data: sess }, { data: clipRows }] = await Promise.all([
      supabase
        .from("recording_sessions")
        .select("id, player_name, tournament_name, bay_number, started_at, stream_uid, stream_status, bookings!inner(user_id)")
        .eq("id", sessionId)
        .eq("bookings.user_id", user!.id)
        .maybeSingle(),
      supabase
        .from("recording_clips")
        .select("id, start_seconds, end_seconds, status, download_url, error, created_at")
        .eq("recording_session_id", sessionId)
        .order("created_at", { ascending: false }),
    ]);
    setSession(sess ?? null);
    setClips((clipRows ?? []) as Clip[]);
    if (!silent) setLoading(false);
  };

  useEffect(() => {
    if (!user) return;
    void load();
    const t = setInterval(() => void load(true), 5000);
    return () => clearInterval(t);
  }, [sessionId, user]);

  const filenameFor = (clip: Clip) => {
    const player = safe(session?.player_name ?? "clip");
    const date = (session?.started_at ?? "").slice(0, 10);
    const bay = session?.bay_number != null ? `bay${session.bay_number}` : "bay";
    return `${player}-${bay}-${date}-${fmtOffset(clip.start_seconds).replace(/:/g, "-")}_${fmtOffset(
      clip.end_seconds,
    ).replace(/:/g, "-")}.mp4`;
  };

  const urlFor = (clip: Clip) => {
    const url = new URL(clip.download_url!);
    url.searchParams.set("filename", filenameFor(clip));
    return url.toString();
  };

  const downloadClip = (clip: Clip) => {
    if (!clip.download_url) return;
    const a = document.createElement("a");
    a.href = urlFor(clip);
    a.download = filenameFor(clip);
    a.rel = "noopener";
    a.target = "_blank";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  // iOS: hand the share sheet a real MP4 File so "Save Video" (straight to Photos) appears.
  const saveToPhotos = async (clip: Clip) => {
    if (!clip.download_url) return;
    const name = filenameFor(clip);
    const cached = readyFiles[clip.id];
    if (cached) {
      const ok = await shareVideoFile(cached, name);
      if (!ok) saveFileFallback(cached);
      return;
    }
    setBusyId(clip.id);
    setProgress(null);
    try {
      const file = await fetchVideoFile(urlFor(clip), name, setProgress);
      const ok = await shareVideoFile(file, name);
      if (!ok) {
        // Safari drops the user-gesture after a long fetch — cache and let them tap again.
        setReadyFiles((p) => ({ ...p, [clip.id]: file }));
        toast({ title: "Ready", description: "Tap “Save to Photos” again to open the share sheet." });
      }
    } catch (e) {
      toast({
        title: "Couldn’t prepare video",
        description: e instanceof Error ? e.message : "Try the Download button instead.",
        variant: "destructive",
      });
    } finally {
      setBusyId(null);
      setProgress(null);
    }
  };


  const badgeFor = (status: string) => {
    if (status === "ready")
      return <Badge className="bg-green-500/10 text-green-600 border-green-200">Ready</Badge>;
    if (status === "failed") return <Badge variant="destructive">Failed</Badge>;
    if (status === "processing")
      return (
        <Badge variant="secondary">
          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
          Processing
        </Badge>
      );
    return (
      <Badge variant="outline">
        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
        Queued
      </Badge>
    );
  };

  const downloadFullSession = async () => {
    if (!sessionId) return;
    toast({ title: "Preparing full session…", description: "Cloudflare may take a moment on first request." });
    const { data, error } = await supabase.functions.invoke("session-download-url", {
      body: { recording_session_id: sessionId },
    });
    if (error || !data?.download_url) {
      toast({
        title: "Not ready",
        description: (data as any)?.error || (data as any)?.message || error?.message || "Full session is still processing. Try again shortly.",
        variant: "destructive",
      });
      return;
    }
    const filename = `${safe(session?.player_name ?? "session")}-bay${session?.bay_number ?? ""}-${(session?.started_at ?? "").slice(0, 10)}-full.mp4`;
    const url = new URL(data.download_url);
    url.searchParams.set("filename", filename);
    const a = document.createElement("a");
    a.href = url.toString();
    a.download = filename;
    a.rel = "noopener";
    a.target = "_blank";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const fullReady = session?.stream_status === "ready" && !!session?.stream_uid;

  return (
    <LeagueLayout>
      <div className="flex items-center gap-2 mb-4">
        <Button asChild size="sm" variant="ghost">
          <Link to="/league/highlights">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Link>
        </Button>
        <Button size="sm" variant="ghost" onClick={() => void load()}>
          <RefreshCw className="h-4 w-4 mr-1" />
          Refresh
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="ml-auto"
          onClick={() => void downloadFullSession()}
          disabled={!fullReady}
          title={fullReady ? "Download the entire session as MP4" : "Full session is still processing"}
        >
          <Film className="h-4 w-4 mr-1" />
          Download full session
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>
            Your Clips
            {session && (
              <span className="text-muted-foreground text-base font-normal">
                {" "}
                — {session.tournament_name || "Session"} · Bay {session.bay_number}
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="animate-spin" />
            </div>
          ) : clips.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No clips have been exported from this session yet.
            </p>
          ) : (
            <div className="space-y-2">
              {clips.map((clip) => (
                <div
                  key={clip.id}
                  className="border rounded-lg p-3 flex flex-col md:flex-row md:items-center gap-2 md:gap-4"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-sm">
                      {fmtOffset(clip.start_seconds)} → {fmtOffset(clip.end_seconds)}
                      <span className="ml-2 text-muted-foreground">
                        ({fmtOffset(clip.end_seconds - clip.start_seconds)})
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-2 flex-wrap">
                      {badgeFor(clip.status)}
                      <span className="text-xs text-muted-foreground">
                        {formatBrisbane(clip.created_at)}
                      </span>
                    </div>
                    {clip.error && (
                      <p className="text-xs text-destructive mt-1 break-words">{clip.error}</p>
                    )}
                  </div>
                  <div className="flex gap-2 md:shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => downloadClip(clip)}
                      disabled={clip.status !== "ready" || !clip.download_url}
                    >
                      <Download className="h-4 w-4 mr-1" />
                      Download
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </LeagueLayout>
  );
}
