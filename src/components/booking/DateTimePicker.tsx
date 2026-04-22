import { useState, useEffect } from "react";
import { format, isToday } from "date-fns";
import { CalendarIcon, Clock, Trophy } from "lucide-react";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// Wednesday Ambrose comp window (Brisbane time): 5:00pm – 7:00pm
// Customers selecting a slot in this window are prompted to confirm comp entry.
const COMP_DAY = 3; // Wednesday
const COMP_START_MIN = 17 * 60; // 5:00pm
const COMP_END_MIN = 19 * 60;   // 7:00pm
const COMP_LOCKED_DURATION = 2;
const COMP_LOCKED_PLAYERS = 2;
const COMP_LOCKED_TIME = "17:00";

const isInCompWindow = (date: Date | undefined, time: string | undefined) => {
  if (!date || !time) return false;
  if (date.getDay() !== COMP_DAY) return false;
  const [h, m] = time.split(":").map(Number);
  const mins = h * 60 + m;
  return mins >= COMP_START_MIN && mins < COMP_END_MIN;
};

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
  const [compPromptOpen, setCompPromptOpen] = useState(false);
  const [compLocked, setCompLocked] = useState(false);
  const [pendingCompTime, setPendingCompTime] = useState<string | null>(null);

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
    // Reset comp lock when date changes
    setCompLocked(false);
  }, [selectedDate]);

  const handleDateSelect = (date: Date | undefined) => {
    onDateChange(date);
    setCalendarOpen(false);
  };

  // Intercept time changes to prompt for Wednesday comp night
  const handleTimeSelect = (time: string) => {
    if (!compLocked && isInCompWindow(selectedDate, time)) {
      setPendingCompTime(time);
      setCompPromptOpen(true);
      return;
    }
    onTimeChange(time);
  };

  const handleCompYes = () => {
    setCompLocked(true);
    setCompPromptOpen(false);
    setPendingCompTime(null);
    // Lock to 5pm start, 2hr, 2 players
    onTimeChange(COMP_LOCKED_TIME);
    onDurationChange(COMP_LOCKED_DURATION);
    onPlayersChange(COMP_LOCKED_PLAYERS);
  };

  const handleCompNo = () => {
    setCompPromptOpen(false);
    if (pendingCompTime) onTimeChange(pendingCompTime);
    setPendingCompTime(null);
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
