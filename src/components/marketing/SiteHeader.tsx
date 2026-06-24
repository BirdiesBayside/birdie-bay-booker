import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu, X } from "lucide-react";
import birdiesLogo from "@/assets/birdies-logo.png";

const nav = [
  { to: "/", label: "Home" },
  { to: "/about", label: "About" },
  { to: "/membership-info", label: "Membership" },
  { to: "/league-info", label: "Birdies League" },
  { to: "/contact", label: "Contact" },
  { to: "/faqs", label: "FAQs" },
  { to: "/gift", label: "Gift Cards" },
];

const SiteHeader = () => {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();

  return (
    <header className="sticky top-0 z-50 bg-primary text-primary-foreground shadow-sm">
      {/* Top utility bar */}
      <div className="bg-accent text-accent-foreground text-center text-xs sm:text-sm py-2 px-4 font-medium">
        OPEN 24/7 FOR MEMBERS  ·  STAFFED HOURS · 07 2146 8442
      </div>

      <div className="container mx-auto flex items-center justify-between py-3 px-4">
        <Link to="/" className="flex items-center gap-2" onClick={() => setOpen(false)}>
          <img src={birdiesLogo} alt="Birdies — Indoor Golf Redefined" className="h-10 sm:h-12" />
        </Link>

        <nav className="hidden lg:flex items-center gap-7">
          {nav.map((n) => {
            const active = pathname === n.to;
            return (
              <Link
                key={n.to}
                to={n.to}
                className={`font-display tracking-wide text-sm uppercase transition-colors ${
                  active ? "text-accent" : "text-primary-foreground hover:text-accent"
                }`}
              >
                {n.label}
              </Link>
            );
          })}
          <a
            href="https://hub.birdiesbayside.com.au/"
            className="ml-2 bg-accent hover:bg-accent/90 text-accent-foreground font-display tracking-wide text-sm uppercase px-5 py-2.5 rounded-md transition-colors"
          >
            Book Now
          </a>
        </nav>

        <button
          className="lg:hidden p-2 -mr-2"
          onClick={() => setOpen((o) => !o)}
          aria-label="Toggle menu"
        >
          {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {open && (
        <div className="lg:hidden border-t border-primary-foreground/10 bg-primary">
          <div className="container mx-auto px-4 py-4 flex flex-col gap-1">
            {nav.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                onClick={() => setOpen(false)}
                className={`font-display tracking-wide uppercase py-2.5 ${
                  pathname === n.to ? "text-accent" : "text-primary-foreground"
                }`}
              >
                {n.label}
              </Link>
            ))}
            <a
              href="https://hub.birdiesbayside.com.au/"
              className="mt-3 bg-accent text-accent-foreground font-display tracking-wide uppercase text-center px-5 py-3 rounded-md"
            >
              Book Now
            </a>
          </div>
        </div>
      )}
    </header>
  );
};

export default SiteHeader;
