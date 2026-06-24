import { Link } from "react-router-dom";
import { Phone, Mail, MapPin, Facebook, Instagram } from "lucide-react";
import birdiesLogo from "@/assets/birdies-logo.png";

const SiteFooter = () => {
  return (
    <footer className="bg-primary text-primary-foreground mt-20">
      <div className="container mx-auto px-4 py-14 grid gap-10 md:grid-cols-4">
        <div className="md:col-span-1">
          <img src={birdiesLogo} alt="Birdies" className="h-14 mb-4" />
          <p className="text-primary-foreground/70 text-sm leading-relaxed">
            Redland Bay's premier indoor golf centre. Play, practice and compete, rain or shine.
          </p>
          <div className="flex gap-3 mt-5">
            <a
              href="https://www.facebook.com/share/1BtmvKBthA/?mibextid=wwXIfr"
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
        </div>

        <div>
          <h3 className="font-display tracking-wide uppercase text-accent mb-4">Explore</h3>
          <ul className="space-y-2 text-sm">
            <li><Link to="/about" className="hover:text-accent transition-colors">About Us</Link></li>
            <li><Link to="/membership-info" className="hover:text-accent transition-colors">Membership</Link></li>
            <li><Link to="/compete-info" className="hover:text-accent transition-colors">Compete</Link></li>
            <li><Link to="/faqs" className="hover:text-accent transition-colors">FAQs</Link></li>
            <li><Link to="/gift" className="hover:text-accent transition-colors">Gift Cards</Link></li>
          </ul>
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
          <h3 className="font-display tracking-wide uppercase text-accent mb-4">Members</h3>
          <p className="text-sm text-primary-foreground/85 mb-4">
            Book bays, view scores and manage your membership in The Birdies Hub.
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
