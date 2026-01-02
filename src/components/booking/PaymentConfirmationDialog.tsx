import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CreditCard, Wallet, Loader2, CheckCircle } from "lucide-react";

interface PaymentConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  totalPrice: number;
  savedCard: { brand: string; last4: string } | null;
  depositBalance: number;
  onPayWithBalance: () => void;
  onPayWithSavedCard: () => void;
  onPayWithNewCard: () => void;
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
              {isProcessing && <Loader2 className="h-4 w-4 animate-spin ml-auto" />}
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

          {/* New Card Option - Redirect to Stripe Checkout */}
          {!savedCard && (
            <Button
              className="w-full h-auto py-4 justify-start"
              onClick={onPayWithNewCard}
              disabled={isProcessing}
            >
              <CreditCard className="h-5 w-5 mr-3 flex-shrink-0" />
              <div className="text-left flex-grow">
                <div className="font-medium">Pay with Card</div>
                <div className="text-sm opacity-80">
                  Enter your card details securely
                </div>
              </div>
              {isProcessing && <Loader2 className="h-4 w-4 animate-spin ml-2" />}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
