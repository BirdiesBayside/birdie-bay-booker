import { format } from "date-fns";
import { CalendarIcon, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface DateTimePickerProps {
  selectedDate: Date | undefined;
  selectedTime: string | undefined;
  selectedDuration: number;
  onDateChange: (date: Date | undefined) => void;
  onTimeChange: (time: string) => void;
  onDurationChange: (duration: number) => void;
}

// Generate time slots from 8am to 10pm in 30-min increments
const generateTimeSlots = () => {
  const slots: string[] = [];
  for (let hour = 8; hour <= 22; hour++) {
    slots.push(`${hour.toString().padStart(2, "0")}:00`);
    if (hour < 22) {
      slots.push(`${hour.toString().padStart(2, "0")}:30`);
    }
  }
  return slots;
};

const TIME_SLOTS = generateTimeSlots();
const DURATIONS = [1, 2, 3, 4];

export function DateTimePicker({
  selectedDate,
  selectedTime,
  selectedDuration,
  onDateChange,
  onTimeChange,
  onDurationChange,
}: DateTimePickerProps) {
  // Filter out time slots that would extend past closing (10pm)
  const getAvailableTimeSlots = () => {
    return TIME_SLOTS.filter((time) => {
      const hour = parseInt(time.split(":")[0]);
      const minute = parseInt(time.split(":")[1]);
      const endHour = hour + selectedDuration;
      const endMinutes = minute;
      // End time cannot exceed 22:00 (10pm)
      return endHour < 22 || (endHour === 22 && endMinutes === 0);
    });
  };

  const formatTimeDisplay = (time: string) => {
    const hour = parseInt(time.split(":")[0]);
    const minute = time.split(":")[1];
    const ampm = hour >= 12 ? "PM" : "AM";
    const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
    return `${displayHour}:${minute} ${ampm}`;
  };

  return (
    <div className="space-y-4">
      {/* Date Picker */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">Select Date</label>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                "w-full justify-start text-left font-normal",
                !selectedDate && "text-muted-foreground"
              )}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {selectedDate ? format(selectedDate, "PPP") : <span>Pick a date</span>}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0 bg-popover" align="start">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={onDateChange}
              disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
              initialFocus
              className={cn("p-3 pointer-events-auto")}
            />
          </PopoverContent>
        </Popover>
      </div>

      {/* Duration Selector */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">Duration</label>
        <Select
          value={selectedDuration.toString()}
          onValueChange={(value) => onDurationChange(parseInt(value))}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select duration" />
          </SelectTrigger>
          <SelectContent className="bg-popover">
            {DURATIONS.map((duration) => (
              <SelectItem key={duration} value={duration.toString()}>
                {duration} {duration === 1 ? "hour" : "hours"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Time Selector */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">Start Time</label>
        <Select value={selectedTime} onValueChange={onTimeChange}>
          <SelectTrigger className="w-full">
            <Clock className="mr-2 h-4 w-4" />
            <SelectValue placeholder="Select time" />
          </SelectTrigger>
          <SelectContent className="bg-popover max-h-60">
            {getAvailableTimeSlots().map((time) => (
              <SelectItem key={time} value={time}>
                {formatTimeDisplay(time)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
