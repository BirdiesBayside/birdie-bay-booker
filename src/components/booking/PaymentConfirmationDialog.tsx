import { useState, useEffect } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements } from "@stripe/react-stripe-js";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CreditCard, Wallet, Loader2, CheckCircle } from "lucide-react";
import { StripeCardForm } from "./StripeCardForm";
import { supabase } from "@/integrations/supabase/client";
import { SavedCard } from "@/hooks/useBooking";

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || "");

interface PaymentConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  totalPrice: number;
  savedCard: SavedCard | null;
  depositBalance: number;
  onPayWithBalance: () => void;
  onPayWithSavedCard: () => void;
  onPayWithNewCard: (paymentMethodId: string) => void;
  isProcessing: boolean;
}

export function PaymentConfirmationDialog({
  open,
  onOpenChange,
  totalPrice,
  savedCard,
  depositBalance,
  onPayWithBalance,
  onPayWithSavedCard,
  onPayWithNewCard,
  isProcessing,
}: PaymentConfirmationDialogProps) {
  const [setupClientSecret, setSetupClientSecret] = useState<string | null>(null);
  const [isLoadingSetup, setIsLoadingSetup] = useState(false);
  const [cardFormProcessing, setCardFormProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch setup intent when dialog opens and no saved card
  useEffect(() => {
    if (open && !savedCard && !setupClientSecret) {
      fetchSetupIntent();
    }
  }, [open, savedCard]);

  const fetchSetupIntent = async () => {
    setIsLoadingSetup(true);
    setError(null);
    try {
      const { data, error } = await supabase.functions.invoke("create-setup-intent");
      if (error) throw error;
      if (data?.clientSecret) {
        setSetupClientSecret(data.clientSecret);
      } else {
        throw new Error("Failed to initialize payment form");
      }
    } catch (err: any) {
      setError(err.message || "Failed to initialize payment");
    } finally {
      setIsLoadingSetup(false);
    }
  };

  const handleCardSuccess = (paymentMethodId: string) => {
    onPayWithNewCard(paymentMethodId);
  };

  const handleCardError = (errorMsg: string) => {
    setError(errorMsg);
    setCardFormProcessing(false);
  };

  const canPayWithBalance = depositBalance >= totalPrice;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">Confirm Payment</DialogTitle>
          <DialogDescription>
            Total: <span className="font-semibold text-foreground">${totalPrice.toFixed(2)}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {error && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          {/* Balance Payment Option */}
          {depositBalance > 0 && (
            <Button
              variant="outline"
              className="w-full h-auto py-4 justify-start"
              onClick={onPayWithBalance}
              disabled={!canPayWithBalance || isProcessing}
            >
              <Wallet className="h-5 w-5 mr-3 text-primary flex-shrink-0" />
              <div className="text-left">
                <div className="font-medium">Use Account Balance</div>
                <div className="text-sm text-muted-foreground">
                  Available: ${depositBalance.toFixed(2)}
                  {!canPayWithBalance && (
                    <span className="text-destructive ml-2">(Insufficient)</span>
                  )}
                </div>
              </div>
            </Button>
          )}

          {/* Saved Card Option */}
          {savedCard && (
            <Button
              variant="outline"
              className="w-full h-auto py-4 justify-start border-primary/50"
              onClick={onPayWithSavedCard}
              disabled={isProcessing}
            >
              <div className="flex items-center w-full">
                <CreditCard className="h-5 w-5 mr-3 text-primary flex-shrink-0" />
                <div className="text-left flex-grow">
                  <div className="font-medium flex items-center gap-2">
                    Pay with {savedCard.brand} •••• {savedCard.last4}
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Charge your saved card
                  </div>
                </div>
                {isProcessing && <Loader2 className="h-4 w-4 animate-spin ml-2" />}
              </div>
            </Button>
          )}

          {/* New Card Entry */}
          {!savedCard && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <CreditCard className="h-4 w-4" />
                Enter Card Details
              </div>
              
              {isLoadingSetup ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : setupClientSecret ? (
                <Elements
                  stripe={stripePromise}
                  options={{
                    clientSecret: setupClientSecret,
                    appearance: {
                      theme: "stripe",
                      variables: {
                        colorPrimary: "hsl(24, 100%, 50%)",
                      },
                    },
                  }}
                >
                  <StripeCardForm
                    clientSecret={setupClientSecret}
                    onSuccess={handleCardSuccess}
                    onError={handleCardError}
                    isProcessing={cardFormProcessing}
                    setIsProcessing={setCardFormProcessing}
                    buttonText={`Pay $${totalPrice.toFixed(2)}`}
                  />
                </Elements>
              ) : (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={fetchSetupIntent}
                >
                  Load Payment Form
                </Button>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
