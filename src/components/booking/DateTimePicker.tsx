import { useState, useEffect } from "react";
import { format, isToday } from "date-fns";
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
  selectedPlayers: number;
  onDateChange: (date: Date | undefined) => void;
  onTimeChange: (time: string) => void;
  onDurationChange: (duration: number) => void;
  onPlayersChange: (players: number) => void;
}

const OPENING_HOUR = 5;  // 5am
const CLOSING_HOUR = 23; // 11pm

// Generate time slots from 5am to 11pm in 30-min increments
const generateTimeSlots = () => {
  const slots: string[] = [];
  for (let hour = OPENING_HOUR; hour <= CLOSING_HOUR; hour++) {
    slots.push(`${hour.toString().padStart(2, "0")}:00`);
    if (hour < CLOSING_HOUR) {
      slots.push(`${hour.toString().padStart(2, "0")}:30`);
    }
  }
  return slots;
};

const TIME_SLOTS = generateTimeSlots();
const DURATIONS = [1, 2, 3, 4];
const PLAYERS = [1, 2, 3, 4];

// Get the next available time slot (rounded up to nearest 30 min)
const getNextAvailableTimeSlot = (): string => {
  const now = new Date();
  let hour = now.getHours();
  let minute = now.getMinutes();

  // Round up to next 30-min slot
  if (minute > 30) {
    hour += 1;
    minute = 0;
  } else if (minute > 0) {
    minute = 30;
  }

  // If before opening, return opening time
  if (hour < OPENING_HOUR) {
    return `${OPENING_HOUR.toString().padStart(2, "0")}:00`;
  }

  // If past closing, return opening time (for next day logic)
  if (hour >= CLOSING_HOUR) {
    return `${OPENING_HOUR.toString().padStart(2, "0")}:00`;
  }

  return `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
};

export function DateTimePicker({
  selectedDate,
  selectedTime,
  selectedDuration,
  selectedPlayers,
  onDateChange,
  onTimeChange,
  onDurationChange,
  onPlayersChange,
}: DateTimePickerProps) {
  const [calendarOpen, setCalendarOpen] = useState(false);

  // Set default time when date changes
  useEffect(() => {
    if (selectedDate) {
      if (isToday(selectedDate)) {
        const nextSlot = getNextAvailableTimeSlot();
        onTimeChange(nextSlot);
      } else {
        // Future date - default to opening time
        onTimeChange(`${OPENING_HOUR.toString().padStart(2, "0")}:00`);
      }
    }
  }, [selectedDate]);

  const handleDateSelect = (date: Date | undefined) => {
    onDateChange(date);
    setCalendarOpen(false);
  };
  // Filter out time slots that would extend past closing or are in the past for today
  const getAvailableTimeSlots = () => {
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const closingMinutes = CLOSING_HOUR * 60; // 11pm = 1380 minutes

    return TIME_SLOTS.filter((time) => {
      const hour = parseInt(time.split(":")[0]);
      const minute = parseInt(time.split(":")[1]);
      const startMinutes = hour * 60 + minute;
      const endMinutes = startMinutes + (selectedDuration * 60);

      // End time cannot exceed closing time (accounting for minutes)
      if (endMinutes > closingMinutes) return false;

      // If today, filter out past times
      if (selectedDate && isToday(selectedDate)) {
        const nowMinutes = currentHour * 60 + currentMinute;
        if (startMinutes <= nowMinutes) return false;
      }

      return true;
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
        <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
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
              onSelect={handleDateSelect}
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

      {/* Players Selector */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">Number of Players</label>
        <Select
          value={selectedPlayers.toString()}
          onValueChange={(value) => onPlayersChange(parseInt(value))}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select players" />
          </SelectTrigger>
          <SelectContent className="bg-popover">
            {PLAYERS.map((count) => (
              <SelectItem key={count} value={count.toString()}>
                {count} {count === 1 ? "player" : "players"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
