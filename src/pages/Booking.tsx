import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2, CreditCard, Wallet } from "lucide-react";
import { format } from "date-fns";
import { useAuth } from "@/hooks/useAuth";
import { useBooking, PaymentMethod } from "@/hooks/useBooking";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DateTimePicker } from "@/components/booking/DateTimePicker";
import { BayAvailabilityGrid } from "@/components/booking/BayAvailabilityGrid";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import birdiesLogo from "@/assets/birdies-logo.png";

const MEMBERSHIP_DISPLAY: Record<string, string> = {
  visitor: "Visitor",
  par: "Par Member",
  birdie: "Birdie Member",
  eagle: "Eagle Member",
  albatross: "Albatross Member",
};

export default function Booking() {
  const navigate = useNavigate();
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  const {
    bays,
    isLoading,
    userMembershipTier,
    depositBalance,
    getHourlyRate,
    fetchBookingsForDate,
    checkBayAvailability,
    createBooking,
  } = useBooking();

  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [selectedTime, setSelectedTime] = useState<string | undefined>();
  const [selectedDuration, setSelectedDuration] = useState<number>(1);
  const [selectedPlayers, setSelectedPlayers] = useState<number>(1);
  const [selectedBayId, setSelectedBayId] = useState<string | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);

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
    
    // If customer has balance, show payment options
    if (depositBalance > 0) {
      setShowPaymentDialog(true);
    } else {
      // No balance, proceed with card payment
      handleConfirmBooking("card");
    }
  };

  const handleConfirmBooking = async (paymentMethod: PaymentMethod) => {
    if (!selectedDate || !selectedTime || !selectedBayId) return;

    const totalPrice = hourlyRate * selectedDuration;
    
    // Check if balance is sufficient when using balance
    if (paymentMethod === "balance" && depositBalance < totalPrice) {
      toast({
        title: "Insufficient balance",
        description: `Your balance ($${depositBalance.toFixed(2)}) is less than the booking cost ($${totalPrice.toFixed(2)}).`,
        variant: "destructive",
      });
      return;
    }

    setShowPaymentDialog(false);
    setIsSubmitting(true);
    try {
      await createBooking(selectedBayId, selectedDate, selectedTime, selectedDuration, selectedPlayers, paymentMethod);
      toast({
        title: "Booking confirmed!",
        description: `Your bay is booked for ${format(selectedDate, "PPP")} at ${selectedTime}.${paymentMethod === "balance" ? " Balance deducted." : ""}`,
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

  const hourlyRate = getHourlyRate();
  const canConfirm = selectedDate && selectedTime && selectedBayId;

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-primary text-primary-foreground py-4 px-4">
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
        {/* Membership Badge */}
        <div className="flex items-center justify-between">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-secondary rounded-full">
            <span className="text-sm text-secondary-foreground">
              {MEMBERSHIP_DISPLAY[userMembershipTier]}
            </span>
            <span className="text-sm font-semibold text-accent">
              ${hourlyRate}/hr
            </span>
          </div>
        </div>

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
              />
            )}
          </CardContent>
        </Card>

        {/* Confirm Button */}
        <Button
          className="w-full py-6 text-lg font-display gradient-orange text-accent-foreground"
          disabled={!canConfirm || isSubmitting}
          onClick={handleConfirmClick}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Confirming...
            </>
          ) : (
            `Confirm Booking${canConfirm ? ` - $${hourlyRate * selectedDuration}` : ""}`
          )}
        </Button>

        {/* Payment Method Dialog */}
        <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="font-display text-xl">Choose Payment Method</DialogTitle>
              <DialogDescription>
                Total: ${(hourlyRate * selectedDuration).toFixed(2)}
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-3 pt-2">
              <Button
                variant="outline"
                className="w-full h-auto py-4 justify-start"
                onClick={() => handleConfirmBooking("balance")}
                disabled={depositBalance < hourlyRate * selectedDuration}
              >
                <Wallet className="h-5 w-5 mr-3 text-primary" />
                <div className="text-left">
                  <div className="font-medium">Use Balance</div>
                  <div className="text-sm text-muted-foreground">
                    Available: ${depositBalance.toFixed(2)}
                    {depositBalance < hourlyRate * selectedDuration && (
                      <span className="text-destructive ml-2">(Insufficient)</span>
                    )}
                  </div>
                </div>
              </Button>
              
              <Button
                variant="outline"
                className="w-full h-auto py-4 justify-start"
                onClick={() => handleConfirmBooking("card")}
              >
                <CreditCard className="h-5 w-5 mr-3 text-primary" />
                <div className="text-left">
                  <div className="font-medium">Pay by Card</div>
                  <div className="text-sm text-muted-foreground">
                    Charge to saved card
                  </div>
                </div>
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
