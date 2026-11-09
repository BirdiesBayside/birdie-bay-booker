import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ArrowUpRight, CheckCircle2, Loader2 } from "lucide-react";
import { FunctionsHttpError } from "@supabase/supabase-js";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import Seo from "@/components/Seo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { franchiseEnquirySchema, investmentBudgets } from "../../../supabase/functions/_shared/franchise-enquiry";
import { supabase } from "@/integrations/supabase/client";

export default function FranchiseEnquiry() {
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const parsed = franchiseEnquirySchema.safeParse(values);
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Please check your details"); return; }
    setBusy(true); setError("");
    try {
      const { data, error: invokeError } = await supabase.functions.invoke("franchise-enquiry", { body: parsed.data });
      if (invokeError) {
        if (invokeError instanceof FunctionsHttpError) {
          const details = await invokeError.context.json();
          throw new Error(details.error ?? "Unable to submit your enquiry. Please try again.");
        }
        throw invokeError;
      }
      if (!data?.success) throw new Error("Unable to submit your enquiry. Please try again.");
      setSubmitted(true);
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to submit your enquiry. Please try again."); }
    finally { setBusy(false); }
  };
  return <MarketingLayout>
    <Seo title="Franchise Enquiry | Birdies" description="Tell the Birdies team about your proposed franchise location and investment plans." path="/franchising/enquire" noindex />
    <section className="bg-birdies-green text-birdies-cream py-12 sm:py-16"><div className="max-w-5xl mx-auto px-6"><Link to="/franchising" className="inline-flex gap-2 items-center text-sm text-birdies-cream/70 mb-7"><ArrowLeft className="w-4 h-4" />Birdies Franchising</Link><p className="text-accent uppercase text-xs font-semibold mb-4">Start the conversation</p><h1 className="text-4xl sm:text-6xl leading-tight">Your Birdies opportunity.</h1></div></section>
    <section className="max-w-5xl mx-auto px-6 py-12 sm:py-16">
      {submitted ? <div className="py-10 max-w-xl" role="status"><CheckCircle2 className="text-accent h-12 w-12 mb-6" /><h2 className="text-3xl sm:text-4xl mb-4">Your enquiry is in.</h2><p className="text-foreground/75 leading-relaxed mb-8">Thank you for your interest in Birdies. Your details have been received by the franchise team.</p><Button asChild><Link to="/franchising">Back to franchising<ArrowLeft /></Link></Button></div> : <div className="grid md:grid-cols-[0.75fr_1.25fr] gap-10 md:gap-16"><div><h2 className="text-3xl mb-5">Let’s get to know you.</h2><p className="text-foreground/75 leading-relaxed">We’d love to hear from you. Share a little about yourself and where you’d like to bring Birdies, and our team will be in touch to explore the possibilities.</p><a className="block mt-6 text-sm text-accent break-all" href="mailto:franchising@birdiesbayside.com.au">franchising@birdiesbayside.com.au</a></div><form onSubmit={submit} className="space-y-5">
        {[{ name: "name", label: "Name", type: "text", max: 100, auto: "name" }, { name: "email", label: "Email", type: "email", max: 255, auto: "email" }, { name: "phone", label: "Phone", type: "tel", max: 30, auto: "tel" }, { name: "region", label: "State / Region", type: "text", max: 100, auto: "address-level1" }, { name: "location", label: "Desired Franchise Location", type: "text", max: 200, auto: "off" }].map(field => <div key={field.name}><Label htmlFor={field.name} className="block mb-2">{field.label}</Label><Input id={field.name} name={field.name} type={field.type} autoComplete={field.auto} maxLength={field.max} required disabled={busy} className="h-12 bg-card" /></div>)}
        <fieldset disabled={busy}><legend className="font-medium text-sm mb-3">What is your budget to invest:</legend><div className="grid sm:grid-cols-2 gap-3">{investmentBudgets.map(budget => <label key={budget} className="flex items-center gap-3 border border-input rounded-sm px-4 py-4 cursor-pointer has-[:checked]:border-accent has-[:checked]:bg-accent/10 text-sm"><input type="radio" name="budget" value={budget} required className="accent-accent h-4 w-4" />{budget}</label>)}</div></fieldset>
        <p className="text-xs leading-relaxed text-muted-foreground">By submitting, you agree that Birdies may contact you about your franchise enquiry. Your information is handled in accordance with our <Link className="underline" to="/privacy">Privacy Policy</Link>.</p>
        {error && <p role="alert" className="text-destructive text-sm">{error}</p>}
        <Button type="submit" size="lg" disabled={busy} className="w-full bg-accent text-accent-foreground hover:bg-accent/90 h-12 font-display uppercase">{busy ? <><Loader2 className="animate-spin" />Submitting</> : <>Submit franchise enquiry<ArrowUpRight /></>}</Button>
      </form></div>}
    </section>
  </MarketingLayout>;
}