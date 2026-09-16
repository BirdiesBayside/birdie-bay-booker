import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import Seo from "@/components/Seo";
import { Button } from "@/components/ui/button";
import { Loader2, Play, X } from "lucide-react";
import simCupLogoAsset from "@/assets/sim-cup-logo.png.asset.json";

interface LiveBay {
  bay_number: number;
  bay_name: string | null;
  playback_id: string;
  is_online: boolean | null;
  is_live: boolean;
  live_uid: string | null;
  thumbnail: string | null;
  player_name: string | null;
}

interface Replay {
  uid: string;
  bay_number: number;
  bay_name: string | null;
  thumbnail?: string | null;
  preview?: string | null;
  created?: string | null;
  duration?: number | null;
}

// Cloudflare returns a customer-scoped preview URL; the iframe player lives on the
// same subdomain, so derive it rather than hard-coding the customer code.
function iframeUrlFrom(previewOrUid: string | null | undefined, uid: string) {
  if (previewOrUid && previewOrUid.includes("cloudflarestream.com")) {
    try {
      const u = new URL(previewOrUid);
      return `${u.origin}/${uid}/iframe?autoplay=true&muted=true`;
    } catch {
      /* fall through */
    }
  }
  return `https://customer-9v2ogtnrxaf2pk8p.cloudflarestream.com/${uid}/iframe?autoplay=true&muted=true`;
}

const SimCupLive = () => {
  const [loading, setLoading] = useState(true);
  const [eventLive, setEventLive] = useState(false);
  const [bays, setBays] = useState<LiveBay[]>([]);
  const [replays, setReplays] = useState<Replay[]>([]);
  const [selectedBay, setSelectedBay] = useState<number | null>(null);
  const [selectedReplay, setSelectedReplay] = useState<Replay | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.functions.invoke("sim-cup-live", { body: {} });
    if (!error && data) {
      setEventLive(Boolean(data.event_live));
      setBays(Array.isArray(data.bays) ? data.bays : []);
      setReplays(Array.isArray(data.replays) ? data.replays : []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 25_000);
    return () => clearInterval(id);
  }, [load]);

  const active = useMemo(
    () => bays.find((b) => b.bay_number === selectedBay) ?? null,
    [bays, selectedBay],
  );
  const anyLive = bays.some((b) => b.is_live);
  const previewSample = replays[0]?.preview ?? null;

  return (
    <div className="min-h-screen bg-primary">
      <Seo
        title="Sim Cup Live | Watch Every Bay | Birdies Bayside"
        description="Watch The Sim Cup live from Birdies Bayside — every bay streaming, pick a bay from the floor plan and rewatch finished rounds."
        path="/sim-cup-live"
      />

      <main className="mx-auto w-full max-w-6xl px-5 py-10">
        <img
          src={simCupLogoAsset.url}
          alt="Birdies Bayside"
          className="mx-auto mb-6 h-14 w-auto max-w-xs object-contain"
        />

        <div className="text-center">
          <p className="text-xs font-black uppercase tracking-[0.25em] text-accent">
            {anyLive ? "On air now" : "Broadcast centre"}
          </p>
          <h1 className="mt-2 font-display text-5xl uppercase leading-none tracking-wide text-primary-foreground sm:text-7xl">
            Sim Cup Live
          </h1>
          <div className="mx-auto mt-4 h-[5px] w-16 bg-accent" />
          <p className="mx-auto mt-5 max-w-xl text-primary-foreground/80">
            A bird's-eye view of the floor. Tap any bay to drop into that stream, then hop
            between bays as the matches swing.
          </p>
        </div>

        {/* ---------- Player ---------- */}
        {active && (
          <section className="mt-9 rounded-xl bg-background p-4 sm:p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-accent">
                  {active.is_live ? "Live" : "Off air"}
                </p>
                <h2 className="font-display text-3xl uppercase text-primary">
                  {active.bay_name ?? `Bay ${active.bay_number}`}
                </h2>
                {active.player_name && (
                  <p className="text-sm text-primary/70">{active.player_name} on the tee</p>
                )}
              </div>
              <Button variant="ghost" size="icon" onClick={() => setSelectedBay(null)} aria-label="Close player">
                <X className="h-5 w-5" />
              </Button>
            </div>
            <div className="mx-auto w-full max-w-sm overflow-hidden rounded-lg bg-black">
              {active.is_live && active.live_uid ? (
                <iframe
                  key={active.live_uid}
                  src={iframeUrlFrom(previewSample, active.live_uid)}
                  title={`Bay ${active.bay_number} live stream`}
                  className="aspect-[9/16] w-full"
                  allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;"
                  allowFullScreen
                />
              ) : (
                <div className="flex aspect-[9/16] w-full items-center justify-center p-6 text-center text-sm text-white/70">
                  This bay isn't broadcasting right now.
                </div>
              )}
            </div>

            {/* bay hopper */}
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {bays.map((b) => (
                <button
                  key={b.bay_number}
                  type="button"
                  onClick={() => setSelectedBay(b.bay_number)}
                  className={`rounded-full px-4 py-1.5 text-xs font-bold uppercase tracking-wide transition-colors ${
                    b.bay_number === active.bay_number
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-primary/70 hover:bg-muted/70"
                  }`}
                >
                  Bay {b.bay_number}
                  {b.is_live && <span className="ml-2 inline-block h-2 w-2 rounded-full bg-accent" />}
                </button>
              ))}
            </div>
          </section>
        )}

        {/* ---------- Overhead floor plan ---------- */}
        <section className="mt-9 rounded-xl border-2 border-primary-foreground/15 bg-primary-foreground/[0.04] p-4 sm:p-7">
          <p className="mb-5 text-center text-[11px] font-black uppercase tracking-[0.3em] text-primary-foreground/50">
            Birdies Bayside — floor plan
          </p>

          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-primary-foreground/60" />
            </div>
          ) : bays.length === 0 ? (
            <p className="py-12 text-center text-primary-foreground/70">
              Streams go live on the day of the Sim Cup. Check back then.
            </p>
          ) : (
            <>
              {/* hitting line */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                {bays.map((bay) => (
                  <button
                    key={bay.bay_number}
                    type="button"
                    onClick={() => setSelectedBay(bay.bay_number)}
                    className={`group relative overflow-hidden rounded-lg border text-left transition-all ${
                      bay.is_live
                        ? "border-accent/70 bg-black hover:-translate-y-1"
                        : "border-primary-foreground/15 bg-primary-foreground/[0.06]"
                    }`}
                  >
                    <div className="aspect-[3/4] w-full">
                      {bay.is_live && bay.thumbnail ? (
                        <img
                          src={bay.thumbnail}
                          alt={`Bay ${bay.bay_number} live`}
                          className="h-full w-full object-cover opacity-90 transition-opacity group-hover:opacity-100"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <span className="font-display text-4xl uppercase text-primary-foreground/25">
                            {bay.bay_number}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="absolute inset-x-0 top-0 flex items-center justify-between p-2">
                      <span className="font-display text-sm uppercase tracking-wide text-primary-foreground">
                        Bay {bay.bay_number}
                      </span>
                      {bay.is_live ? (
                        <span className="flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-accent-foreground">
                          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
                          Live
                        </span>
                      ) : (
                        <span className="rounded-full bg-primary-foreground/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary-foreground/50">
                          Off air
                        </span>
                      )}
                    </div>

                    {bay.player_name && (
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-2">
                        <p className="truncate text-xs font-bold text-white">{bay.player_name}</p>
                      </div>
                    )}
                  </button>
                ))}
              </div>

              {/* room furniture, purely to place the bays in the venue */}
              <div className="mt-4 grid grid-cols-2 gap-3 text-center">
                <div className="rounded-lg border border-dashed border-primary-foreground/15 py-5 text-[11px] font-black uppercase tracking-[0.25em] text-primary-foreground/35">
                  Lounge
                </div>
                <div className="rounded-lg border border-dashed border-primary-foreground/15 py-5 text-[11px] font-black uppercase tracking-[0.25em] text-primary-foreground/35">
                  Bar
                </div>
              </div>
            </>
          )}
        </section>

        {/* ---------- Replays ---------- */}
        {replays.length > 0 && (
          <section className="mt-10">
            <h2 className="font-display text-3xl uppercase text-primary-foreground">Replays</h2>
            <div className="mt-2 h-[4px] w-12 bg-accent" />
            <div className="mt-5 grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {replays.map((r) => (
                <button
                  key={r.uid}
                  type="button"
                  onClick={() => setSelectedReplay(r)}
                  className="group overflow-hidden rounded-lg border border-primary-foreground/15 bg-black text-left"
                >
                  <div className="relative aspect-video w-full">
                    {r.thumbnail ? (
                      <img src={r.thumbnail} alt="" className="h-full w-full object-cover opacity-85" />
                    ) : null}
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Play className="h-8 w-8 text-white/80 transition-transform group-hover:scale-110" />
                    </div>
                  </div>
                  <div className="p-2">
                    <p className="font-display text-sm uppercase text-primary-foreground">
                      {r.bay_name ?? `Bay ${r.bay_number}`}
                    </p>
                    {r.created && (
                      <p className="text-xs text-primary-foreground/55">
                        {new Date(r.created).toLocaleString("en-AU", {
                          timeZone: "Australia/Brisbane",
                          day: "numeric",
                          month: "short",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        <p className="mt-10 text-center text-xs text-primary-foreground/50">
          Sim Cup sessions are streamed publicly. Outside of event days, bays are recorded
          only — never broadcast.
          {!eventLive && " Streaming is currently switched off."}
        </p>
      </main>

      {/* replay lightbox */}
      {selectedReplay && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
          onClick={() => setSelectedReplay(null)}
        >
          <div className="w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <iframe
              src={iframeUrlFrom(selectedReplay.preview, selectedReplay.uid)}
              title="Sim Cup replay"
              className="aspect-[9/16] w-full rounded-lg bg-black"
              allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;"
              allowFullScreen
            />
            <div className="mt-3 text-center">
              <Button variant="secondary" size="sm" onClick={() => setSelectedReplay(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SimCupLive;
