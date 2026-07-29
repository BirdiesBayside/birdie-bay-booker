import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Download, ImageDown, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { formatBrisbane } from "@/lib/brisbane-time";
import { fetchVideoFile, saveFileFallback, shareVideoFile, supportsVideoFileShare } from "@/lib/share-video";

interface Clip {
  id: string;
  start_seconds: number;
  end_seconds: number;
  status: string;
  stream_clip_uid: string | null;
  download_url: string | null;
  error: string | null;
  label: string | null;
  created_at: string;
}
interface Session {
  id: string;
  player_name: string | null;
  tournament_name: string | null;
  bay_number: number;
  started_at: string | null;
}

function fmtOffset(secs: number): string {
  const s = Math.max(0, Math.floor(secs));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}` : `${m}:${String(r).padStart(2, "0")}`;
}

const safe = (s: string) => s.replace(/[^a-z0-9-]+/gi, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").toLowerCase();

export default function AdminHighlightExports() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { toast } = useToast();
  const [session, setSession] = useState<Session | null>(null);
  const [clips, setClips] = useState<Clip[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [readyFiles, setReadyFiles] = useState<Record<string, File>>({});
  const canSaveToPhotos = supportsVideoFileShare();

  const load = async (silent = false) => {
    if (!sessionId) return;
    if (!silent) setLoading(true);
    const [{ data: sess }, { data: clipRows }] = await Promise.all([
      supabase.from("recording_sessions").select("id, player_name, tournament_name, bay_number, started_at").eq("id", sessionId).maybeSingle(),
      supabase.from("recording_clips").select("*").eq("recording_session_id", sessionId).order("created_at", { ascending: false }),
    ]);
    setSession(sess ?? null);
    setClips((clipRows ?? []) as Clip[]);
    if (!silent) setLoading(false);
  };

  useEffect(() => {
    void load();
    const t = setInterval(() => { void load(true); }, 5000);
    return () => clearInterval(t);
  }, [sessionId]);

  const filenameFor = (clip: Clip) => {
    const player = safe(session?.player_name ?? "clip");
    const date = (session?.started_at ?? "").slice(0, 10);
    const bay = session?.bay_number != null ? `bay${session.bay_number}` : "bay";
    return `${player}-${bay}-${date}-${fmtOffset(clip.start_seconds).replace(/:/g, "-")}_${fmtOffset(clip.end_seconds).replace(/:/g, "-")}.mp4`;
  };

  const urlFor = (clip: Clip) => {
    const url = new URL(clip.download_url!);
    url.searchParams.set("filename", filenameFor(clip));
    return url.toString();
  };

  const downloadClip = (clip: Clip) => {
    if (!clip.download_url) return;
    // Trigger a native download (goes to Files on iOS).
    const a = document.createElement("a");
    a.href = urlFor(clip);
    a.download = filenameFor(clip);
    a.rel = "noopener";
    a.target = "_blank";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  // iOS: share a real MP4 File so the sheet offers "Save Video" straight into Photos.
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


  const deleteClip = async (clip: Clip) => {
    if (!confirm("Delete this clip?")) return;
    const { error } = await supabase.from("recording_clips").delete().eq("id", clip.id);
    if (error) toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    else void load();
  };

  const badgeFor = (status: string) => {
    if (status === "ready") return <Badge className="bg-green-500/10 text-green-600 border-green-200">Ready</Badge>;
    if (status === "failed") return <Badge variant="destructive">Failed</Badge>;
    if (status === "processing") return <Badge variant="secondary"><Loader2 className="h-3 w-3 mr-1 animate-spin" />Processing</Badge>;
    return <Badge variant="outline"><Loader2 className="h-3 w-3 mr-1 animate-spin" />Queued</Badge>;
  };

  return (
    <AdminLayout>
      <div className="space-y-6 p-4 md:p-6 max-w-5xl">
        <div className="flex items-center gap-2">
          <Button asChild size="sm" variant="ghost"><Link to="/admin/sgt"><ArrowLeft className="h-4 w-4 mr-1" />Back</Link></Button>
          <Button size="sm" variant="ghost" onClick={() => void load()}><RefreshCw className="h-4 w-4 mr-1" />Refresh</Button>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>
              Clip Exports {session && <span className="text-muted-foreground text-base font-normal">— {session.player_name} · Bay {session.bay_number}</span>}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-8"><Loader2 className="animate-spin" /></div>
            ) : clips.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No clips exported yet. Head back to the session player and use Start/Stop clip.</p>
            ) : (
              <div className="space-y-2">
                {clips.map((clip) => (
                  <div key={clip.id} className="border rounded-lg p-3 flex flex-col md:flex-row md:items-center gap-2 md:gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="font-mono text-sm">
                        {fmtOffset(clip.start_seconds)} → {fmtOffset(clip.end_seconds)}
                        <span className="ml-2 text-muted-foreground">({fmtOffset(clip.end_seconds - clip.start_seconds)})</span>
                      </div>
                      <div className="mt-1 flex items-center gap-2 flex-wrap">
                        {badgeFor(clip.status)}
                        <span className="text-xs text-muted-foreground">{formatBrisbane(clip.created_at)}</span>
                      </div>
                      {clip.error && <p className="text-xs text-destructive mt-1 break-words">{clip.error}</p>}
                    </div>
                    <div className="flex gap-2 md:shrink-0">
                      <Button size="sm" variant="outline" onClick={() => downloadClip(clip)} disabled={clip.status !== "ready" || !clip.download_url}>
                        <Download className="h-4 w-4 mr-1" />Download
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => deleteClip(clip)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
