import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CheckCircle2, Loader2, CreditCard, Store } from "lucide-react";
import { toast } from "sonner";
import Seo from "@/components/Seo";
import simCupLogoAsset from "@/assets/sim-cup-logo.png.asset.json";

const TIMESLOTS = ["8-11am", "11am-2pm", "2-5pm"];
const FULLY_BOOKED_SLOTS = new Set(["8-11am"]);

const schema = z.object({
  name: z.string().trim().min(2, "Please enter your full name").max(100),
  email: z.string().trim().email("Enter a valid email address").max(255),
  preferred_timeslot: z.string().min(1, "Select a preferred timeslot"),
});

const SimCupConfirm = () => {
  const [params] = useSearchParams();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [timeslot, setTimeslot] = useState("");
  const [payChoice, setPayChoice] = useState<"now" | "venue">("now");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<"paid" | "venue" | null>(null);

  useEffect(() => {
    if (params.get("success") === "1") setDone("paid");
    if (params.get("cancelled") === "1") {
      toast.error("Payment cancelled — nothing has been charged.");
    }
  }, [params]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse({ name, email, preferred_timeslot: timeslot });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }

    setSubmitting(true);
    const { data, error } = await supabase.functions.invoke("sim-cup-confirm", {
      body: {
        name: name.trim(),
        email: email.trim(),
        preferred_timeslot: timeslot,
        pay_now: payChoice === "now",
      },
    });
    setSubmitting(false);

    if (error || (data as { error?: string })?.error) {
      console.error("Sim Cup confirm failed:", error);
      toast.error("Something went wrong. Please try again.");
      return;
    }

    const url = (data as { url?: string | null })?.url;
    if (url) {
      window.location.href = url;
      return;
    }

    setDone("venue");
  };

  return (
    <div className="min-h-screen bg-primary">
      <Seo
        title="The Sim Cup — Timeslot & Payment | Birdies Bayside"
        description="Stage two of your Sim Cup registration: choose your preferred timeslot and pay your $99 entry now or at Birdies on the day."
        path="/sim-cup-confirm"
      />

      <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col justify-center px-5 py-12">
        <img
          src={simCupLogoAsset.url}
          alt="Birdies Bayside"
          className="mx-auto mb-8 h-16 w-auto max-w-xs object-contain"
        />

        <p className="text-center text-xs font-black uppercase tracking-[0.25em] text-accent">
          Stage two
        </p>
        <h1 className="mt-3 font-display text-6xl uppercase leading-none tracking-wide text-primary-foreground sm:text-7xl">
          Timeslot &amp; Entry
        </h1>
        <div className="mt-4 h-[5px] w-16 bg-accent" />

        <p className="mt-6 text-primary-foreground/85">
          You're registered — now lock in your preferred timeslot and sort your $99 entry. Pay
          online now, or pay at Birdies when you arrive.
        </p>

        {done ? (
          <section className="mt-8 rounded-lg bg-background p-8 text-center">
            <CheckCircle2 className="mx-auto mb-4 h-14 w-14 text-primary" />
            <h2 className="font-display text-3xl uppercase text-primary">
              {done === "paid" ? "Paid and locked in" : "All set"}
            </h2>
            <p className="mt-2 text-primary/75">
              {done === "paid"
                ? "Your $99 entry is paid and your timeslot preference is recorded. We'll confirm your group closer to the day."
                : "Your timeslot preference is recorded. Your $99 entry is payable at Birdies on the day."}
            </p>
            <p className="mt-4 text-sm text-primary/60">
              Need to change something? Email info@birdiesbayside.com.au
            </p>
            <p className="mt-3 text-xs text-primary/50">
              Sim Cup bays are streamed live to a public page on the day.
            </p>
          </section>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="mt-8 space-y-5 rounded-lg bg-background p-6 sm:p-8"
          >
            <h2 className="font-display text-3xl uppercase text-primary">Your details</h2>

            <div className="space-y-2">
              <Label htmlFor="name" className="text-primary">Full name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={100}
                autoComplete="name"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email" className="text-primary">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                maxLength={255}
                autoComplete="email"
                required
              />
              <p className="text-xs text-primary/60">
                Use the same email you registered with.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="timeslot" className="text-primary">Preferred timeslot</Label>
              <Select value={timeslot} onValueChange={setTimeslot}>
                <SelectTrigger id="timeslot">
                  <SelectValue placeholder="Select your preferred timeslot" />
                </SelectTrigger>
                <SelectContent>
                  {TIMESLOTS.map((slot) => (
                    <SelectItem key={slot} value={slot}>
                      {slot}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-primary/70">
                Please note: break for lunch is 12–1pm. This is a <em>preference</em> only — we
                can't guarantee everyone gets the slot they want, but we'll do our best to
                accommodate everyone. Please call us if you can absolutely only make one
                particular slot.
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-primary">Entry — $99</Label>
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setPayChoice("now")}
                  className={`rounded-lg border-2 p-4 text-left transition ${
                    payChoice === "now"
                      ? "border-accent bg-accent/10"
                      : "border-border hover:border-primary/40"
                  }`}
                >
                  <CreditCard className="mb-2 h-5 w-5 text-accent" />
                  <p className="font-bold text-primary">Pay now</p>
                  <p className="text-sm text-primary/70">Secure card payment, done and dusted.</p>
                </button>
                <button
                  type="button"
                  onClick={() => setPayChoice("venue")}
                  className={`rounded-lg border-2 p-4 text-left transition ${
                    payChoice === "venue"
                      ? "border-accent bg-accent/10"
                      : "border-border hover:border-primary/40"
                  }`}
                >
                  <Store className="mb-2 h-5 w-5 text-accent" />
                  <p className="font-bold text-primary">Pay at Birdies</p>
                  <p className="text-sm text-primary/70">Settle up when you arrive on the day.</p>
                </button>
              </div>
            </div>

            <Button
              type="submit"
              disabled={submitting}
              className="w-full bg-accent font-black uppercase tracking-[0.15em] text-accent-foreground hover:bg-accent/90"
              size="lg"
            >
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {payChoice === "now" ? "Pay $99 & confirm" : "Confirm my timeslot"}
            </Button>
          </form>
        )}

        <p className="mt-8 text-center font-bold text-primary-foreground">
          Let's take the cup home.
        </p>
      </main>
    </div>
  );
};

export default SimCupConfirm;
