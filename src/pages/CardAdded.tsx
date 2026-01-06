import { CheckCircle } from "lucide-react";
import birdiesLogo from "@/assets/birdies-logo.png";

export default function CardAdded() {
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
            <p className="text-xl font-medium text-primary">
              Please return to the Birdies app to continue booking.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
