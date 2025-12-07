import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Bay } from "@/hooks/useBooking";

interface BayAvailabilityGridProps {
  bays: Bay[];
  selectedTime: string | undefined;
  selectedDuration: number;
  selectedBayId: string | undefined;
  checkAvailability: (bayId: string, startTime: string, duration: number) => boolean;
  onSelectBay: (bayId: string) => void;
  hourlyRate: number;
}

export function BayAvailabilityGrid({
  bays,
  selectedTime,
  selectedDuration,
  selectedBayId,
  checkAvailability,
  onSelectBay,
  hourlyRate,
}: BayAvailabilityGridProps) {
  if (!selectedTime) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p>Select a date and time to see bay availability</p>
      </div>
    );
  }

  const totalPrice = hourlyRate * selectedDuration;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-lg text-foreground">Available Bays</h3>
        <div className="text-sm text-muted-foreground">
          ${hourlyRate}/hr × {selectedDuration}hr = <span className="font-semibold text-accent">${totalPrice}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {bays.map((bay) => {
          const isAvailable = checkAvailability(bay.id, selectedTime, selectedDuration);
          const isSelected = selectedBayId === bay.id;
          const isLeftyFriendly = bay.bay_number >= 4 && bay.bay_number <= 6;

          return (
            <Card
              key={bay.id}
              className={cn(
                "cursor-pointer transition-all duration-200",
                isAvailable
                  ? isSelected
                    ? "ring-2 ring-accent border-accent bg-accent/10"
                    : "hover:border-accent/50 hover:shadow-md"
                  : "opacity-50 cursor-not-allowed bg-muted"
              )}
              onClick={() => isAvailable && onSelectBay(bay.id)}
            >
              <CardContent className="p-4 text-center">
                <div className="flex items-center justify-center gap-2 mb-2">
                  {isAvailable ? (
                    <Check className="h-5 w-5 text-green-600" />
                  ) : (
                    <X className="h-5 w-5 text-destructive" />
                  )}
                </div>
                <h4 className="font-display text-lg">{bay.name}</h4>
                <p className={cn(
                  "text-sm mt-1",
                  isAvailable ? "text-green-600" : "text-destructive"
                )}>
                  {isAvailable ? "Available" : "Booked"}
                </p>
                {isLeftyFriendly && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Left-handed friendly
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {selectedBayId && (
        <div className="mt-6 p-4 bg-secondary rounded-lg">
          <p className="text-sm text-center text-secondary-foreground">
            <span className="font-semibold">
              {bays.find((b) => b.id === selectedBayId)?.name}
            </span>{" "}
            selected • {selectedDuration} {selectedDuration === 1 ? "hour" : "hours"} • ${totalPrice} total
          </p>
        </div>
      )}
    </div>
  );
}
