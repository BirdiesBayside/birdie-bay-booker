import MarketingLayout from "@/components/marketing/MarketingLayout";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Globe, CalendarDays, Zap, Trophy, ArrowRight } from "lucide-react";

const HERO = "https://birdiesbayside.com.au/cdn/shop/files/Untitled_design_42.png?v=1760070483&width=3840";

const features = [
  { icon: Globe, title: "Web Portal Access", body: "See every stat, every shot, every round on the go with our SGT web portal." },
  { icon: CalendarDays, title: "Weekly Rounds", body: "Play your weekly competition rounds whenever suits you." },
  { icon: Zap, title: "Seamless Play", body: "Book any bay and instantly access your own tournament rounds." },
  { icon: Trophy, title: "Prizes & Giveaways", body: "Win big — or small — with locally supported prizes and giveaways." },
];

const faqs = [
  {
    section: "General Information",
    items: [
      { q: "What is the Birdies League?", a: "The Birdies League is a members-only golf sim league that allows competitive play, tournament rounds, leaderboards, competitions and prizes." },
      { q: "How much does it cost to join?", a: "You gain entry to The Birdies League by joining as a member. Please note you must be a Birdie member or higher to gain access." },
    ],
  },
  {
    section: "Registration & Setup",
    items: [
      { q: "How do I join?", a: "You can join the league by scanning the QR code at Birdies. This will take you to the SGT Club registration where you can create your own account for future round tracking." },
      { q: "How do I play?", a: "Once you've created an SGT login, your name will be automatically synced to every bay at Birdies. Just hit ONLINE MATCH and choose your name from the dropdown to load your weekly rounds." },
      { q: "What if I can't make a certain day?", a: "There are no set tournament days at Birdies. You're free to play your 2 weekly rounds any time and your leaderboard status will update automatically." },
      { q: "What if I want to cancel?", a: "Just email us and we'll cancel your membership within 24 working hours. Your most recent weekly payment will not be refunded." },
    ],
  },
  {
    section: "Gameplay & Rules",
    items: [
      { q: "How many holes do I play each week?", a: "Each week you'll be required to play 2 full 18-hole rounds. These can be played on different days, or even resumed at different times if required." },
      { q: "What courses will I play?", a: "We always select the best courses to play each week. Some of our tours will be themed — for example we may run an Aussie tour that's only Australian courses." },
      { q: "Is there a handicap system?", a: "Yes. You'll be required to obtain your handicap in your first week by completing 'Q School'. Once you have your handicap you'll play the tour and get a net score for each round." },
      { q: "What if I hit an accidental shot or get a strange misread?", a: "Although we can edit scores, to ensure fair play all scores will be final. We recommend ensuring you are very comfortable with GSPRO and sim usage before competing in the Birdies League." },
    ],
  },
  {
    section: "Scoring & Standings",
    items: [
      { q: "How is scoring tracked?", a: "Scores are fully automated through GSPRO and the SGT. Your round results show at the end of the round and are visible online almost immediately." },
      { q: "Where can we see the leaderboard?", a: "The leaderboard is available in the online SGT portal — or you can see it on our Birdies TV located near the vending machine." },
      { q: "What if I miss a week?", a: "You won't gain any points for that week, but the leaderboards are cumulative, so missing one round won't be a huge disadvantage." },
      { q: "Are there prizes?", a: "Yes — we work with local businesses and have a rotating selection of prizes, including a monthly medal prize." },
    ],
  },
];

const MarketingLeague = () => (
  <MarketingLayout>
    <section className="relative h-[55vh] min-h-[400px] flex items-end overflow-hidden">
      <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${HERO})` }} />
      <div className="absolute inset-0 bg-gradient-to-t from-primary via-primary/80 to-primary/40" />
      <div className="relative container mx-auto px-4 pb-12">
        <p className="text-accent font-display tracking-[0.25em] uppercase text-sm mb-2">Members Only</p>
        <h1 className="font-display text-5xl sm:text-7xl text-primary-foreground leading-none">
          Welcome to the<br /><span className="text-accent">Birdies League</span>
        </h1>
      </div>
    </section>

    <section className="py-20">
      <div className="container mx-auto px-4 max-w-3xl text-center">
        <p className="text-lg text-foreground/80 leading-relaxed mb-8">
          The Birdies League is the ultimate place to be for golfers looking to show off their skills. Every member gets
          access to our own club, creating a great community and healthy competition. It's competitive, social, and the
          best way to get more out of every swing.
        </p>
        <a
          href="https://hub.birdiesbayside.com.au/embed/leaderboard"
          className="inline-flex items-center gap-2 bg-accent hover:bg-accent/90 text-accent-foreground font-display tracking-wide uppercase px-7 py-3.5 rounded-md"
        >
          View Leaderboard <ArrowRight className="h-4 w-4" />
        </a>
      </div>
    </section>

    <section className="bg-primary text-primary-foreground py-20">
      <div className="container mx-auto px-4 grid sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl">
        {features.map((f) => (
          <div key={f.title} className="bg-primary-foreground/5 border border-primary-foreground/10 rounded-xl p-6">
            <div className="w-11 h-11 rounded-lg bg-accent/15 text-accent flex items-center justify-center mb-4">
              <f.icon className="h-5 w-5" />
            </div>
            <h3 className="font-display text-lg tracking-wide uppercase mb-2">{f.title}</h3>
            <p className="text-primary-foreground/75 text-sm leading-relaxed">{f.body}</p>
          </div>
        ))}
      </div>
    </section>

    <section className="py-20">
      <div className="container mx-auto px-4 max-w-3xl">
        <p className="text-accent font-display tracking-[0.2em] uppercase text-sm mb-3 text-center">How does it work?</p>
        <h2 className="font-display text-4xl sm:text-5xl text-primary text-center leading-tight mb-12">
          Everything you need to know.
        </h2>

        {faqs.map((group) => (
          <div key={group.section} className="mb-10">
            <h3 className="font-display text-sm uppercase tracking-[0.2em] text-accent mb-4">{group.section}</h3>
            <Accordion type="single" collapsible className="space-y-2">
              {group.items.map((item, i) => (
                <AccordionItem
                  key={i}
                  value={`${group.section}-${i}`}
                  className="bg-card border border-border rounded-lg px-5"
                >
                  <AccordionTrigger className="font-display tracking-wide text-left hover:no-underline">
                    {item.q}
                  </AccordionTrigger>
                  <AccordionContent className="text-foreground/75 leading-relaxed">
                    {item.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        ))}
      </div>
    </section>
  </MarketingLayout>
);

export default MarketingLeague;
