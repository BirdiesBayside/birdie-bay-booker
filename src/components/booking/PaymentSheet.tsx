import { useEffect, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Loader2, CreditCard, AlertCircle } from "lucide-react";
import { toast } from "sonner";

type StripePromise = ReturnType<typeof loadStripe>;

let stripePromiseSingleton: StripePromise | null = null;

async function getStripePublishableKey(): Promise<string> {
  const envKeyRaw = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as
    | string
    | undefined;
  const envKey = envKeyRaw?.trim();

  // Never use anything except a publishable key (pk_*).
  // (Some builds accidentally end up with restricted/secret keys in env.)
  if (envKey && /^pk_(test|live)_/i.test(envKey)) return envKey;

  const { data, error } = await supabase.functions.invoke(
    "get-stripe-publishable-key"
  );

  if (error) {
    const body = (error as any)?.context?.body;

    // Supabase functions errors often include a JSON body; surface it.
    if (typeof body === "string") {
      try {
        const parsed = JSON.parse(body);
        if (parsed?.error) throw new Error(String(parsed.error));
      } catch {
        // ignore JSON parse failures
      }
    }

    if (body && typeof body === "object" && (body as any).error) {
      throw new Error(String((body as any).error));
    }

    throw new Error(error.message);
  }

  if ((data as any)?.error) throw new Error(String((data as any).error));

  const key = String((data as any)?.publishableKey ?? "").trim();
  if (!key) throw new Error("Missing Stripe publishable key");
  return key;
}

interface PaymentFormProps {
  onSuccess: (paymentMethodId: string) => void;
  onCancel: () => void;
  amount: number;
  isProcessing: boolean;
  setIsProcessing: (val: boolean) => void;
}

function PaymentForm({ 
  onSuccess, 
  onCancel, 
  amount, 
  isProcessing, 
  setIsProcessing 
}: PaymentFormProps) {
  const stripe = useStripe();
  const elements = useElements();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setIsProcessing(true);

    try {
      // Submit the payment element to create a payment method
      const { error: submitError } = await elements.submit();
      if (submitError) {
        toast.error(submitError.message || "Payment failed");
        setIsProcessing(false);
        return;
      }

      // Create a payment method from the elements
      const { error: pmError, paymentMethod } = await stripe.createPaymentMethod({
        elements,
      });

      if (pmError) {
        toast.error(pmError.message || "Failed to create payment method");
        setIsProcessing(false);
        return;
      }

      // Pass the payment method ID back to the parent
      onSuccess(paymentMethod.id);
    } catch (err: any) {
      toast.error(err.message || "Payment failed");
      setIsProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <PaymentElement 
        options={{
          layout: "tabs",
        }}
      />
      
      <div className="flex gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isProcessing}
          className="flex-1"
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={!stripe || isProcessing}
          className="flex-1 gradient-orange"
        >
          {isProcessing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <CreditCard className="mr-2 h-4 w-4" />
              Pay ${amount.toFixed(2)}
            </>
          )}
        </Button>
      </div>
    </form>
  );
}

interface PaymentSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (paymentMethodId: string) => void;
  amount: number;
  bookingId: string;
  description: string;
}

export function PaymentSheet({
  isOpen,
  onClose,
  onSuccess,
  amount,
  bookingId,
  description,
}: PaymentSheetProps) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [stripePromise, setStripePromise] = useState<StripePromise | null>(
    stripePromiseSingleton
  );
  const [isSetupLoading, setIsSetupLoading] = useState(false);
  const [isStripeLoading, setIsStripeLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const ensureStripe = async () => {
    if (stripePromiseSingleton) {
      if (!stripePromise) setStripePromise(stripePromiseSingleton);
      return;
    }

    setIsStripeLoading(true);
    try {
      const key = await getStripePublishableKey();

      // Quick sanity check: publishable keys MUST start with pk_test_ or pk_live_
      if (!/^pk_(test|live)_/i.test(key)) {
        throw new Error(
          "Stripe publishable key is invalid (expected pk_test_... or pk_live_...)."
        );
      }

      const promise = loadStripe(key);
      const stripeInstance = await promise;
      if (!stripeInstance) {
        throw new Error(
          "Stripe failed to load. This is usually caused by a blocked Stripe script (CSP/network) or an invalid key."
        );
      }

      stripePromiseSingleton = promise;
      setStripePromise(promise);
    } catch (err: any) {
      console.error("Error loading Stripe:", err);
      setError(err.message || "Failed to load Stripe");
    } finally {
      setIsStripeLoading(false);
    }
  };

  const createSetupIntent = async () => {
    setIsSetupLoading(true);
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke(
        "create-setup-intent",
        {
          body: { bookingId, amount, description },
        }
      );

      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);

      setClientSecret(data.clientSecret);
    } catch (err: any) {
      console.error("Error creating setup intent:", err);
      setError(err.message || "Failed to initialize payment form");
    } finally {
      setIsSetupLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;

    void ensureStripe();
    if (!clientSecret) {
      void createSetupIntent();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const handleClose = () => {
    if (isProcessing) return;

    setClientSecret(null);
    setError(null);
    onClose();
  };

  const isLoading = isSetupLoading || isStripeLoading;

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <SheetContent side="bottom" className="h-auto max-h-[90vh] rounded-t-xl">
        <SheetHeader className="mb-4">
          <SheetTitle className="font-display text-xl">Payment Details</SheetTitle>
          <SheetDescription>
            Enter your card details to complete the booking
          </SheetDescription>
        </SheetHeader>

        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-accent" />
          </div>
        )}

        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-lg bg-destructive/10 p-4 text-destructive">
            <AlertCircle className="h-5 w-5" />
            <p className="text-sm">{error}</p>
          </div>
        )}

        {!isLoading && clientSecret && stripePromise && !error && (
          <Elements
            stripe={stripePromise}
            options={{
              clientSecret,
              appearance: {
                theme: "stripe",
              },
            }}
          >
            <PaymentForm
              onSuccess={onSuccess}
              onCancel={handleClose}
              amount={amount}
              isProcessing={isProcessing}
              setIsProcessing={setIsProcessing}
            />
          </Elements>
        )}
      </SheetContent>
    </Sheet>
  );
}
