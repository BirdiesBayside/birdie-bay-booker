import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertCircle, CreditCard, Loader2, RotateCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after a successful retry so caller can refresh state / re-attempt booking */
  onResolved?: () => void;
  /** Optional context (e.g. "to complete this booking") */
  context?: string;
}

export function MembershipPaymentIssueDialog({
  open,
  onOpenChange,
  onResolved,
  context,
}: Props) {
  const [isRetrying, setIsRetrying] = useState(false);
  const [isAddingCard, setIsAddingCard] = useState(false);

  const handleRetry = async () => {
    setIsRetrying(true);
    try {
      const { data, error } = await supabase.functions.invoke("retry-membership-payment");
      if (error) throw error;

      if (data?.success) {
        toast.success(data.message || "Membership payment successful!");
        onOpenChange(false);
        onResolved?.();
        return;
      }

      // Not successful - show specific message
      if (data?.status === "no_payment_method" || data?.status === "no_customer") {
        toast.error(data.message || "No card on file. Please add one.");
      } else if (data?.status === "card_declined") {
        toast.error(data.message || "Card declined. Please try a different card.");
      } else {
        toast.error(data?.message || data?.error || "Could not process payment.");
      }
    } catch (err: any) {
      console.error("[MembershipPaymentIssueDialog] retry failed", err);
      toast.error(err?.message || "Could not process payment. Please try a new card.");
    } finally {
      setIsRetrying(false);
    }
  };

  const handleAddCard = async () => {
    setIsAddingCard(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-checkout-setup");
      if (error) throw error;
      if (data?.url) {
        // The card-added page will run sync-subscription-payment-method which retries the invoice
        window.location.href = data.url as string;
      } else {
        throw new Error("No checkout URL returned");
      }
    } catch (err: any) {
      console.error("[MembershipPaymentIssueDialog] add card failed", err);
      toast.error(err?.message || "Could not start card setup.");
      setIsAddingCard(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !isRetrying && !isAddingCard && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mx-auto mb-2 h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center">
            <AlertCircle className="h-6 w-6 text-destructive" />
          </div>
          <DialogTitle className="text-center font-display text-xl">
            Membership Payment Issue
          </DialogTitle>
          <DialogDescription className="text-center">
            Your last membership payment didn't go through, so new bookings are paused
            {context ? ` ${context}` : ""}. You're still a member, we just need to settle the
            outstanding invoice.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 pt-2">
          <Button
            onClick={handleRetry}
            disabled={isRetrying || isAddingCard}
            className="w-full gradient-orange"
            size="lg"
          >
            {isRetrying ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Retrying payment...
              </>
            ) : (
              <>
                <RotateCw className="mr-2 h-4 w-4" />
                Retry with card on file
              </>
            )}
          </Button>

          <Button
            onClick={handleAddCard}
            disabled={isRetrying || isAddingCard}
            variant="outline"
            className="w-full"
            size="lg"
          >
            {isAddingCard ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Opening secure checkout...
              </>
            ) : (
              <>
                <CreditCard className="mr-2 h-4 w-4" />
                Update card instead
              </>
            )}
          </Button>
        </div>

        <DialogFooter className="sm:justify-center pt-2">
          <p className="text-xs text-muted-foreground text-center">
            Still stuck? Contact us and we'll sort it out manually.
          </p>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
