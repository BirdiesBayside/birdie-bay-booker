import { MEMBERSHIP_TIERS, MembershipTier } from "@/types/booking";
import { MembershipCard } from "@/components/booking/MembershipCard";

export function MembershipSection() {
  const tierOrder: MembershipTier[] = ['visitor', 'par', 'birdie', 'eagle', 'albatross'];

  return (
    <section className="py-20 bg-secondary/30">
      <div className="container px-4 md:px-6">
        <div className="text-center space-y-4 mb-12">
          <h2 className="font-display text-4xl md:text-5xl text-primary">
            MEMBERSHIP TIERS
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Choose the membership that fits your game. From casual visitors to dedicated players, we have a tier for everyone.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 items-stretch">
          {tierOrder.map((tier) => (
            <MembershipCard
              key={tier}
              membership={MEMBERSHIP_TIERS[tier]}
              isPopular={tier === 'birdie'}
              onSelect={() => console.log(`Selected ${tier}`)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}