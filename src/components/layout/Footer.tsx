import { Link } from "react-router-dom";

export function Footer() {
  return (
    <footer className="bg-primary text-primary-foreground">
      <div className="container px-4 md:px-6 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="space-y-4">
            <span className="font-display text-2xl tracking-wide">BIRDIES</span>
            <p className="text-primary-foreground/70 text-sm">
              Premium golf simulator experiences. Practice, play, and perfect your game.
            </p>
          </div>

          {/* Quick Links */}
          <div className="space-y-4">
            <h4 className="font-semibold">Quick Links</h4>
            <nav className="flex flex-col gap-2">
              <Link to="/book" className="text-primary-foreground/70 hover:text-primary-foreground transition-colors text-sm">
                Book a Bay
              </Link>
              <Link to="/memberships" className="text-primary-foreground/70 hover:text-primary-foreground transition-colors text-sm">
                Memberships
              </Link>
              <Link to="/locations" className="text-primary-foreground/70 hover:text-primary-foreground transition-colors text-sm">
                Locations
              </Link>
            </nav>
          </div>

          {/* Support */}
          <div className="space-y-4">
            <h4 className="font-semibold">Support</h4>
            <nav className="flex flex-col gap-2">
              <Link to="/faq" className="text-primary-foreground/70 hover:text-primary-foreground transition-colors text-sm">
                FAQ
              </Link>
              <Link to="/contact" className="text-primary-foreground/70 hover:text-primary-foreground transition-colors text-sm">
                Contact Us
              </Link>
              <Link to="/terms" className="text-primary-foreground/70 hover:text-primary-foreground transition-colors text-sm">
                Terms & Conditions
              </Link>
            </nav>
          </div>

          {/* Contact */}
          <div className="space-y-4">
            <h4 className="font-semibold">Contact</h4>
            <div className="text-primary-foreground/70 text-sm space-y-1">
              <p>hello@birdies.golf</p>
              <p>1800 BIRDIES</p>
            </div>
          </div>
        </div>

        <hr className="border-primary-foreground/20 my-8" />

        <div className="flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-primary-foreground/60">
          <p>© {new Date().getFullYear()} Birdies. All rights reserved.</p>
          <div className="flex gap-4">
            <Link to="/privacy" className="hover:text-primary-foreground transition-colors">
              Privacy Policy
            </Link>
            <Link to="/terms" className="hover:text-primary-foreground transition-colors">
              Terms of Service
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}