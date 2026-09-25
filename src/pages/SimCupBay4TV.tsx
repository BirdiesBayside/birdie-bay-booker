import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import Seo from "@/components/Seo";
import { supabase } from "@/integrations/supabase/client";

interface BayFourStream {
  bay_number: number;
  is_live: boolean;
  live_uid: string | null;
  thumbnail: string | null;
}

function playerUrl(previewOrThumbnail: string | null, uid: string) {
  if (previewOrThumbnail?.includes("cloudflarestream.com")) {
    try {
      const url = new URL(previewOrThumbnail);
      return `${url.origin}/${uid}/iframe?autoplay=true&muted=true&controls=true`;
    } catch {
      // Use the known Stream customer host when the supplied URL is malformed.
    }
  }

  return `https://customer-1mu5cmew76e8fiog.cloudflarestream.com/${uid}/iframe?autoplay=true&muted=true&controls=true`;
}

export default function SimCupBay4TV() {
  const [bay, setBay] = useState<BayFourStream | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const { data, error } = await supabase.functions.invoke("sim-cup-live", { body: {} });
    if (!error && Array.isArray(data?.bays)) {
      const bayFour = data.bays.find((item: BayFourStream) => item.bay_number === 4);
      setBay(bayFour ?? null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, 15_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const isLive = Boolean(bay?.is_live && bay.live_uid);

  return (
    <main className="relative flex h-screen w-screen items-center justify-center overflow-hidden bg-venue-panel">
      <Seo
        title="Bay 4 Live | Sim Cup | Birdies Bayside"
        description="Full-screen Bay 4 broadcast for The Sim Cup at Birdies Bayside."
        path="/sim-cup-live/bay-4-tv"
      />

      {isLive && bay?.live_uid ? (
        <iframe
          key={bay.live_uid}
          src={playerUrl(bay.thumbnail, bay.live_uid)}
          title="Bay 4 live stream"
          className="aspect-[9/16] h-screen max-w-full border-0 bg-venue-panel"
          allow="autoplay; encrypted-media; fullscreen"
          allowFullScreen
        />
      ) : (
        <div className="flex flex-col items-center text-center text-primary-foreground">
          <p className="text-2xl font-black uppercase tracking-[0.25em] text-accent 2xl:text-4xl">
            The Sim Cup at Birdies Bayside
          </p>
          <p className="mt-7 font-display text-8xl uppercase tracking-normal 2xl:text-[10rem]">
            Bay 4
          </p>
          <div className="mt-10 flex items-center gap-5 text-primary-foreground/70">
            {loading && <Loader2 className="h-7 w-7 animate-spin" />}
            <p className="font-display text-4xl uppercase tracking-normal 2xl:text-6xl">
              {loading ? "Connecting" : "Stream starting soon"}
            </p>
          </div>
        </div>
      )}
    </main>
  );
}