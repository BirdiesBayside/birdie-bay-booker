import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { ArrowRight, Clock, MapPin, Users } from "lucide-react";

export function HeroSection() {
  return (
    <section className="relative overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 gradient-green opacity-95" />
      
      {/* Pattern overlay */}
      <div 
        className="absolute inset-0 opacity-10"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        }}
      />

      <div className="relative container px-4 md:px-6 py-20 md:py-32">
        <div className="max-w-3xl mx-auto text-center space-y-8">
          <h1 className="font-display text-5xl md:text-7xl text-primary-foreground tracking-wide animate-fade-in">
            PERFECT YOUR SWING
          </h1>
          
          <p className="text-xl md:text-2xl text-primary-foreground/80 max-w-2xl mx-auto animate-fade-in" style={{ animationDelay: "0.1s" }}>
            Book premium golf simulator bays. Practice on world-famous courses, rain or shine.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center animate-fade-in" style={{ animationDelay: "0.2s" }}>
            <Button 
              asChild
              size="lg" 
              className="bg-accent text-accent-foreground hover:bg-accent/90 text-lg px-8"
            >
              <Link to="/book">
                Book a Bay
                <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
            </Button>
            <Button 
              asChild
              variant="outline" 
              size="lg"
              className="border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10 text-lg px-8"
            >
              <Link to="/memberships">
                View Memberships
              </Link>
            </Button>
          </div>

          {/* Quick stats */}
          <div className="grid grid-cols-3 gap-6 pt-8 animate-fade-in" style={{ animationDelay: "0.3s" }}>
            <div className="text-center space-y-1">
              <div className="flex justify-center">
                <MapPin className="h-6 w-6 text-accent" />
              </div>
              <div className="font-display text-2xl text-primary-foreground">6</div>
              <div className="text-sm text-primary-foreground/70">Premium Bays</div>
            </div>
            <div className="text-center space-y-1">
              <div className="flex justify-center">
                <Clock className="h-6 w-6 text-accent" />
              </div>
              <div className="font-display text-2xl text-primary-foreground">14</div>
              <div className="text-sm text-primary-foreground/70">Hours Daily</div>
            </div>
            <div className="text-center space-y-1">
              <div className="flex justify-center">
                <Users className="h-6 w-6 text-accent" />
              </div>
              <div className="font-display text-2xl text-primary-foreground">5</div>
              <div className="text-sm text-primary-foreground/70">Membership Tiers</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}