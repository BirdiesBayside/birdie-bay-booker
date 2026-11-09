import { Link } from "react-router-dom";
import { ArrowUpRight, Cpu, GraduationCap, MapPin, Users, Layers, TrendingUp, Check } from "lucide-react";
import Seo from "@/components/Seo";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { Button } from "@/components/ui/button";
import venue from "@/assets/franchising/venue.asset.json";
import bay from "@/assets/franchising/bay.asset.json";
import lounge from "@/assets/franchising/lounge.asset.json";
import community from "@/assets/franchising/community.asset.json";

const Enquire = ({ text = "Explore your opportunity" }: { text?: string }) => <Button asChild size="lg" className="bg-accent text-accent-foreground hover:bg-accent/90 font-display uppercase h-12 rounded-sm px-6"><Link to="/franchising/enquire">{text}<ArrowUpRight /></Link></Button>;
const advantages = [
  { icon: MapPin, title: "A considered start", copy: "Site selection, lease guidance and a defined venue blueprint. Make the big establishment decisions with experienced support, rather than starting with a blank page." },
  { icon: Cpu, title: "Technology that connects", copy: "The Birdies Hub brings bookings, memberships, bay automation and player engagement together in one purpose-built platform. Built in-house, not pieced together." },
  { icon: GraduationCap, title: "Support beyond opening day", copy: "Training, operating manuals and ongoing technology support give you a framework to run your venue and a team to turn to as your business develops." },
  { icon: Layers, title: "A brand with a blueprint", copy: "A premium venue identity, established supplier relationships and ready-to-use marketing assets. Spend less time reinventing the essentials and more time building your local business." },
  { icon: TrendingUp, title: "Built around repeat play", copy: "Casual sessions bring players in. Memberships, leagues, competitions and events give them reasons to return. A connected model, not just a room full of simulators." },
  { icon: Users, title: "Your venue. A shared vision.", copy: "Bring your local knowledge and leadership to a brand built around playing as one. Help shape a growing Birdies community, with a vision for connected competition across venues." },
];

export default function MarketingFranchising() {
  return <MarketingLayout>
    <Seo title="Indoor Golf Simulator Franchise Australia | Birdies" description="Open an indoor golf simulator centre with Birdies. Explore our Australian franchise opportunity, venue design, automated booking technology and ongoing support." path="/franchising" />
    <section className="relative isolate overflow-hidden min-h-[500px] h-[72svh] max-h-[800px] flex items-end bg-venue-panel text-birdies-cream">
      <img src={venue.url} alt="Birdies indoor golf venue with three simulator bays and lounge seating" className="absolute inset-0 -z-20 h-full w-full object-cover object-center" fetchPriority="high" />
      <div className="absolute inset-0 -z-10 franchise-photo-shade" />
      <div className="max-w-7xl w-full mx-auto px-6 sm:px-10 pb-12 sm:pb-16 motion-safe:animate-fade-in">
        <p className="text-accent font-semibold text-xs uppercase mb-5">Indoor golf. Redefined.</p>
        <h1 className="text-5xl sm:text-7xl lg:text-8xl leading-[1.05] max-w-3xl">Birdies<br />Franchising<span className="text-accent">.</span></h1>
        <p className="max-w-lg text-base sm:text-lg leading-relaxed mt-6 mb-7 text-birdies-cream/90">Your own indoor golf simulator centre.<br />An Australian franchise. The Birdies system behind you.</p>
        <Enquire text="Become a franchise partner" />
      </div>
    </section>

    <section className="bg-birdies-green text-birdies-cream border-t border-birdies-cream/15">
      <div className="max-w-7xl mx-auto px-6 sm:px-10 py-8 sm:py-10 grid grid-cols-1 sm:grid-cols-2 gap-x-12 gap-y-6 sm:gap-y-8 text-xl sm:text-2xl lg:text-3xl leading-tight font-display uppercase">
        {["Purpose-built technology", "Automation-led operations", "Training & ongoing support", "Community at the core"].map(text => <div key={text} className="flex gap-4 items-center"><Check className="h-6 w-6 sm:h-7 sm:w-7 text-accent shrink-0" />{text}</div>)}
      </div>
    </section>

    <section className="bg-background py-16 sm:py-24">
      <div className="max-w-7xl mx-auto px-6 sm:px-10 grid lg:grid-cols-[1.15fr_1fr] gap-10 lg:gap-20">
        <div><p className="text-accent text-xs font-semibold uppercase mb-4">The business behind the bays</p><h2 className="text-4xl sm:text-5xl leading-tight">The simulator is<br />only the beginning.</h2></div>
        <div className="space-y-5 text-foreground/80 leading-relaxed"><p>Thinking about opening an indoor golf simulator centre in Australia? Building a venue that attracts players, turns them into regulars and keeps them coming back takes more than buying simulators.</p><p>Birdies brings the whole picture together: venue design, technology, automation, memberships, marketing and community. Developed in a real commercial venue in Redland Bay, Queensland, it’s a business system built around the experience on both sides of the bay.</p><p className="font-semibold text-foreground">Build your local business without building every system from scratch.</p></div>
      </div>
    </section>

    <section className="bg-venue-panel text-birdies-cream py-16 sm:py-24">
      <div className="max-w-7xl mx-auto px-6 sm:px-10">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6 mb-12"><div><p className="text-accent text-xs font-semibold uppercase mb-4">Why partner with Birdies?</p><h2 className="text-4xl sm:text-5xl leading-tight">Own the business.<br />Not every learning curve.</h2></div><Enquire text="Let’s talk franchising" /></div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-x-10 gap-y-10">
          {advantages.map(({ icon: Icon, title, copy }, index) => <article key={title} className="border-t border-birdies-cream/20 pt-6"><div className="flex justify-between items-center mb-6"><Icon className="text-accent h-7 w-7" /><span className="text-birdies-cream/40 text-xs">0{index + 1}</span></div><h3 className="font-display text-2xl uppercase mb-3">{title}</h3><p className="text-birdies-cream/70 text-sm leading-7">{copy}</p></article>)}
        </div>
      </div>
    </section>

    <section className="bg-background py-16 sm:py-24">
      <div className="max-w-7xl mx-auto px-6 sm:px-10">
        <div className="grid md:grid-cols-2 gap-5 mb-12"><figure><img src={bay.url} alt="Birdies simulator bay with ProTee launch monitor and shot analysis screen" className="w-full aspect-[4/3] object-cover" loading="lazy" /><figcaption className="py-3 text-xs uppercase font-semibold text-muted-foreground">Premium golf. Meaningful performance data.</figcaption></figure><figure><img src={lounge.url} alt="Birdies reception and social lounge with branded merchandise" className="w-full aspect-[4/3] object-cover" loading="lazy" /><figcaption className="py-3 text-xs uppercase font-semibold text-muted-foreground">A place to play. A reason to stay.</figcaption></figure></div>
        <div className="grid lg:grid-cols-2 gap-10 lg:gap-20"><h2 className="text-4xl sm:text-5xl leading-tight">Great golf.<br />A better experience.</h2><div><p className="text-foreground/80 leading-relaxed mb-6">Tour-quality simulator technology is only part of the appeal. Birdies combines serious practice with social golf, friendly competition and a welcoming venue experience. From first-time players to committed golfers, the model gives your community more ways to play, improve and connect.</p><Enquire text="Bring Birdies to your community" /></div></div>
      </div>
    </section>

    <section className="relative isolate bg-venue-panel text-birdies-cream overflow-hidden">
      <img src={community.url} alt="Birdies branded table and refreshments overlooking a golf simulator" className="absolute inset-0 -z-20 w-full h-full object-cover" loading="lazy" />
      <div className="absolute inset-0 -z-10 franchise-photo-shade" />
      <div className="max-w-7xl mx-auto px-6 sm:px-10 py-20 sm:py-28"><div className="max-w-xl"><p className="text-accent text-xs font-semibold uppercase mb-4">The right partnership</p><h2 className="text-4xl sm:text-5xl leading-tight">Local leadership.<br />Birdies backing.</h2><p className="mt-6 mb-5 leading-relaxed text-birdies-cream/90">You bring the drive, commercial discipline and a genuine interest in golf and community. We bring the design, systems, training and support.</p><p className="mb-8 leading-relaxed text-birdies-cream/90">Whether you’re a hands-on owner-operator or a commercially engaged investor, your role is to build the local culture, grow the player base and uphold the Birdies standard.</p><Enquire text="Start the conversation" /></div></div>
    </section>

    <section className="bg-background py-16 sm:py-24">
      <div className="max-w-7xl mx-auto px-6 sm:px-10 grid lg:grid-cols-[0.8fr_1.2fr] gap-10 lg:gap-20">
        <div><p className="text-accent text-xs font-semibold uppercase mb-4">Explore the opportunity</p><h2 className="text-4xl sm:text-5xl leading-tight">Opening an indoor<br />golf centre?</h2><p className="mt-6 text-foreground/80 leading-relaxed">A few things to consider when choosing how to build your golf simulator business.</p></div>
        <div className="space-y-7">
          {[
            ["Why choose an indoor golf franchise instead of going it alone?", "An independent centre means creating your own brand, choosing suppliers and connecting your booking, membership and operating systems. A Birdies franchise brings these elements together with a venue blueprint, training and ongoing support, while you lead your local business."],
            ["What support does Birdies provide to open a golf simulator centre?", "Support covers site selection and lease guidance, venue design, supplier relationships, technology, operator training and marketing assets. The Birdies Hub connects bookings, memberships and bay automation, with ongoing technology and operational support."],
            ["Do I need to have a location secured?", "You can start by sharing the suburb or region you have in mind. Site selection support is part of the Birdies model, and your proposed location can be discussed with the team during the enquiry process."],
            ["What does it cost to start an indoor golf franchise?", "Investment depends on the site, venue size, fitout and equipment requirements. Share your investment range in the enquiry form so the team can discuss your plans. Detailed cost ranges, fees and disclosure information are provided during the franchise process."],
          ].map(([question, answer]) => <article key={question} className="border-t border-border pt-6"><h3 className="text-xl sm:text-2xl mb-3">{question}</h3><p className="text-foreground/80 leading-relaxed text-sm sm:text-base">{answer}</p></article>)}
          <p className="text-sm text-muted-foreground">Looking for somewhere to play instead? <Link to="/about" className="text-accent underline">Explore our Redland Bay indoor golf centre</Link>.</p>
        </div>
      </div>
    </section>

    <section className="bg-birdies-green text-birdies-cream py-16 sm:py-24">
      <div className="max-w-7xl mx-auto px-6 sm:px-10"><div className="grid lg:grid-cols-2 gap-12"><div><p className="text-accent text-xs font-semibold uppercase mb-4">Your next chapter</p><h2 className="text-4xl sm:text-5xl leading-tight">Let’s see what<br />we can build together.</h2><p className="my-6 text-birdies-cream/80 leading-relaxed max-w-md">Tell us where you’d like to open and a little about your plans. We’ll explore the opportunity together, before you make any commitment.</p><Enquire text="Enquire about franchising" /></div><ol className="space-y-0">{[["Make an enquiry", "Share your preferred location and investment range."], ["Meet the Birdies team", "Discuss your goals, the model and whether we’re a good fit."], ["Explore the details", "Move into discovery, detailed information and independent due diligence."]].map(([title, copy], i) => <li key={title} className="flex gap-5 py-6 border-t border-birdies-cream/20"><span className="font-display text-accent text-3xl">0{i + 1}</span><div><h3 className="text-xl uppercase mb-2">{title}</h3><p className="text-sm text-birdies-cream/75 leading-relaxed">{copy}</p></div></li>)}</ol></div><p className="mt-14 pt-6 border-t border-birdies-cream/20 text-xs text-birdies-cream/60 leading-relaxed">Franchising is a business investment and involves risk. Outcomes depend on location, investment, local demand and operator performance. Full terms, costs and disclosure information are provided during the franchise process. Seek independent legal, financial and business advice before committing.</p></div>
    </section>
  </MarketingLayout>;
}