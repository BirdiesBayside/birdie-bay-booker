import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import Hls from "hls.js";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, FolderOpen, Loader2, Scissors, Video, X } from "lucide-react";
import {
  ScorecardGrid,
  fmtOffset,
  getFunctionErrorMessage,
  type Scorecard,
} from "@/components/admin/LeagueHighlights";
import { formatBrisbane } from "@/lib/brisbane-time";

interface ReviewSession {
  id: string;
  player_name: string | null;
  tournament_name: string | null;
  bay_number: number;
  started_at: string | null;
  round_number: number | null;
  trigger_source: string | null;
  stream_uid: string | null;
  stream_status: string | null;
  stream_error: string | null;
  scorecard: Scorecard | null;
}

export default function AdminHighlightReview() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [session, setSession] = useState<ReviewSession | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [preparing, setPreparing] = useState(false);
  const [clipStart, setClipStart] = useState<number | null>(null);
  const [clipEnd, setClipEnd] = useState<number | null>(null);
  const [clipLoading, setClipLoading] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const attemptedRef = useRef(false);

  const load = async () => {
    if (!sessionId) return;
    const { data } = await supabase
      .from("recording_sessions")
      .select("id, player_name, tournament_name, bay_number, started_at, round_number, stream_uid, stream_status, stream_error, scorecard")
      .eq("id", sessionId)
      .maybeSingle();
    setSession((data as ReviewSession | null) ?? null);
    setLoading(false);
  };

  useEffect(() => { void load(); }, [sessionId]);

  // Auto request the playable stream URL once we have the session
  useEffect(() => {
    if (!session || attemptedRef.current) return;
    attemptedRef.current = true;
    void ensureStream();
  }, [session]);

  // Attach hls to video element when url ready
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

  const ensureStream = async () => {
    if (!sessionId) return;
    setPreparing(true);
    try {
      const { data, error } = await supabase.functions.invoke("stream-upload", { body: { recording_session_id: sessionId } });
      if (error || data?.error) {
        const description = await getFunctionErrorMessage(error, data);
        toast({ title: "Stream not ready", description, variant: "destructive" });
        return;
      }
      if (data?.playback_url) {
        setVideoUrl(data.playback_url as string);
      } else {
        toast({ title: "Stream still processing", description: "The video is still being prepared. Refresh in a moment." });
      }
    } finally {
      setPreparing(false);
    }
  };

  const markStart = () => { if (videoRef.current) setClipStart(videoRef.current.currentTime); };
  const markEnd = () => { if (videoRef.current) setClipEnd(videoRef.current.currentTime); };
  const clearClip = () => { setClipStart(null); setClipEnd(null); };

  const queueClip = async () => {
    if (!sessionId || clipStart == null || clipEnd == null || clipStart >= clipEnd) return;
    setClipLoading(true);
    const { data, error } = await supabase.functions.invoke("stream-clip", {
      body: { recording_session_id: sessionId, start_seconds: clipStart, end_seconds: clipEnd },
    });
    setClipLoading(false);
    if (error || !data?.clip_id) {
      const description = await getFunctionErrorMessage(error, data);
      toast({ title: "Clip failed", description: description || "unknown error", variant: "destructive" });
      return;
    }
    toast({ title: "Clipped", description: `Queued ${fmtOffset(clipStart)}–${fmtOffset(clipEnd)} · check Exports when ready.` });
    clearClip();
  };

  return (
    <AdminLayout>
      <div className="p-4 md:p-6 space-y-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <Button size="sm" variant="ghost" onClick={() => navigate("/admin/sgt?tab=highlights")}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back to Highlights
          </Button>
          {sessionId && (
            <Button asChild size="sm" variant="outline">
              <Link to={`/admin/highlights/${sessionId}/exports`}>
                <FolderOpen className="h-4 w-4 mr-1" /> Exports
              </Link>
            </Button>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="animate-spin" /></div>
        ) : !session ? (
          <div className="text-center py-16 text-muted-foreground">Session not found.</div>
        ) : (
          <>
            <div className="flex items-center gap-2 flex-wrap">
              <Video className="h-4 w-4 text-muted-foreground" />
              <span className="font-semibold">{session.player_name ?? "Unknown"}</span>
              <span className="text-muted-foreground text-sm">
                · Bay {session.bay_number} · {session.tournament_name}
                {session.round_number ? ` — Round ${session.round_number}` : ""}
              </span>
              {session.started_at && (
                <span className="text-muted-foreground text-xs">· {formatBrisbane(session.started_at)}</span>
              )}
            </div>

            <div className="bg-black rounded-lg overflow-hidden">
              {videoUrl ? (
                <video ref={videoRef} controls autoPlay playsInline className="w-full max-h-[70vh]" />
              ) : (
                <div className="text-white p-12 text-center">
                  <Loader2 className="animate-spin inline mr-2" />
                  {preparing ? "Preparing stream…" : "Waiting for stream…"}
                </div>
              )}
            </div>

            {videoUrl && (
              <div className="p-3 border rounded-lg bg-background space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" variant={clipStart != null ? "default" : "outline"} onClick={markStart}>
                    <Scissors className="h-4 w-4 mr-1" /> Start clip
                    {clipStart != null && <span className="ml-1 font-mono">({fmtOffset(clipStart)})</span>}
                  </Button>
                  <Button size="sm" variant={clipEnd != null ? "default" : "outline"} onClick={markEnd}>
                    Stop clip
                    {clipEnd != null && <span className="ml-1 font-mono">({fmtOffset(clipEnd)})</span>}
                  </Button>
                  {(clipStart != null || clipEnd != null) && (
                    <Button size="sm" variant="ghost" onClick={clearClip}>
                      <X className="h-4 w-4 mr-1" /> Clear
                    </Button>
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
                    Clip: <span className="font-mono">{fmtOffset(clipStart)}</span> → <span className="font-mono">{fmtOffset(clipEnd)}</span>
                    {" · Duration "}<span className="font-mono">{fmtOffset(Math.max(0, clipEnd - clipStart))}</span>
                  </div>
                )}
              </div>
            )}

            <div className="border rounded-lg p-4">
              <div className="text-xs font-semibold text-muted-foreground uppercase mb-3">Scorecard</div>
              {session.scorecard ? (
                <ScorecardGrid scorecard={session.scorecard} />
              ) : (
                <div className="text-sm text-muted-foreground">
                  Scorecard will appear here once the round is finished and pulled from SGT.
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
