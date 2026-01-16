import { useState, useEffect } from "react";
import { CreditCard, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

const CARD_SETUP_PENDING_KEY = "bb:cardSetupPending";

interface NoCardDialogProps {
  open: boolean;
  onClose: () => void;
  onCardAdded?: () => void;
  returnPath?: string;
}

export function NoCardDialog({ open, onClose, onCardAdded, returnPath = "/card-added" }: NoCardDialogProps) {
  const [isOpeningStripe, setIsOpeningStripe] = useState(false);
  const [isRedirectingToStripe, setIsRedirectingToStripe] = useState(false);

  // Check if returning from Stripe setup
  useEffect(() => {
    if (open && localStorage.getItem(CARD_SETUP_PENDING_KEY) === "1") {
      setIsRedirectingToStripe(true);
    }
  }, [open]);

  const handleAddCard = async () => {
    // Pre-open a tab synchronously so iOS doesn't block opening Safari after the async call
    const preOpened = window.open("about:blank", "_blank");

    setIsOpeningStripe(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-checkout-setup", {
        body: {
          returnTo: returnPath,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (!data?.url) throw new Error("No Stripe URL returned");

      // Store flag so when the app reloads/returns, we show the Close dialog
      localStorage.setItem(CARD_SETUP_PENDING_KEY, "1");

      // Switch the popup to "Close" state
      setIsRedirectingToStripe(true);
      setIsOpeningStripe(false);

      if (preOpened) {
        preOpened.location.href = data.url;
      } else {
        // Fallback: navigate current view
        window.location.href = data.url;
      }
    } catch (error: any) {
      try {
        preOpened?.close();
      } catch {
        // ignore
      }

      toast({
        title: "Error",
        description: error.message || "Failed to start card setup. Please try again.",
        variant: "destructive",
      });
      localStorage.removeItem(CARD_SETUP_PENDING_KEY);
      setIsOpeningStripe(false);
      setIsRedirectingToStripe(false);
    }
  };

  const handleClose = () => {
    localStorage.removeItem(CARD_SETUP_PENDING_KEY);
    setIsOpeningStripe(false);
    setIsRedirectingToStripe(false);
    onCardAdded?.();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Add a Payment Method
          </DialogTitle>
          <DialogDescription>
            {isRedirectingToStripe
              ? "Complete the card setup in the new tab, then close this dialog to continue."
              : "You need a card on file to make bookings or subscribe to memberships. You'll be redirected to securely add your card."}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col gap-2 sm:flex-row">
          {isRedirectingToStripe ? (
            <Button onClick={handleClose} className="w-full sm:w-auto">
              Close
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={handleClose} className="w-full sm:w-auto">
                Cancel
              </Button>
              <Button 
                onClick={handleAddCard} 
                disabled={isOpeningStripe}
                className="w-full sm:w-auto"
              >
                {isOpeningStripe ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Opening...
                  </>
                ) : (
                  "Add Card"
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
