import MarketingLayout from "@/components/marketing/MarketingLayout";
import { ArrowRight, Target, Clock, DollarSign, Trophy } from "lucide-react";
import simulatorBay from "@/assets/simulator-bay.png.asset.json";

const HERO = "https://birdiesbayside.com.au/cdn/shop/files/Birdies_Golf.jpg?v=1751956878&width=3840";

const MarketingAbout = () => (
  <MarketingLayout>
    <section className="relative h-[50vh] min-h-[360px] flex items-end overflow-hidden">
      <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${HERO})` }} />
      <div className="absolute inset-0 bg-gradient-to-t from-primary via-primary/70 to-primary/30" />
      <div className="relative container mx-auto px-4 pb-12">
        <p className="text-accent font-display tracking-[0.25em] uppercase text-sm mb-2">Our Story</p>
        <h1 className="font-display text-5xl sm:text-7xl text-primary-foreground leading-none">About Birdies</h1>
      </div>
    </section>

    <section className="py-20">
      <div className="container mx-auto px-4 grid lg:grid-cols-2 gap-12 items-center max-w-6xl">
        <div className="rounded-2xl overflow-hidden shadow-xl aspect-[4/3]">
          <img src={simulatorBay.url} alt="Birdies golf simulator bay" className="w-full h-full object-cover" />
        </div>
        <div>
          <h2 className="font-display text-4xl text-primary leading-tight mb-6">
            Golf has entered a new era , and it's happening indoors.
          </h2>
          <div className="space-y-4 text-foreground/80 text-lg leading-relaxed">
            <p>
              Thanks to major leaps in simulator technology, indoor golf is no longer just a substitute for the real thing.
              The game has changed, and we are going all in.
            </p>
            <p>
              We created Birdies to bring this revolution to life. Our space is all about giving our community the
              opportunity to practice, compete, and refine their game with ease.
            </p>
            <p>
              Whether you're working on your swing or playing with friends, Birdies makes golf more accessible, more
              flexible, and far more convenient. No more 5-hour rounds, no more getting rained off , just great golf,
              when it suits you.
            </p>
            <p className="font-display text-accent text-2xl pt-4">Indoor Golf, Redefined.</p>
          </div>
        </div>
      </div>
    </section>

    <section className="bg-primary text-primary-foreground py-20">
      <div className="container mx-auto px-4">
        <h2 className="font-display text-4xl sm:text-5xl text-center mb-14">High-Tech Golf Simulation</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto">
          {[
            { icon: Target, title: "Tour-Level Accuracy", body: "24 measured data points, impact video, swing analysis and immediate shot-to-show." },
            { icon: Clock, title: "Flexible Access", body: "Six fully automated bays , find the right time, every time." },
            { icon: DollarSign, title: "Affordable Memberships", body: "From $15/week. The more you play, the more you save." },
            { icon: Trophy, title: "Competitions & League", body: "Be part of the Birdies League and compete for prizes (Birdie/Eagle members)." },
          ].map((f) => (
            <div key={f.title} className="bg-primary-foreground/5 border border-primary-foreground/10 rounded-xl p-6">
              <div className="w-11 h-11 rounded-lg bg-accent/15 text-accent flex items-center justify-center mb-4">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="font-display text-lg tracking-wide uppercase mb-2">{f.title}</h3>
              <p className="text-primary-foreground/75 text-sm leading-relaxed">{f.body}</p>
            </div>
          ))}
        </div>
        <div className="text-center mt-12">
          <a
            href="https://hub.birdiesbayside.com.au/"
            className="inline-flex items-center gap-2 bg-accent hover:bg-accent/90 text-accent-foreground font-display tracking-wide uppercase px-7 py-3.5 rounded-md"
          >
            Join Now <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </div>
    </section>
  </MarketingLayout>
);

export default MarketingAbout;
