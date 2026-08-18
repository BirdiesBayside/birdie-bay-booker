import { useState } from "react";
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
import { CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import Seo from "@/components/Seo";
import birdiesLogo from "@/assets/birdies-logo.png";

const SHIRT_SIZES = ["S", "M", "L", "XL", "2XL", "3XL"];

const schema = z.object({
  name: z.string().trim().min(2, "Please enter your full name").max(100),
  email: z.string().trim().email("Enter a valid email address").max(255),
  phone: z
    .string()
    .trim()
    .min(8, "Enter a valid contact number")
    .max(20, "Enter a valid contact number"),
  shirt_size: z.string().min(1, "Select a shirt size"),
});

const SimCupRegister = () => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [shirtSize, setShirtSize] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse({ name, email, phone, shirt_size: shirtSize });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }

    setSubmitting(true);
    const { error } = await supabase.from("sim_cup_registrations").insert([
      {
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        shirt_size: shirtSize,
      },
    ]);
    setSubmitting(false);

    if (error) {
      console.error("Sim Cup registration failed:", error);
      toast.error("Something went wrong. Please try again.");
      return;
    }
    setSubmitted(true);
  };

  return (
    <div className="min-h-screen bg-background">
      <Seo
        title="The Sim Cup Registration | Birdies Bayside"
        description="Register to represent Birdies at The Sim Cup on Saturday 26 September 2026. Birdies vs The Tee Lounge — $99 entry, team shirt included."
        path="/sim-cup"
      />

      <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col justify-center px-5 py-12">
        <img src={birdiesLogo} alt="Birdies Bayside" className="mb-10 h-10 self-start" />

        <p className="text-xs font-black uppercase tracking-[0.25em] text-accent">
          You're invited
        </p>
        <h1 className="mt-3 font-display text-6xl uppercase leading-none tracking-wide text-primary sm:text-7xl">
          The Sim Cup
        </h1>
        <div className="mt-4 h-[5px] w-16 bg-accent" />

        <p className="mt-6 text-primary/85">
          Birdies vs The Tee Lounge, right here on our turf. 18 spots. Multiple formats
          across the day — 2-man teams and individual head to head. Cash prizes and
          bragging rights on the line.
        </p>

        <div className="mt-7 grid gap-5 rounded-lg bg-secondary p-6 sm:grid-cols-3">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-accent">When</p>
            <p className="mt-1 font-bold text-primary">Sat 26 Sep 2026</p>
            <p className="text-sm text-primary/70">Daytime (times TBC)</p>
          </div>
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-accent">Entry</p>
            <p className="mt-1 font-bold text-primary">$99 on arrival</p>
            <p className="text-sm text-primary/70">
              Bay time, food, first drink and team t-shirt included.
            </p>
          </div>
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-accent">
              Lock it in by
            </p>
            <p className="mt-1 font-bold text-primary">1 September 2026</p>
            <p className="text-sm text-primary/70">First in, best dressed.</p>
          </div>
        </div>

        {submitted ? (
          <section className="mt-8 rounded-lg bg-secondary p-8 text-center">
            <CheckCircle2 className="mx-auto mb-4 h-14 w-14 text-primary" />
            <h2 className="font-display text-3xl uppercase text-primary">You're in</h2>
            <p className="mt-2 text-primary/75">
              Your spot is registered and your shirt size is locked in. We'll be in touch
              with the run sheet closer to the day.
            </p>
            <p className="mt-4 text-sm text-primary/60">
              Need to change something? Email info@birdiesbayside.com.au
            </p>
          </section>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="mt-8 space-y-5 rounded-lg bg-secondary p-6 sm:p-8"
          >
            <h2 className="font-display text-3xl uppercase text-primary">Register to play</h2>

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
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone" className="text-primary">Contact number</Label>
              <Input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                maxLength={20}
                autoComplete="tel"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="shirt" className="text-primary">
                Shirt size <span className="text-primary/60">(AS Colour tee sizing)</span>
              </Label>
              <Select value={shirtSize} onValueChange={setShirtSize}>
                <SelectTrigger id="shirt">
                  <SelectValue placeholder="Select your size" />
                </SelectTrigger>
                <SelectContent>
                  {SHIRT_SIZES.map((size) => (
                    <SelectItem key={size} value={size}>
                      {size}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button
              type="submit"
              disabled={submitting}
              className="w-full bg-accent font-black uppercase tracking-[0.15em] text-accent-foreground hover:bg-accent/90"
              size="lg"
            >
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Lock in my spot
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

export default SimCupRegister;
