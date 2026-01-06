import { useState, useEffect } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
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

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);

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
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    if (isOpen && !clientSecret) {
      createSetupIntent();
    }
  }, [isOpen]);

  const createSetupIntent = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke(
        "create-setup-intent",
        {
          body: { bookingId, amount, description },
        }
      );

      if (fnError) throw fnError;
      if (data.error) throw new Error(data.error);

      setClientSecret(data.clientSecret);
    } catch (err: any) {
      console.error("Error creating setup intent:", err);
      setError(err.message || "Failed to initialize payment form");
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    if (!isProcessing) {
      setClientSecret(null);
      setError(null);
      onClose();
    }
  };

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
          <div className="flex items-center gap-2 p-4 bg-destructive/10 text-destructive rounded-lg mb-4">
            <AlertCircle className="h-5 w-5" />
            <p className="text-sm">{error}</p>
          </div>
        )}

        {clientSecret && stripePromise && (
          <Elements
            stripe={stripePromise}
            options={{
              clientSecret,
              appearance: {
                theme: "stripe",
                variables: {
                  colorPrimary: "#f97316",
                  borderRadius: "8px",
                },
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
