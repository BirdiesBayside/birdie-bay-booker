import { Link } from "react-router-dom";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { Check, Clock, DollarSign, Trophy, Target, ArrowRight, BarChart3, Crosshair, TrendingUp, Activity, Gauge } from "lucide-react";
import heroVideo from "@/assets/hero-video.mp4.asset.json";
import heroPoster from "@/assets/hero-poster.jpg.asset.json";
import simulatorBay from "@/assets/simulator-bay.png.asset.json";
const COMMUNITY_IMG = "https://cdn.shopify.com/s/files/1/0758/7030/6550/files/Birdies_Golf.jpg?v=1751956878&width=3840";

const features = [
  { icon: Target, title: "High-Tech Simulators", body: "Tour-accurate launch data, 4K graphics and 2,300+ world-famous courses." },
  { icon: Clock, title: "Flexible 5am - 11pm Access", body: "Six fully automated bays, book any time, play any time." },
  { icon: DollarSign, title: "Affordable Memberships", body: "Pay a simple weekly fee to unlock your member hourly rate." },
  { icon: Trophy, title: "Competitions & League", body: "Birdie & Eagle members get access to the Birdies League. Weekday members can still jump into our Wednesday local comp." },
];

const swingLabFeatures = [
  { icon: Target, title: "Automatic Shot Capture", body: "Export your session from the GSPro driving range — your shots appear in the Hub automatically." },
  { icon: BarChart3, title: "Per-Club Gapping", body: "See average and max carry and total distance for every club in your bag." },
  { icon: Crosshair, title: "Dispersion Analysis", body: "Visual scatter plots with 95% ellipses, shape pattern and landing zone for each club." },
  { icon: Activity, title: "Swing Dynamics", body: "Dive into club path, face angle, face-to-path, angle of attack and spin axis." },
  { icon: TrendingUp, title: "Progress Tracking", body: "Compare consistency, speed and dispersion against your previous 30, 90 or 180 days." },
  { icon: Gauge, title: "Tour Benchmarking", body: "Benchmark your numbers against PGA Tour and amateur averages, plus a focus-point coaching cue." },
];

const MarketingHome = () => {
  return (
    <MarketingLayout>
      {/* HERO */}
      <section className="relative h-[88vh] min-h-[560px] flex items-center overflow-hidden">
        <video
          src={heroVideo.url}
          poster={heroPoster.url}
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/40 to-transparent" />
        <div className="relative container mx-auto px-4 max-w-5xl">
          <p className="text-accent font-display tracking-[0.25em] uppercase text-sm mb-4">
            Welcome to Birdies, Redland Bay
          </p>
          <h1 className="font-display text-5xl sm:text-7xl lg:text-8xl text-primary-foreground leading-[0.95] tracking-tight">
            Indoor Golf,<br />
            <span className="text-accent">Redefined.</span>
          </h1>
          <p className="mt-6 text-lg sm:text-xl text-primary-foreground/90 max-w-xl">
            Experience world-class indoor golf. Play, practice and compete, rain or shine.
            Visitors welcome.
          </p>
          <div className="mt-8 flex flex-col items-start gap-3">
            <a
              href="https://hub.birdiesbayside.com.au/"
              className="bg-accent hover:bg-accent/90 text-accent-foreground font-display tracking-wide uppercase px-7 h-12 rounded-md inline-flex items-center justify-center gap-2 transition-all hover:translate-x-0.5"
            >
              Book Now <ArrowRight className="h-4 w-4" />
            </a>
            <a
              href="https://apps.apple.com/au/app/birdies-hub/id6758370714"
              target="_blank"
              rel="noopener noreferrer"
            >
              <img
                src="https://tools.applemediaservices.com/api/badges/download-on-the-app-store/white/en-au?size=250x83"
                alt="Download on the App Store"
                className="h-12 w-auto rounded-md"
              />
            </a>
          </div>
        </div>
      </section>

      {/* WHAT IS BIRDIES */}
      <section className="py-12 sm:py-28">
        <div className="container mx-auto px-4 grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <p className="text-accent font-display tracking-[0.2em] uppercase text-sm mb-3">What is Birdies?</p>
            <h2 className="font-display text-4xl sm:text-5xl text-primary leading-tight mb-6">
              Redland's premier indoor golf centre.
            </h2>
            <p className="text-foreground/80 text-lg leading-relaxed mb-4">
              Birdies combines cutting-edge simulator technology with 4K visuals and tour-level accuracy.
              Perfect for practice, game improvement, or a quick round with friends, all without leaving the Redlands.
            </p>
            <Link
              to="/about"
              className="inline-flex items-center gap-2 text-accent font-display tracking-wide uppercase text-sm hover:gap-3 transition-all"
            >
              Learn More <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="relative rounded-2xl overflow-hidden shadow-xl aspect-[4/3]">
            <img src={simulatorBay.url} alt="Birdies simulator bay" className="w-full h-full object-cover" />
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section className="bg-primary text-primary-foreground py-12 sm:py-24">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <p className="text-accent font-display tracking-[0.2em] uppercase text-sm mb-3">Why Birdies</p>
            <h2 className="font-display text-4xl sm:text-5xl leading-tight">
              Tour-level tech. Local prices. Zero excuses.
            </h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((f) => (
              <div
                key={f.title}
                className="bg-primary-foreground/5 hover:bg-primary-foreground/10 transition-colors border border-primary-foreground/10 rounded-xl p-6"
              >
                <div className="w-12 h-12 rounded-lg bg-accent/15 text-accent flex items-center justify-center mb-4">
                  <f.icon className="h-6 w-6" />
                </div>
                <h3 className="font-display text-xl tracking-wide uppercase mb-2">{f.title}</h3>
                <p className="text-primary-foreground/75 text-sm leading-relaxed">{f.body}</p>
              </div>
            ))}
          </div>
          <div className="text-center mt-12">
            <Link
              to="/membership-info"
              className="inline-flex items-center gap-2 bg-accent hover:bg-accent/90 text-accent-foreground font-display tracking-wide uppercase px-7 py-3.5 rounded-md"
            >
              See Membership Plans <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* PRICING SNAPSHOT */}
      <section className="py-12 sm:py-24">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <p className="text-accent font-display tracking-[0.2em] uppercase text-sm mb-3">Pricing</p>
            <h2 className="font-display text-4xl sm:text-5xl text-primary leading-tight">
              Pay as you go, or save with a membership.
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            <PriceCard tier="Weekday" rate="$10/hr" price="$15" tag="Mon-Thu before 4pm only" perks={["Swing Lab access", "Cancel any time", "Peak times charged at visitor rate"]} />
            <PriceCard tier="Birdie" rate="$10/hr" price="$27" tag="Most popular" highlight perks={["Play anytime", "Birdies League access", "Swing Lab access", "Cancel any time"]} />
            <PriceCard tier="Eagle" rate="$8/hr" price="$35" tag="Best value per round" perks={["Play anytime", "Birdies League access", "Swing Lab access", "Priority booking", "Cancel any time"]} />
          </div>
          <div className="grid sm:grid-cols-2 gap-6 max-w-2xl mx-auto mt-8">
            <div className="bg-card border border-border rounded-2xl p-7 text-card-foreground hover:shadow-lg transition-all">
              <p className="text-xs uppercase tracking-wider mb-2 text-foreground/60">Off-Peak</p>
              <h3 className="font-display text-3xl uppercase tracking-wide mb-1">Visitor</h3>
              <div className="mb-5">
                <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold bg-accent/10 text-accent border border-accent/20">
                  <Clock className="h-3.5 w-3.5" />
                  $30/hr
                </span>
              </div>
              <p className="text-sm text-foreground/60 mb-2">Mon-Thu before 4pm</p>
              <p className="text-sm text-foreground/60 mb-6">Per bay, up to 4 players</p>
              <a href="https://hub.birdiesbayside.com.au/" className="block text-center font-display uppercase tracking-wide text-sm px-5 py-3 rounded-md transition-colors bg-accent hover:bg-accent/90 text-accent-foreground">
                Book Now
              </a>
            </div>
            <div className="bg-card border border-border rounded-2xl p-7 text-card-foreground hover:shadow-lg transition-all">
              <p className="text-xs uppercase tracking-wider mb-2 text-foreground/60">Peak</p>
              <h3 className="font-display text-3xl uppercase tracking-wide mb-1">Visitor</h3>
              <div className="mb-5">
                <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold bg-accent/10 text-accent border border-accent/20">
                  <Clock className="h-3.5 w-3.5" />
                  $35/hr
                </span>
              </div>
              <p className="text-sm text-foreground/60 mb-2">Fri-Sun & Mon-Thu 4pm+</p>
              <p className="text-sm text-foreground/60 mb-6">Per bay, up to 4 players</p>
              <a href="https://hub.birdiesbayside.com.au/" className="block text-center font-display uppercase tracking-wide text-sm px-5 py-3 rounded-md transition-colors bg-accent hover:bg-accent/90 text-accent-foreground">
                Book Now
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* CTA STRIP */}
      <section className="relative py-14 sm:py-24 overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${COMMUNITY_IMG})` }}
        />
        <div className="absolute inset-0 bg-primary/85" />
        <div className="relative container mx-auto px-4 text-center text-primary-foreground max-w-3xl">
          <h2 className="font-display text-4xl sm:text-6xl leading-tight mb-4">
            Become a Member Today.
          </h2>
          <p className="text-primary-foreground/85 text-lg mb-8">
            Join Birdies and get unlimited access to premium simulators, the Birdies League, and a great local community.
          </p>
          <a
            href="https://hub.birdiesbayside.com.au/"
            className="inline-flex items-center gap-2 bg-accent hover:bg-accent/90 text-accent-foreground font-display tracking-wide uppercase px-8 py-4 rounded-md"
          >
            Join Now <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </section>
    </MarketingLayout>
  );
};

const PriceCard = ({
  tier,
  rate,
  price,
  tag,
  perks,
  highlight,
}: {
  tier: string;
  rate: string;
  price: string;
  tag: string;
  perks: string[];
  highlight?: boolean;
}) => (
  <div
    className={`relative rounded-2xl p-7 border transition-all bg-card text-card-foreground hover:shadow-lg ${
      highlight ? "border-accent ring-2 ring-accent/20" : "border-border"
    }`}
  >
    {highlight && (
      <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-accent text-accent-foreground text-xs font-display uppercase tracking-wider px-3 py-1 rounded-full">
        Most Popular
      </span>
    )}
    <p className="text-xs uppercase tracking-wider mb-2 text-foreground/60">{tag}</p>
    <h3 className="font-display text-3xl uppercase tracking-wide mb-1">{tier}</h3>
    <div className="mb-5">
      <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold bg-accent/10 text-accent border border-accent/20">
        <Clock className="h-3.5 w-3.5" />
        {rate}
      </span>
    </div>
    <div className="mb-6">
      <span className="font-display text-5xl">{price}</span>
      <span className="text-sm text-foreground/60"> /week</span>
    </div>
    <ul className="space-y-2 text-sm mb-6">
      {perks.map((p) => (
        <li key={p} className="flex gap-2">
          <Check className="h-4 w-4 mt-0.5 text-accent shrink-0" />
          <span>{p}</span>
        </li>
      ))}
    </ul>
    <a
      href="https://hub.birdiesbayside.com.au/"
      className="block text-center font-display uppercase tracking-wide text-sm px-5 py-3 rounded-md transition-colors bg-primary hover:bg-primary/90 text-primary-foreground"
    >
      Join
    </a>
  </div>
);

export default MarketingHome;
