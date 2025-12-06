import { Calendar, CreditCard, Trophy, Zap } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

const features = [
  {
    icon: Calendar,
    title: "Easy Booking",
    description: "Book your bay in seconds with our simple booking system. Choose your time, duration, and you're set.",
  },
  {
    icon: CreditCard,
    title: "Flexible Payments",
    description: "Pay as you go or save with a weekly membership. Cancel anytime with no lock-in contracts.",
  },
  {
    icon: Trophy,
    title: "World-Class Courses",
    description: "Play on 200+ championship courses from around the world. From St Andrews to Pebble Beach.",
  },
  {
    icon: Zap,
    title: "Latest Technology",
    description: "TrackMan-powered simulators with ball tracking, swing analysis, and real-time feedback.",
  },
];

export function FeaturesSection() {
  return (
    <section className="py-20">
      <div className="container px-4 md:px-6">
        <div className="text-center space-y-4 mb-12">
          <h2 className="font-display text-4xl md:text-5xl text-primary">
            WHY CHOOSE BIRDIES
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Experience golf like never before with our state-of-the-art facilities and premium service.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map((feature, index) => (
            <Card 
              key={index} 
              className="border-none shadow-md hover:shadow-lg transition-shadow"
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              <CardContent className="pt-6 space-y-4">
                <div className="h-12 w-12 rounded-lg bg-accent/10 flex items-center justify-center">
                  <feature.icon className="h-6 w-6 text-accent" />
                </div>
                <h3 className="font-semibold text-lg">{feature.title}</h3>
                <p className="text-muted-foreground text-sm">{feature.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}