import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu, X } from "lucide-react";
import birdiesLogo from "@/assets/birdies-logo.png";

const nav = [
  { to: "/", label: "Home" },
  { to: "/about", label: "About" },
  { to: "/membership-info", label: "Membership" },
  { to: "/league-info", label: "COMPETE" },
  { to: "/contact", label: "Contact" },
  { to: "/faqs", label: "FAQs" },
  { to: "/gift", label: "Gift Cards" },
];

const SiteHeader = () => {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <header className="sticky top-0 z-50 bg-primary text-primary-foreground shadow-sm">
      {/* Top announcement bar */}
      <div className="bg-accent text-accent-foreground text-center text-xs sm:text-sm py-2 px-4 font-bold uppercase tracking-wide">
        <Link to="/staffed-hours" className="hover:underline">Click Here For Staffed Hours</Link>
        {" | "}
        <a href="tel:0721468442" className="hover:underline">07 2146 8442</a>
      </div>

      <div className="container mx-auto flex items-center justify-between py-3 px-4 gap-3">
        {/* Mobile/tablet: burger on the left */}
        <button
          className="lg:hidden p-2 -ml-2 order-first"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
        >
          <Menu className="h-6 w-6" />
        </button>

        <Link to="/" className="flex items-center gap-2 lg:order-first">
          <img src={birdiesLogo} alt="Birdies, Indoor Golf Redefined" className="h-10 sm:h-12" />
        </Link>

        {/* Desktop: full nav */}
        <nav className="hidden lg:flex items-center gap-6 xl:gap-7">
          {nav.map((n) => {
            const active = pathname === n.to;
            return (
              <Link
                key={n.to}
                to={n.to}
                className={`font-display tracking-wide text-sm uppercase transition-colors whitespace-nowrap ${
                  active ? "text-accent" : "text-primary-foreground hover:text-accent"
                }`}
              >
                {n.label}
              </Link>
            );
          })}
          <a
            href="https://hub.birdiesbayside.com.au/"
            className="ml-2 bg-accent hover:bg-accent/90 text-accent-foreground font-display tracking-wide text-sm uppercase px-5 py-2.5 rounded-md transition-colors whitespace-nowrap"
          >
            Book Now
          </a>
        </nav>

        {/* Mobile/tablet: spacer to balance burger so logo stays roughly centered */}
        <div className="lg:hidden w-10" aria-hidden="true" />
      </div>

      {/* Mobile/tablet left-side drawer */}
      <div
        className={`lg:hidden fixed inset-0 z-[60] transition ${
          open ? "pointer-events-auto" : "pointer-events-none"
        }`}
        aria-hidden={!open}
      >
        {/* Backdrop */}
        <div
          className={`absolute inset-0 bg-black/60 transition-opacity duration-300 ${
            open ? "opacity-100" : "opacity-0"
          }`}
          onClick={() => setOpen(false)}
        />
        {/* Panel */}
        <aside
          className={`absolute left-0 top-0 h-full w-72 max-w-[85%] bg-primary text-primary-foreground shadow-xl transition-transform duration-300 ease-out ${
            open ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-primary-foreground/10">
            <img src={birdiesLogo} alt="Birdies" className="h-10" />
            <button
              className="p-2 -mr-2"
              onClick={() => setOpen(false)}
              aria-label="Close menu"
            >
              <X className="h-6 w-6" />
            </button>
          </div>
          <nav className="flex flex-col px-4 py-4 gap-1">
            {nav.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                className={`font-display tracking-wide uppercase py-3 border-b border-primary-foreground/10 ${
                  pathname === n.to ? "text-accent" : "text-primary-foreground"
                }`}
              >
                {n.label}
              </Link>
            ))}
            <a
              href="https://hub.birdiesbayside.com.au/"
              className="mt-4 bg-accent text-accent-foreground font-display tracking-wide uppercase text-center px-5 py-3 rounded-md"
            >
              Book Now
            </a>
          </nav>
        </aside>
      </div>
    </header>
  );
};

export default SiteHeader;
