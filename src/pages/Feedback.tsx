import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Frown, Meh, Smile, CheckCircle2 } from "lucide-react";
import birdiesLogo from "@/assets/birdies-logo.png";

type Score = "bad" | "ok" | "good";

const scoreOptions: { value: Score; label: string; icon: typeof Frown; color: string }[] = [
  { value: "bad", label: "Bad", icon: Frown, color: "text-red-500 hover:bg-red-50 border-red-200" },
  { value: "ok", label: "OK", icon: Meh, color: "text-amber-500 hover:bg-amber-50 border-amber-200" },
  { value: "good", label: "Good", icon: Smile, color: "text-emerald-600 hover:bg-emerald-50 border-emerald-200" },
];

export default function Feedback() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const prefillName = searchParams.get("name") || "";
  const prefillEmail = searchParams.get("email") || "";

  const [score, setScore] = useState<Score | null>(null);
  const [name, setName] = useState(prefillName);
  const [comment, setComment] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!score) return;
    setSubmitting(true);
    try {
      await supabase.from("feedback_responses" as any).insert({
        token,
        name: name || null,
        score,
        comment: comment || null,
        email: prefillEmail || null,
      } as any);

      // Mark feedback as received
      if (token) {
        await supabase
          .from("feedback_emails_sent" as any)
          .update({ feedback_received: true } as any)
          .eq("id", token);
      }

      setSubmitted(true);
    } catch {
      // Still show success to user
      setSubmitted(true);
    }
    setSubmitting(false);
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-[#FFF5E4] flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center space-y-6">
          <img src={birdiesLogo} alt="Birdies Bayside" className="h-14 mx-auto" />
          <div className="bg-white rounded-2xl p-8 shadow-sm border border-[#1F4C25]/10">
            <CheckCircle2 className="h-16 w-16 text-emerald-600 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-[#1F4C25] mb-2">Thanks for your feedback!</h1>
            <p className="text-[#1F4C25]/70">
              We really appreciate you taking the time. Your feedback helps us make Birdies even better.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FFF5E4] flex items-center justify-center p-4">
      <div className="max-w-md w-full space-y-6">
        <div className="text-center">
          <img src={birdiesLogo} alt="Birdies Bayside" className="h-14 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-[#1F4C25]">How was your visit?</h1>
          <p className="text-[#1F4C25]/70 mt-1">We'd love to hear about your experience at Birdies</p>
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-sm border border-[#1F4C25]/10 space-y-5">
          {/* Score selection */}
          <div>
            <label className="block text-sm font-medium text-[#1F4C25] mb-3">
              How would you rate your experience?
            </label>
            <div className="grid grid-cols-3 gap-3">
              {scoreOptions.map((option) => {
                const Icon = option.icon;
                const isSelected = score === option.value;
                return (
                  <button
                    key={option.value}
                    onClick={() => setScore(option.value)}
                    className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                      isSelected
                        ? `${option.color} bg-opacity-100 border-current scale-105 shadow-md`
                        : `border-gray-200 text-gray-400 hover:border-gray-300`
                    }`}
                  >
                    <Icon className={`h-10 w-10 ${isSelected ? "" : "opacity-50"}`} />
                    <span className={`text-sm font-semibold ${isSelected ? "" : "text-gray-500"}`}>
                      {option.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-[#1F4C25] mb-1.5">
              Your name <span className="text-[#1F4C25]/40">(optional)</span>
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter your name"
              className="border-[#1F4C25]/15 focus:border-[#1F4C25]/30"
            />
          </div>

          {/* Comment */}
          <div>
            <label className="block text-sm font-medium text-[#1F4C25] mb-1.5">
              Any feedback? <span className="text-[#1F4C25]/40">(optional)</span>
            </label>
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Tell us what you loved, or what we could improve..."
              rows={4}
              className="border-[#1F4C25]/15 focus:border-[#1F4C25]/30 resize-none"
            />
          </div>

          {/* Submit */}
          <Button
            onClick={handleSubmit}
            disabled={!score || submitting}
            className="w-full bg-[#EC622D] hover:bg-[#d4551f] text-white font-semibold py-3 rounded-xl text-base"
          >
            {submitting ? "Sending..." : "Submit Feedback"}
          </Button>
        </div>

        <p className="text-center text-xs text-[#1F4C25]/40">
          Birdies Bayside · Unit 2, 86 Jardine Drive, Redland Bay
        </p>
      </div>
    </div>
  );
}
