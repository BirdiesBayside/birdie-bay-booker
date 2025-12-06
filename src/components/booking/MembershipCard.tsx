import { MembershipPricing } from "@/types/booking";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface MembershipCardProps {
  membership: MembershipPricing;
  isPopular?: boolean;
  onSelect?: () => void;
}

export function MembershipCard({ membership, isPopular, onSelect }: MembershipCardProps) {
  const isVisitor = membership.tier === 'visitor';

  return (
    <Card className={cn(
      "relative flex flex-col transition-all duration-300 hover:shadow-lg",
      isPopular && "border-accent border-2 shadow-lg scale-105"
    )}>
      {isPopular && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-accent text-accent-foreground text-xs font-semibold px-3 py-1 rounded-full">
          Most Popular
        </div>
      )}
      
      <CardHeader className="text-center pb-2">
        <CardTitle className="font-display text-2xl">{membership.name}</CardTitle>
        <CardDescription>{membership.description}</CardDescription>
      </CardHeader>

      <CardContent className="flex-1 space-y-6">
        {/* Pricing */}
        <div className="text-center space-y-1">
          {!isVisitor && (
            <div className="text-muted-foreground text-sm">
              <span className="text-3xl font-bold text-foreground">${membership.weeklyFee}</span>
              <span>/week</span>
            </div>
          )}
          <div className={cn(
            "font-semibold",
            isVisitor ? "text-3xl" : "text-lg text-accent"
          )}>
            ${membership.hourlyRate}/hr
          </div>
        </div>

        {/* Features */}
        <ul className="space-y-2">
          {membership.features.map((feature, index) => (
            <li key={index} className="flex items-start gap-2 text-sm">
              <Check className="h-4 w-4 text-accent shrink-0 mt-0.5" />
              <span>{feature}</span>
            </li>
          ))}
        </ul>
      </CardContent>

      <CardFooter>
        <Button 
          onClick={onSelect}
          className={cn(
            "w-full",
            isPopular 
              ? "bg-accent text-accent-foreground hover:bg-accent/90" 
              : "bg-primary text-primary-foreground hover:bg-primary/90"
          )}
        >
          {isVisitor ? "Book as Visitor" : "Join Now"}
        </Button>
      </CardFooter>
    </Card>
  );
}