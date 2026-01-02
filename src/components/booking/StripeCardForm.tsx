import { useState } from "react";
import { CardElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { Button } from "@/components/ui/button";
import { Loader2, CreditCard } from "lucide-react";

interface StripeCardFormProps {
  clientSecret: string;
  onSuccess: (paymentMethodId: string) => void;
  onError: (error: string) => void;
  isProcessing: boolean;
  setIsProcessing: (processing: boolean) => void;
  buttonText?: string;
}

export function StripeCardForm({
  clientSecret,
  onSuccess,
  onError,
  isProcessing,
  setIsProcessing,
  buttonText = "Save Card & Pay",
}: StripeCardFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [cardComplete, setCardComplete] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    const cardElement = elements.getElement(CardElement);
    if (!cardElement) {
      return;
    }

    setIsProcessing(true);

    try {
      const { error, setupIntent } = await stripe.confirmCardSetup(clientSecret, {
        payment_method: {
          card: cardElement,
        },
      });

      if (error) {
        onError(error.message || "Failed to save card");
        setIsProcessing(false);
        return;
      }

      if (setupIntent?.payment_method) {
        onSuccess(setupIntent.payment_method as string);
      } else {
        onError("Failed to save card");
        setIsProcessing(false);
      }
    } catch (err: any) {
      onError(err.message || "An unexpected error occurred");
      setIsProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="p-4 border border-border rounded-lg bg-background">
        <CardElement
          options={{
            style: {
              base: {
                fontSize: "16px",
                color: "hsl(var(--foreground))",
                "::placeholder": {
                  color: "hsl(var(--muted-foreground))",
                },
                iconColor: "hsl(var(--primary))",
              },
              invalid: {
                color: "hsl(var(--destructive))",
                iconColor: "hsl(var(--destructive))",
              },
            },
            hidePostalCode: true,
          }}
          onChange={(e) => setCardComplete(e.complete)}
        />
      </div>
      
      <p className="text-xs text-muted-foreground text-center">
        Your card will be saved for future bookings
      </p>

      <Button
        type="submit"
        className="w-full gradient-orange text-accent-foreground"
        disabled={!stripe || !cardComplete || isProcessing}
      >
        {isProcessing ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Processing...
          </>
        ) : (
          <>
            <CreditCard className="mr-2 h-4 w-4" />
            {buttonText}
          </>
        )}
      </Button>
    </form>
  );
}
