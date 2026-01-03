import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { useAuth } from "@/hooks/useAuth";
import { useBooking, PaymentMethod } from "@/hooks/useBooking";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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

export default function Booking() {
  const navigate = useNavigate();
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  const {
    bays,
    isLoading,
    userMembershipTier,
    depositBalance,
    savedCard,
    getHourlyRate,
    getRateInfo,
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

    // Priority: 1) Balance if sufficient, 2) Saved card, 3) Redirect to Stripe
    if (depositBalance >= totalPrice) {
      handleConfirmBooking("balance");
    } else if (savedCard) {
      handleConfirmBooking("card");
    } else {
      handleConfirmBooking("card");
    }
  };

  const handleConfirmBooking = async (paymentMethod: PaymentMethod) => {
    if (!selectedDate || !selectedTime || !selectedBayId) return;

    setIsSubmitting(true);
    try {
      const result = await createBooking(selectedBayId, selectedDate, selectedTime, selectedDuration, selectedPlayers, paymentMethod);
      
      if (result.requiresCheckout && result.checkoutUrl) {
        window.location.href = result.checkoutUrl;
        return;
      }
      
      toast({
        title: "Booking confirmed!",
        description: `Your bay is booked for ${format(selectedDate, "PPP")} at ${selectedTime}.${paymentMethod === "balance" ? " Balance deducted." : savedCard ? ` Charged to card ending ${savedCard.last4}.` : ""}`,
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
          
          {rateInfo && selectedTime && (
            <div className="flex items-center gap-2">
              <Badge 
                variant="outline" 
                className={rateInfo.isPeak 
                  ? "text-orange-600 border-orange-300 bg-orange-50" 
                  : "text-green-600 border-green-300 bg-green-50"
                }
              >
                {rateInfo.isPeak ? "Peak" : "Off-Peak"}
              </Badge>
              {rateInfo.isRestricted && (
                <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50">
                  Visitor Rate Applied
                </Badge>
              )}
            </div>
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
                {savedCard ? "Charging Card..." : "Processing..."}
              </>
            ) : (
              `Confirm Booking${canConfirm ? ` - $${hourlyRate * selectedDuration}` : ""}`
            )}
          </Button>
          {canConfirm && depositBalance === 0 && (
            <p className="text-center text-sm text-muted-foreground">
              {savedCard 
                ? `Will charge your ${savedCard.brand} card ending in ${savedCard.last4}`
                : "You'll be redirected to enter payment details"}
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
