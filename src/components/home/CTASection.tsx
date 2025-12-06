import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";

export function CTASection() {
  return (
    <section className="py-20 bg-primary">
      <div className="container px-4 md:px-6">
        <div className="max-w-3xl mx-auto text-center space-y-6">
          <h2 className="font-display text-4xl md:text-5xl text-primary-foreground">
            READY TO TEE OFF?
          </h2>
          <p className="text-primary-foreground/80 text-lg">
            Book your bay now and experience the future of golf. No membership required to get started.
          </p>
          <Button 
            asChild
            size="lg" 
            className="bg-accent text-accent-foreground hover:bg-accent/90 text-lg px-8"
          >
            <Link to="/book">
              Book Your Bay Now
              <ArrowRight className="ml-2 h-5 w-5" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}