import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { User, Menu } from "lucide-react";
import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from "@/components/ui/sheet";

export function Header() {
  const [isOpen, setIsOpen] = useState(false);

  const navLinks = [
    { href: "/book", label: "Book a Bay" },
    { href: "/memberships", label: "Memberships" },
    { href: "/locations", label: "Locations" },
  ];

  return (
    <header className="sticky top-0 z-50 w-full bg-primary shadow-lg">
      <div className="container flex h-16 items-center justify-between px-4 md:px-6">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2">
          <span className="font-display text-2xl tracking-wide text-primary-foreground">
            BIRDIES
          </span>
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-6">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              to={link.href}
              className="text-primary-foreground/80 hover:text-primary-foreground transition-colors font-medium"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Desktop Auth Buttons */}
        <div className="hidden md:flex items-center gap-3">
          <Button variant="ghost" size="sm" className="text-primary-foreground hover:bg-primary-foreground/10">
            <User className="h-4 w-4 mr-2" />
            Sign In
          </Button>
          <Button size="sm" className="bg-accent text-accent-foreground hover:bg-accent/90">
            Book Now
          </Button>
        </div>

        {/* Mobile Menu */}
        <Sheet open={isOpen} onOpenChange={setIsOpen}>
          <SheetTrigger asChild className="md:hidden">
            <Button variant="ghost" size="icon" className="text-primary-foreground">
              <Menu className="h-6 w-6" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="bg-primary border-primary">
            <nav className="flex flex-col gap-4 mt-8">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  to={link.href}
                  onClick={() => setIsOpen(false)}
                  className="text-primary-foreground/80 hover:text-primary-foreground transition-colors font-medium text-lg py-2"
                >
                  {link.label}
                </Link>
              ))}
              <hr className="border-primary-foreground/20 my-2" />
              <Button variant="ghost" className="justify-start text-primary-foreground hover:bg-primary-foreground/10">
                <User className="h-4 w-4 mr-2" />
                Sign In
              </Button>
              <Button className="bg-accent text-accent-foreground hover:bg-accent/90">
                Book Now
              </Button>
            </nav>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}