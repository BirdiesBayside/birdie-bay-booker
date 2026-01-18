import { CheckCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import birdiesLogo from "@/assets/birdies-logo.png";
import { Button } from "@/components/ui/button";

export default function CardAdded() {
  const navigate = useNavigate();

  const handleContinue = () => {
    // Clear any setup flags
    localStorage.removeItem("stripe_setup_return");
    localStorage.removeItem("stripe_setup_return_path");
    // Navigate to booking page
    navigate("/booking");
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="bg-primary text-primary-foreground py-4 px-4 safe-area-top">
        <div className="max-w-4xl mx-auto flex items-center justify-center">
          <img src={birdiesLogo} alt="Birdies" className="h-10 w-auto" />
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="flex justify-center">
            <div className="h-20 w-20 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle className="h-12 w-12 text-green-600" />
            </div>
          </div>
          
          <div className="space-y-4">
            <h1 className="font-display text-3xl tracking-wide">Card Added</h1>
            <p className="text-muted-foreground text-lg">
              Your payment method has been saved successfully.
            </p>
          </div>

          <Button 
            onClick={handleContinue}
            size="lg"
            className="w-full text-lg py-6"
          >
            Continue Booking
          </Button>
        </div>
      </main>
    </div>
  );
}
