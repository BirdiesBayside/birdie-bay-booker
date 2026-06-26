import { Phone, Mail, MapPin, Facebook, Instagram } from "lucide-react";
import birdiesLogo from "@/assets/birdies-logo.png";

const APP_STORE_BADGE_URL =
  "https://tools.applemediaservices.com/api/badges/download-on-the-app-store/white/en-au?size=250x83";

const SiteFooter = () => {
  return (
    <footer className="bg-primary text-primary-foreground mt-20">
      <div className="container mx-auto px-4 py-14 grid gap-10 md:grid-cols-3">
        <div>
          <img src={birdiesLogo} alt="Birdies" className="h-14 mb-4" />
          <p className="text-primary-foreground/70 text-sm leading-relaxed">
            Redland Bay's premier indoor golf centre. Play, practice and compete, rain or shine.
          </p>
          <div className="flex gap-3 mt-5">
            <a
              href="https://www.facebook.com/p/Birdies-Bayside-61577186327753/"
              target="_blank"
              rel="noreferrer"
              aria-label="Facebook"
              className="bg-primary-foreground/10 hover:bg-accent transition-colors p-2 rounded-full"
            >
              <Facebook className="h-4 w-4" />
            </a>
            <a
              href="https://www.instagram.com/birdiesbayside"
              target="_blank"
              rel="noreferrer"
              aria-label="Instagram"
              className="bg-primary-foreground/10 hover:bg-accent transition-colors p-2 rounded-full"
            >
              <Instagram className="h-4 w-4" />
            </a>
          </div>
          <a
            href="https://apps.apple.com/au/app/birdies-hub/id6758370714"
            target="_blank"
            rel="noreferrer"
            className="inline-block mt-5"
          >
            <img
              src={APP_STORE_BADGE_URL}
              alt="Download Birdies Hub on the App Store"
              className="h-10 w-auto"
            />
          </a>
        </div>

        <div>
          <h3 className="font-display tracking-wide uppercase text-accent mb-4">Visit</h3>
          <ul className="space-y-3 text-sm text-primary-foreground/85">
            <li className="flex gap-3"><MapPin className="h-4 w-4 mt-0.5 shrink-0 text-accent" /><span>Unit 2, 86 Jardine Drive, Redland Bay QLD 4165</span></li>
            <li className="flex gap-3"><Phone className="h-4 w-4 mt-0.5 shrink-0 text-accent" /><a href="tel:0721468442" className="hover:text-accent">(07) 2146 8442</a></li>
            <li className="flex gap-3"><Mail className="h-4 w-4 mt-0.5 shrink-0 text-accent" /><a href="mailto:info@birdiesbayside.com.au" className="hover:text-accent">info@birdiesbayside.com.au</a></li>
          </ul>
        </div>

        <div>
          <h3 className="font-display tracking-wide uppercase text-accent mb-4">Play</h3>
          <p className="text-sm text-primary-foreground/85 mb-4">
            Book and manage your sessions, become a member, all in The Birdies Hub.
          </p>
          <a
            href="https://hub.birdiesbayside.com.au/"
            className="inline-block bg-accent hover:bg-accent/90 text-accent-foreground font-display tracking-wide uppercase text-sm px-5 py-2.5 rounded-md"
          >
            Open The Hub
          </a>
        </div>
      </div>

      <div className="border-t border-primary-foreground/10">
        <div className="container mx-auto px-4 py-5 flex flex-col sm:flex-row items-center justify-between text-xs text-primary-foreground/60 gap-2">
          <p>© {new Date().getFullYear()} Birdies Bayside. All rights reserved.</p>
          <p>Indoor Golf, Redefined.</p>
        </div>
      </div>
    </footer>
  );
};

export default SiteFooter;
