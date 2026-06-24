import { Clock, Phone, AlertTriangle } from "lucide-react";
import { Link } from "react-router-dom";
import MarketingLayout from "@/components/marketing/MarketingLayout";

const hours = [
  { day: "Monday , Thursday", time: "4PM , 9PM" },
  { day: "Friday", time: "2PM , 9PM" },
  { day: "Saturday", time: "11AM , 9PM" },
  { day: "Sunday", time: "11AM , 5PM" },
];

const MarketingStaffedHours = () => {
  return (
    <MarketingLayout>
      {/* Hero */}
      <section className="bg-primary text-primary-foreground py-16 md:py-24">
        <div className="container mx-auto px-4 text-center">
          <h1 className="font-display text-5xl md:text-7xl tracking-wide uppercase">
            Staffed Hours
          </h1>
          <p className="mt-4 text-primary-foreground/80 max-w-2xl mx-auto">
            Open every day from <span className="text-accent font-semibold">5am , 11pm</span> for
            visitors and members.
          </p>
        </div>
      </section>

      {/* Opening + Staffed hours */}
      <section className="py-16 md:py-24 bg-background">
        <div className="container mx-auto px-4 grid md:grid-cols-2 gap-8 max-w-5xl">
          <div className="rounded-xl border border-border bg-card p-8 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <Clock className="h-6 w-6 text-accent" />
              <h2 className="font-display text-2xl uppercase tracking-wide">Opening Hours</h2>
            </div>
            <p className="text-4xl font-display tracking-wide text-primary">5AM , 11PM</p>
            <p className="text-muted-foreground mt-2">Every day, for visitors and members*.</p>
          </div>

          <div className="rounded-xl border border-border bg-card p-8 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <Clock className="h-6 w-6 text-accent" />
              <h2 className="font-display text-2xl uppercase tracking-wide">Staffed Hours</h2>
            </div>
            <ul className="divide-y divide-border">
              {hours.map((h) => (
                <li key={h.day} className="flex items-center justify-between py-3">
                  <span className="font-medium">{h.day}</span>
                  <span className="font-display tracking-wide text-primary">{h.time}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Automated centre note */}
      <section className="py-12 bg-muted/40">
        <div className="container mx-auto px-4 max-w-3xl text-center">
          <p className="text-muted-foreground">
            *Our centre is fully automated outside of staffed hours. This keeps visitor numbers low
            and makes self-service simple. Tech support is always available over the phone.
          </p>
          <a
            href="tel:0721468442"
            className="inline-flex items-center gap-2 mt-6 bg-accent hover:bg-accent/90 text-accent-foreground font-display tracking-wide uppercase px-6 py-3 rounded-md transition-colors"
          >
            <Phone className="h-4 w-4" />
            07 2146 8442
          </a>
        </div>
      </section>

      {/* No BYO */}
      <section className="py-16 bg-background">
        <div className="container mx-auto px-4 max-w-3xl">
          <div className="rounded-xl border-2 border-accent bg-accent/5 p-8 text-center">
            <div className="flex items-center justify-center gap-3 mb-3">
              <AlertTriangle className="h-6 w-6 text-accent" />
              <h2 className="font-display text-3xl uppercase tracking-wide text-primary">
                Strict No BYO
              </h2>
            </div>
            <p className="text-muted-foreground">
              Food and drinks are available on-site , please don't bring your own.
            </p>
          </div>

          <div className="text-center mt-10">
            <Link
              to="/contact"
              className="font-display uppercase tracking-wide text-accent hover:underline"
            >
              Questions? Get in touch →
            </Link>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
};

export default MarketingStaffedHours;
