import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import Seo from "@/components/Seo";
import { Button } from "@/components/ui/button";
import { Loader2, Play, X } from "lucide-react";
import simCupLogoAsset from "@/assets/sim-cup-logo.png.asset.json";
import { cn } from "@/lib/utils";

interface LiveBay {
  bay_number: number;
  bay_name: string | null;
  playback_id: string | null;
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

interface BayStallProps {
  bay: LiveBay;
  rear?: boolean;
  onSelect: (bayNumber: number) => void;
}

function BayStall({ bay, rear = false, onSelect }: BayStallProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      onClick={() => onSelect(bay.bay_number)}
      aria-label={`Watch Bay ${bay.bay_number}${bay.is_live ? ", live now" : ", off air"}`}
      className={cn(
        "group relative z-0 h-full min-h-0 w-full overflow-visible rounded-sm border-0 p-0 transition-all duration-300 hover:z-40 hover:-translate-y-1 hover:bg-transparent hover:shadow-[0_0_28px_hsl(var(--accent)/0.72)] focus-visible:z-40 focus-visible:ring-accent motion-reduce:hover:translate-y-0",
      )}
    >
      <span className="absolute inset-x-1 bottom-0 top-0 overflow-hidden bg-venue-turf shadow-[inset_0_0_25px_hsl(var(--venue-panel)/0.38)]">
        {/* darker green hitting mat between the screen and the back of the bay */}
        <span
          className={cn(
            "absolute left-1/2 h-[26%] w-[58%] -translate-x-1/2 rounded-[2px] bg-venue-turf-dark shadow-[inset_0_1px_3px_hsl(var(--venue-panel)/0.6)]",
            rear ? "bottom-[30%]" : "top-[30%]",
          )}
        />
      </span>

      <span className="absolute inset-y-[-3%] left-0 z-20 w-[5%] bg-venue-panel" />
      <span className="absolute inset-y-[-3%] right-0 z-20 w-[5%] bg-venue-panel" />

      <span
        className={cn(
          "absolute inset-x-[4%] z-10 h-[24%] overflow-hidden bg-venue-panel",
          rear ? "bottom-0" : "top-0",
        )}
      >
        {bay.is_live && bay.thumbnail ? (
          <img
            src={bay.thumbnail}
            alt={`Live view from Bay ${bay.bay_number}`}
            className="h-full w-full object-cover opacity-80 transition-opacity group-hover:opacity-100"
          />
        ) : (
          <span className="absolute inset-0 bg-venue-panel" />
        )}
      </span>

      <span
        className={cn(
          "absolute left-1/2 z-30 -translate-x-1/2 whitespace-nowrap rounded-sm px-2 py-1 text-[9px] font-black uppercase tracking-wider shadow-lg sm:text-[10px]",
          rear ? "top-[12%]" : "bottom-[12%]",
          bay.is_live
            ? "bg-accent text-accent-foreground"
            : "bg-venue-panel-light text-primary-foreground/70",
        )}
      >
        {bay.is_live && <span className="mr-1.5 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-current" />}
        Bay {bay.bay_number} · {bay.is_live ? "Live" : "Off air"}
      </span>

      {bay.player_name && (
        <span
          className={cn(
            "absolute left-1/2 z-30 max-w-[88%] -translate-x-1/2 truncate text-[9px] font-semibold text-primary-foreground drop-shadow-md sm:text-xs",
            rear ? "top-[31%]" : "bottom-[31%]",
          )}
        >
          {bay.player_name}
        </span>
      )}
    </Button>
  );
}

function VenueModel({ bays, onSelect }: { bays: LiveBay[]; onSelect: (bayNumber: number) => void }) {
  const ordered = [...bays].sort((a, b) => a.bay_number - b.bay_number);
  const front = ordered.slice(0, 3);
  const rear = ordered.slice(3, 6).reverse();

  return (
    <div className="relative mx-auto aspect-[1.25/1] w-full max-w-5xl overflow-visible sm:aspect-[1.7/1]">
      <div className="absolute inset-[4%] grid grid-rows-[1fr_14%_1fr] bg-venue-floor shadow-2xl sm:inset-[7%]">
        <div className="grid grid-cols-3">
          {rear.map((bay) => <BayStall key={bay.bay_number} bay={bay} rear onSelect={onSelect} />)}
        </div>

        <div className="relative z-30 bg-venue-panel">
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap font-display text-[clamp(0.7rem,2vw,1.4rem)] uppercase tracking-wide text-primary-foreground/35">
            Birdies Bayside
          </div>
        </div>

        <div className="grid grid-cols-3">
          {front.map((bay) => <BayStall key={bay.bay_number} bay={bay} onSelect={onSelect} />)}
        </div>
      </div>
    </div>
  );
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

  const displayedBays = useMemo(() => {
    const byNumber = new Map(bays.map((bay) => [bay.bay_number, bay]));
    return Array.from({ length: 6 }, (_, index): LiveBay => {
      const bayNumber = index + 1;
      return byNumber.get(bayNumber) ?? {
        bay_number: bayNumber,
        bay_name: `Bay ${bayNumber}`,
        playback_id: null,
        is_online: false,
        is_live: false,
        live_uid: null,
        thumbnail: null,
        player_name: null,
      };
    });
  }, [bays]);

  const active = useMemo(
    () => displayedBays.find((b) => b.bay_number === selectedBay) ?? null,
    [displayedBays, selectedBay],
  );
  const anyLive = displayedBays.some((b) => b.is_live);
  const previewSample = replays[0]?.preview ?? null;

  return (
    <div className="min-h-screen bg-primary">
      <Seo
        title="Sim Cup Live | Watch Every Bay | Birdies Bayside"
        description="Watch The Sim Cup live from Birdies Bayside — choose a bay from the interactive venue view and rewatch finished rounds."
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
            Pick a bay to watch live, then hop between streams as the matches swing.
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
              {displayedBays.map((b) => (
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

        {/* ---------- 3D venue model ---------- */}
        <section className="mt-9 rounded-xl border-2 border-primary-foreground/15 bg-primary-foreground/[0.04] p-4 sm:p-7">
          <p className="mb-5 text-center text-[11px] font-black uppercase tracking-[0.3em] text-primary-foreground/50">
            Choose a bay
          </p>

          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-primary-foreground/60" />
            </div>
          ) : (
            <VenueModel bays={displayedBays} onSelect={setSelectedBay} />
          )}
        </section>

        {/* ---------- Replays ---------- */}
        {replays.length > 0 && (
          <section className="mt-10">
            <h2 className="font-display text-3xl uppercase text-primary-foreground">Replays</h2>
            <div className="mt-2 h-[4px] w-12 bg-accent" />
            <div className="mt-5 grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {replays.map((r) => (
                <Button
                  key={r.uid}
                  type="button"
                  variant="ghost"
                  onClick={() => setSelectedReplay(r)}
                  className="group h-auto overflow-hidden rounded-lg border border-primary-foreground/15 bg-venue-panel p-0 text-left hover:bg-venue-panel-light"
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
                </Button>
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
