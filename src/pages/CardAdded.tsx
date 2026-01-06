import { useNavigate } from "react-router-dom";
import { CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import birdiesLogo from "@/assets/birdies-logo.png";

export default function CardAdded() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="bg-primary text-primary-foreground py-4 px-4 safe-area-top">
        <div className="max-w-4xl mx-auto flex items-center justify-center">
          <img src={birdiesLogo} alt="Birdies" className="h-10 w-auto" />
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-8 pb-6 text-center space-y-6">
            <div className="flex justify-center">
              <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center">
                <CheckCircle className="h-10 w-10 text-green-600" />
              </div>
            </div>
            
            <div className="space-y-2">
              <h1 className="font-display text-2xl tracking-wide">Card Added</h1>
              <p className="text-muted-foreground">
                Your payment method has been saved successfully. You can now make bookings.
              </p>
            </div>

            <div className="space-y-3">
              <Button
                className="w-full gradient-orange text-accent-foreground"
                onClick={() => navigate("/booking")}
              >
                Continue to Booking
              </Button>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => navigate("/dashboard")}
              >
                Back to Dashboard
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
