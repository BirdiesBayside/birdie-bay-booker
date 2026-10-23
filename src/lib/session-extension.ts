export function bookingSlotSpan(startTime: string, endTime: string): number {
  const [startHour, startMinute] = startTime.split(":").map(Number);
  const [endHour, endMinute] = endTime.split(":").map(Number);
  return (endHour * 60 + endMinute - startHour * 60 - startMinute) / 30;
}

export function extensionOptions(maxMinutes: number): number[] {
  const count = Math.max(0, Math.min(8, Math.floor(maxMinutes / 30)));
  return Array.from({ length: count }, (_, i) => (i + 1) * 30);
}

export function extendedEndTime(endTime: string, extraMinutes: number): string {
  const [hour, minute] = endTime.split(":").map(Number);
  const total = hour * 60 + minute + extraMinutes;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}