import MarketingLayout from "@/components/marketing/MarketingLayout";
import { ArrowRight, Check, Clock, ShieldCheck, Sparkles } from "lucide-react";

const HERO = "https://cdn.shopify.com/s/files/1/0758/7030/6550/files/Birdies_Golf.jpg?v=1751956878&width=3840";

const tiers = [
  {
    name: "Weekday",
    price: "$15",
    rate: "$10/hr",
    tag: "Mon-Thu before 4pm only",
    perks: ["Cancel any time", "Peak times charged at visitor rate"],
  },
  {
    name: "Birdie",
    price: "$27",
    rate: "$10/hr",
    tag: "Most popular",
    highlight: true,
    perks: ["Play anytime", "Birdies League access", "Cancel any time"],
  },
  {
    name: "Eagle",
    price: "$35",
    rate: "$8/hr",
    tag: "Best value per round",
    perks: ["Play anytime", "Birdies League access", "Priority booking", "Cancel any time"],
  },
];

const MarketingMembership = () => (
  <MarketingLayout>
    <section className="relative h-[28vh] min-h-[220px] flex items-end overflow-hidden">
      <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${HERO})` }} />
      <div className="absolute inset-0 bg-gradient-to-t from-primary via-primary/70 to-primary/30" />
      <div className="relative container mx-auto px-4 pb-8">
        <p className="text-accent font-display tracking-[0.25em] uppercase text-xs mb-1.5">Membership</p>
        <h1 className="font-display text-3xl sm:text-5xl text-primary-foreground leading-none">
          Play More.<br />Save More.
        </h1>
      </div>
    </section>

    <section className="py-10 sm:py-20">
      <div className="container mx-auto px-4 max-w-3xl text-center">
        <p className="text-lg text-foreground/80 leading-relaxed">
          Pay a simple weekly fee to unlock your member hourly rate. Book anytime and play at a fraction of the casual price. No lock-in contracts. Cancel any time.
        </p>
      </div>
    </section>

    <section className="pb-20">
      <div className="container mx-auto px-4 grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl">
        {tiers.map((t) => (
          <div
            key={t.name}
            className={`relative rounded-2xl p-8 border transition-all bg-card text-card-foreground hover:shadow-lg ${
              t.highlight ? "border-accent ring-2 ring-accent/20" : "border-border"
            }`}
          >
            {t.highlight && (
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-accent text-accent-foreground text-xs font-display uppercase tracking-wider px-3 py-1 rounded-full">
                Most Popular
              </span>
            )}
            <p className="text-xs uppercase tracking-wider mb-2 text-foreground/60">{t.tag}</p>
            <h3 className="font-display text-4xl uppercase tracking-wide mb-1">{t.name}</h3>
            <div className="mb-5">
              <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold bg-accent/10 text-accent border border-accent/20">
                <Clock className="h-3.5 w-3.5" />
                {t.rate}
              </span>
            </div>
            <div className="mb-6">
              <span className="font-display text-6xl">{t.price}</span>
              <span className="text-sm text-foreground/60"> /week</span>
            </div>
            <ul className="space-y-3 text-sm mb-7">
              {t.perks.map((p) => (
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
        ))}
      </div>
    </section>

    <section className="bg-primary text-primary-foreground py-12 sm:py-20">
      <div className="container mx-auto px-4 grid md:grid-cols-2 gap-10 max-w-5xl">
        <div className="bg-primary-foreground/5 border border-primary-foreground/10 rounded-xl p-8">
          <Sparkles className="h-8 w-8 text-accent mb-4" />
          <h3 className="font-display text-2xl uppercase tracking-wide mb-3">Member Perks</h3>
          <p className="text-primary-foreground/80 leading-relaxed">
            Priority access to the centre, all of the great golf tech it has to offer, weekly competitions,
            and the chance to sharpen your game whenever it suits you, rain or shine.
          </p>
        </div>
        <div className="bg-primary-foreground/5 border border-primary-foreground/10 rounded-xl p-8">
          <ShieldCheck className="h-8 w-8 text-accent mb-4" />
          <h3 className="font-display text-2xl uppercase tracking-wide mb-3">Satisfaction Guarantee</h3>
          <p className="text-primary-foreground/80 leading-relaxed">
            Not happy or struggling for time? Not a problem, we have no lock-in contracts and no scary terms and conditions.
          </p>
        </div>
      </div>
      <div className="text-center mt-12">
        <a
          href="https://hub.birdiesbayside.com.au/"
          className="inline-flex items-center gap-2 bg-accent hover:bg-accent/90 text-accent-foreground font-display tracking-wide uppercase px-8 py-4 rounded-md"
        >
          Join Now <ArrowRight className="h-4 w-4" />
        </a>
      </div>
    </section>

    <section className="py-12 sm:py-20">
      <div className="container mx-auto px-4 max-w-4xl text-center">
        <p className="text-accent font-display tracking-[0.2em] uppercase text-sm mb-3">Pay As You Go</p>
        <h2 className="font-display text-4xl sm:text-5xl text-primary leading-tight mb-4">
          Not ready to commit? Just pay to play.
        </h2>
        <p className="text-foreground/80 text-lg mb-10">
          We welcome Pay As You Go sessions at Birdies, same premium golf, no commitment, same easy booking and access platform as members. Bay pricing covers up to 4 players.
        </p>
        <div className="grid sm:grid-cols-2 gap-6 max-w-2xl mx-auto">
          <div className="bg-card border border-border rounded-xl p-7">
            <p className="text-sm uppercase tracking-wider text-foreground/60 mb-2">Off-Peak</p>
            <p className="font-display text-5xl text-primary">$30<span className="text-lg text-foreground/60">/hr</span></p>
            <p className="text-sm text-foreground/60 mt-2">Mon-Thu before 4pm</p>
          </div>
          <div className="bg-primary text-primary-foreground rounded-xl p-7">
            <p className="text-sm uppercase tracking-wider text-accent mb-2">Peak</p>
            <p className="font-display text-5xl">$35<span className="text-lg text-primary-foreground/70">/hr</span></p>
            <p className="text-sm text-primary-foreground/70 mt-2">Fri-Sun & Mon-Thu 4pm+</p>
          </div>
        </div>
      </div>
    </section>
  </MarketingLayout>
);

export default MarketingMembership;
