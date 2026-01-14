import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Loader2, AlertCircle, Wallet, CreditCard } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useBooking, PaymentMethod } from "@/hooks/useBooking";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DateTimePicker } from "@/components/booking/DateTimePicker";
import { BayAvailabilityGrid } from "@/components/booking/BayAvailabilityGrid";
import { toast } from "@/hooks/use-toast";
import birdiesLogo from "@/assets/birdies-logo.png";

const MEMBERSHIP_DISPLAY: Record<string, string> = {
  visitor: "Visitor",
  weekday: "Weekday Member",
  birdie: "Birdie Member",
  eagle: "Eagle Member",
};

const CARD_SETUP_PENDING_KEY = "bb:cardSetupPending";

export default function Booking() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  const {
    bays,
    isLoading,
    isLoadingSavedCard,
    userMembershipTier,
    depositBalance,
    savedCard,
    getHourlyRate,
    getRateInfo,
    fetchBookingsForDate,
    checkBayAvailability,
    createBooking,
    refetchSavedCard,
  } = useBooking();

  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [selectedTime, setSelectedTime] = useState<string | undefined>();
  const [selectedDuration, setSelectedDuration] = useState<number>(1);
  const [selectedPlayers, setSelectedPlayers] = useState<number>(1);
  const [selectedBayId, setSelectedBayId] = useState<string | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<"balance" | "card">("card");
  const [usePartialBalance, setUsePartialBalance] = useState(false);
  const [showNoCardDialog, setShowNoCardDialog] = useState(false);
  const [isOpeningStripe, setIsOpeningStripe] = useState(false);
  const [isRedirectingToStripe, setIsRedirectingToStripe] = useState(false);
  // If iOS reloads the app after going to Safari, reopen the dialog so the user can
  // hit Close to refresh their saved card.
  useEffect(() => {
    if (localStorage.getItem(CARD_SETUP_PENDING_KEY) === "1") {
      setShowNoCardDialog(true);
      setIsRedirectingToStripe(true);
    }
  }, []);

  // Show toast if setup was cancelled
  useEffect(() => {
    if (searchParams.get("setup_cancelled") === "true") {
      toast({
        title: "Card setup cancelled",
        description: "You need to add a payment method to make bookings.",
        variant: "destructive",
      });
    }
  }, [searchParams]);

  // Handle cancelled checkout - delete the pending booking
  useEffect(() => {
    const handleCancelledBooking = async () => {
      const bookingId = searchParams.get("booking_id");
      const wasCancelled = searchParams.get("booking_cancelled") === "true";
      
      if (wasCancelled && bookingId) {
        try {
          // Delete the pending booking that was never paid
          await supabase
            .from("bookings")
            .delete()
            .eq("id", bookingId)
            .eq("status", "pending");
          
          toast({
            title: "Booking cancelled",
            description: "Your booking was not completed. Please try again.",
            variant: "destructive",
          });
        } catch (error) {
          console.error("Failed to delete pending booking:", error);
        }
      }
    };
    
    handleCancelledBooking();
  }, [searchParams]);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate("/");
    }
  }, [authLoading, isAuthenticated, navigate]);

  useEffect(() => {
    if (selectedDate) {
      fetchBookingsForDate(selectedDate);
      setSelectedBayId(undefined);
    }
  }, [selectedDate, selectedTime, selectedDuration]);

  const handleDateChange = (date: Date | undefined) => {
    setSelectedDate(date);
    setSelectedBayId(undefined);
  };

  const handleTimeChange = (time: string) => {
    setSelectedTime(time);
    setSelectedBayId(undefined);
  };

  const handleDurationChange = (duration: number) => {
    setSelectedDuration(duration);
    setSelectedBayId(undefined);
  };

  const handlePlayersChange = (players: number) => {
    setSelectedPlayers(players);
  };

  const handleConfirmClick = () => {
    if (!selectedDate || !selectedTime || !selectedBayId) {
      toast({
        title: "Missing selection",
        description: "Please select a date, time, and bay.",
        variant: "destructive",
      });
      return;
    }

    const totalPrice = hourlyRate * selectedDuration;

    // Free bookings bypass all payment logic - confirm directly
    if (totalPrice <= 0) {
      handleConfirmBooking("balance"); // Will auto-confirm as "free" in useBooking
      return;
    }

    // If paying with balance and have enough, proceed
    if (selectedPaymentMethod === "balance" && depositBalance >= totalPrice) {
      handleConfirmBooking("balance");
      return;
    }

    // For card payment, check if they have a saved card
    if (!savedCard && !isLoadingSavedCard) {
      setShowNoCardDialog(true);
      return;
    }

    // Has saved card - proceed with booking
    handleConfirmBooking("card", usePartialBalance);
  };

  const handleAddCard = async () => {
    // Pre-open a tab synchronously so iOS doesn't block opening Safari after the async call
    const preOpened = window.open("about:blank", "_blank");

    setIsOpeningStripe(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-checkout-setup", {
        body: {
          returnTo: "/card-added",
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

  const handleCloseCardDialog = () => {
    localStorage.removeItem(CARD_SETUP_PENDING_KEY);
    setShowNoCardDialog(false);
    setIsOpeningStripe(false);
    setIsRedirectingToStripe(false);
    // Refresh saved card data in case they added one
    refetchSavedCard();
  };

  const handleConfirmBooking = async (paymentMethod: PaymentMethod, applyPartialBalance: boolean = false) => {
    if (!selectedDate || !selectedTime || !selectedBayId) return;

    setIsSubmitting(true);
    try {
      const result = await createBooking(
        selectedBayId, 
        selectedDate, 
        selectedTime, 
        selectedDuration, 
        selectedPlayers, 
        paymentMethod,
        undefined, // No new payment method ID - we use saved card
        applyPartialBalance ? depositBalance : undefined
      );
      
      const totalPrice = hourlyRate * selectedDuration;
      let message = `Your bay is booked for ${format(selectedDate, "PPP")} at ${selectedTime}.`;
      if (paymentMethod === "balance") {
        message += " Balance deducted.";
      } else if (applyPartialBalance && depositBalance > 0) {
        const cardAmount = totalPrice - depositBalance;
        message += ` $${depositBalance.toFixed(2)} from balance, $${cardAmount.toFixed(2)} charged to card.`;
      } else if (savedCard) {
        message += ` Charged to your ${savedCard.brand} •••• ${savedCard.last4}.`;
      }
      
      toast({
        title: "Booking confirmed!",
        description: message,
      });
      navigate("/dashboard");
    } catch (error: any) {
      toast({
        title: "Booking failed",
        description: error.message || "Unable to complete booking. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    );
  }

  if (!isAuthenticated) return null;

  // Calculate rate with peak/off-peak logic
  const hourlyRate = selectedDate && selectedTime 
    ? getHourlyRate(userMembershipTier, selectedDate, selectedTime)
    : getHourlyRate();
  
  const rateInfo = selectedDate && selectedTime 
    ? getRateInfo(selectedDate, selectedTime)
    : null;

  const canConfirm = selectedDate && selectedTime && selectedBayId;

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-primary text-primary-foreground py-4 px-4 safe-area-top">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              className="text-primary-foreground hover:bg-primary/80"
              onClick={() => navigate("/dashboard")}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="font-display text-2xl tracking-wide">BOOK A BAY</h1>
          </div>
          <img 
            src={birdiesLogo} 
            alt="Birdies" 
            className="h-10 w-auto"
          />
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4 space-y-6">
        {/* Membership Badge with Peak/Off-Peak Indicator */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-secondary rounded-full">
            <span className="text-sm text-secondary-foreground">
              {MEMBERSHIP_DISPLAY[userMembershipTier]}
            </span>
            <span className="text-sm font-semibold text-accent">
              ${hourlyRate}/hr
            </span>
          </div>
          
          {rateInfo?.isRestricted && selectedTime && (
            <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50">
              Visitor Rate Applied
            </Badge>
          )}
        </div>

        {/* Weekday member restriction warning */}
        {userMembershipTier === "weekday" && rateInfo?.isRestricted && (
          <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
            <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
            <div>
              <strong>Peak time selected.</strong> As a Weekday member, you get $10/hr for Monday-Thursday before 4pm only. 
              This booking will be charged at the visitor peak rate ($35/hr).
            </div>
          </div>
        )}

        {/* Date & Time Selection */}
        <Card>
          <CardHeader>
            <CardTitle className="font-display text-xl">When would you like to play?</CardTitle>
          </CardHeader>
          <CardContent>
            <DateTimePicker
              selectedDate={selectedDate}
              selectedTime={selectedTime}
              selectedDuration={selectedDuration}
              selectedPlayers={selectedPlayers}
              onDateChange={handleDateChange}
              onTimeChange={handleTimeChange}
              onDurationChange={handleDurationChange}
              onPlayersChange={handlePlayersChange}
            />
          </CardContent>
        </Card>

        {/* Bay Availability */}
        <Card>
          <CardHeader>
            <CardTitle className="font-display text-xl">Select a Bay</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-accent" />
              </div>
            ) : (
              <BayAvailabilityGrid
                bays={bays}
                selectedTime={selectedTime}
                selectedDuration={selectedDuration}
                selectedBayId={selectedBayId}
                checkAvailability={checkBayAvailability}
                onSelectBay={setSelectedBayId}
                hourlyRate={hourlyRate}
                isPeak={rateInfo?.isPeak}
              />
            )}
          </CardContent>
        </Card>

        {/* Payment Method Selection - Only show if user has balance */}
        {canConfirm && depositBalance > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="font-display text-xl">Payment Method</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-secondary/50 rounded-lg">
                <div className="flex items-center gap-2">
                  <Wallet className="h-5 w-5 text-accent" />
                  <span className="font-medium">Credit Balance</span>
                </div>
                <span className="font-semibold text-accent">${depositBalance.toFixed(2)}</span>
              </div>

              {(() => {
                const totalPrice = hourlyRate * selectedDuration;
                const hasEnoughBalance = depositBalance >= totalPrice;
                const remainingAfterBalance = totalPrice - depositBalance;

                return (
                  <RadioGroup
                    value={selectedPaymentMethod}
                    onValueChange={(value) => {
                      setSelectedPaymentMethod(value as "balance" | "card");
                      if (value === "balance") {
                        setUsePartialBalance(false);
                      }
                    }}
                    className="space-y-3"
                  >
                    {/* Full balance payment option - only if enough balance */}
                    {hasEnoughBalance && (
                      <div className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-secondary/30 transition-colors">
                        <RadioGroupItem value="balance" id="balance" />
                        <Label htmlFor="balance" className="flex-1 cursor-pointer">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Wallet className="h-4 w-4 text-muted-foreground" />
                              <span>Pay with Credit Balance</span>
                            </div>
                            <span className="font-medium text-green-600">-${totalPrice.toFixed(2)}</span>
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">
                            Remaining balance: ${(depositBalance - totalPrice).toFixed(2)}
                          </p>
                        </Label>
                      </div>
                    )}

                    {/* Card payment option */}
                    <div className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-secondary/30 transition-colors">
                      <RadioGroupItem value="card" id="card" />
                      <Label htmlFor="card" className="flex-1 cursor-pointer">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <CreditCard className="h-4 w-4 text-muted-foreground" />
                            <span>
                              {savedCard 
                                ? `Pay with ${savedCard.brand} •••• ${savedCard.last4}` 
                                : "Pay with Card"}
                            </span>
                          </div>
                          <span className="font-medium">${totalPrice.toFixed(2)}</span>
                        </div>
                      </Label>
                    </div>

                    {/* Partial payment option - only if not enough balance but has some */}
                    {!hasEnoughBalance && selectedPaymentMethod === "card" && (
                      <div className="ml-6 p-3 border border-dashed rounded-lg bg-secondary/20">
                        <div className="flex items-start space-x-3">
                          <Checkbox 
                            id="partial" 
                            checked={usePartialBalance}
                            onCheckedChange={(checked) => setUsePartialBalance(checked === true)}
                          />
                          <Label htmlFor="partial" className="cursor-pointer">
                            <div className="font-medium">Apply credit balance to reduce card payment</div>
                            <p className="text-sm text-muted-foreground mt-1">
                              Use ${depositBalance.toFixed(2)} credit, pay ${remainingAfterBalance.toFixed(2)} by card
                            </p>
                          </Label>
                        </div>
                      </div>
                    )}
                  </RadioGroup>
                );
              })()}
            </CardContent>
          </Card>
        )}

        {/* Confirm Button */}
        <div className="space-y-2">
          <Button
            className="w-full py-6 text-lg font-display gradient-orange text-accent-foreground"
            disabled={!canConfirm || isSubmitting}
            onClick={handleConfirmClick}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                {hourlyRate * selectedDuration <= 0 
                  ? "Confirming..." 
                  : selectedPaymentMethod === "balance" 
                    ? "Processing..." 
                    : "Charging Card..."}
              </>
            ) : (
              (() => {
                if (!canConfirm) return "Confirm Booking";
                const totalPrice = hourlyRate * selectedDuration;
                // Free bookings get special treatment
                if (totalPrice <= 0) {
                  return "Confirm Free Booking";
                }
                if (selectedPaymentMethod === "balance" && depositBalance >= totalPrice) {
                  return `Confirm Booking - $${totalPrice.toFixed(2)} from Balance`;
                }
                if (usePartialBalance && depositBalance > 0) {
                  const cardAmount = totalPrice - depositBalance;
                  return `Confirm Booking - $${cardAmount.toFixed(2)} Card + $${depositBalance.toFixed(2)} Balance`;
                }
                return `Confirm Booking - $${totalPrice.toFixed(2)}`;
              })()
            )}
          </Button>
          {canConfirm && depositBalance === 0 && hourlyRate * selectedDuration > 0 && (
            <p className="text-center text-sm text-muted-foreground">
              {isLoadingSavedCard 
                ? "Checking payment method..."
                : savedCard 
                  ? `Will charge your ${savedCard.brand} card ending in ${savedCard.last4}`
                  : "You'll need to add a payment method"}
            </p>
          )}
        </div>
      </main>

      {/* No Card Dialog */}
      <Dialog
        open={showNoCardDialog}
        onOpenChange={(open) => {
          if (open) {
            setShowNoCardDialog(true);
            return;
          }

          // If we're in the "return from Safari" state, closing acts like Close
          if (isRedirectingToStripe) {
            handleCloseCardDialog();
          } else {
            setShowNoCardDialog(false);
            setIsOpeningStripe(false);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Payment Method Required</DialogTitle>
            <DialogDescription>
              {isRedirectingToStripe
                ? "Safari should be open for you to add your card. Once complete, return to the Birdies app and tap Close to refresh your payment method."
                : "To make a booking, you need to add a payment method to your account first."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            {isRedirectingToStripe ? (
              <Button onClick={handleCloseCardDialog} className="w-full gradient-orange text-accent-foreground">
                Close
              </Button>
            ) : (
              <>
                <Button
                  variant="outline"
                  onClick={() => setShowNoCardDialog(false)}
                  disabled={isOpeningStripe}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleAddCard}
                  className="gradient-orange text-accent-foreground"
                  disabled={isOpeningStripe}
                >
                  {isOpeningStripe ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Opening Stripe...
                    </>
                  ) : (
                    "Add Payment Method"
                  )}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
