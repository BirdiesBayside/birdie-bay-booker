

# Plan: Multi-Bay Peak Booking Restriction for Members

This plan adds a seamless check that automatically reverts Birdie and Eagle members to visitor rates when they attempt to book a second bay during peak hours, with a clear notification explaining why.

---

## Summary

When a **Birdie** or **Eagle** member already has a bay booked during peak hours and tries to book another bay at the same peak time, the system will:
1. Detect the conflict
2. Automatically apply visitor rates instead of member rates
3. Show a clear message explaining the policy

This happens transparently without adding friction to the booking flow - the member simply sees the adjusted rate.

---

## Business Rules

| Scenario | Rate Applied |
|----------|--------------|
| First peak bay booking | Member rate |
| Second peak bay booking (overlapping time) | Visitor peak rate ($35/hr) |
| Off-peak bookings | Always member rate (no restriction) |
| Weekday members | Already restricted to off-peak, so unaffected |

**Peak times**: Friday-Sunday (all day) + Monday-Thursday (4pm onwards)

---

## Implementation Approach

### Check Location: Rate Calculation Stage

The check happens in the `useBooking` hook when calculating the hourly rate (`getHourlyRate` and `getRateInfo`). This approach:
- Doesn't slow down the booking confirmation step
- Shows the rate change immediately when selecting a bay
- Provides feedback before the member commits to the booking

### Logic Flow

```text
Member selects date/time/bay
        │
        ▼
Is this peak time?
        │
   No ──┴── Yes
   │         │
   │         ▼
   │    Is member Birdie/Eagle?
   │         │
   │    No ──┴── Yes
   │    │         │
   │    │         ▼
   │    │    Does member have another
   │    │    confirmed/pending booking
   │    │    that overlaps this time?
   │    │         │
   │    │    No ──┴── Yes
   │    │    │         │
   ▼    ▼    ▼         ▼
 Member Rate      Visitor Peak Rate ($35/hr)
                  + Show info banner
```

---

## User Experience

When a member triggers the multi-bay restriction, they'll see:

1. **Rate badge changes** from "$10/hr" to "$35/hr"
2. **"Visitor Rate Applied" badge** appears (similar to weekday member restrictions)
3. **Info banner** explaining:
   > "You already have a bay booked at this time. Additional bays during peak hours are charged at visitor rates ($35/hr)."

The booking proceeds normally - no extra steps or confirmations needed.

---

## Technical Details

### Files to Modify

| File | Changes |
|------|---------|
| `src/hooks/useBooking.ts` | Add `checkMultiBayRestriction()` function and integrate with rate calculation |
| `src/pages/Booking.tsx` | Add info banner for multi-bay restriction feedback |
| `src/lib/pricing-utils.ts` | No changes needed - peak detection already exists |

### New Hook Function

```typescript
// Check if member is restricted from using member rate due to existing peak booking
const checkMultiBayRestriction = useCallback(async (
  date: Date,
  startTime: string,
  endTime: string,
  bayId: string
): Promise<boolean> => {
  // Only applies to Birdie/Eagle during peak hours
  if (!["birdie", "eagle"].includes(userMembershipTier)) return false;
  if (!isPeakTime(date, startTime)) return false;
  
  // Check for existing overlapping bookings by this user
  const { data: existingBookings } = await supabase
    .from("bookings")
    .select("id, bay_id, start_time, end_time")
    .eq("user_id", userId)
    .eq("booking_date", format(date, "yyyy-MM-dd"))
    .in("status", ["confirmed", "pending"])
    .neq("bay_id", bayId); // Different bay
  
  // Check for time overlap
  return existingBookings?.some(booking => 
    timesOverlap(startTime, endTime, booking.start_time, booking.end_time)
  ) ?? false;
}, [userMembershipTier, userId]);
```

### Rate Info Update

The `getRateInfo` function will be enhanced to return an additional `isMultiBayRestricted` flag:

```typescript
interface RateInfo {
  rate: number;
  isPeak: boolean;
  isRestricted: boolean;  // Existing weekday restriction
  isMultiBayRestricted: boolean;  // New: true if visitor rate due to multi-bay
}
```

### Database Query

The check uses a simple query on the `bookings` table to find any existing bookings for the same user on the same date that overlap with the selected time slot. This query is already allowed by the existing RLS policies ("Users can view their own bookings").

---

## Edge Cases Handled

| Scenario | Behavior |
|----------|----------|
| Same bay, extend duration | No restriction (same bay) |
| Different bay, no time overlap | No restriction (no conflict) |
| Pending booking exists | Still triggers restriction |
| Admin creates booking for member | Standard logic applies |
| Member cancels first booking | Second booking no longer restricted |

---

## Testing Scenarios

1. **Birdie member, first peak booking** → Member rate ($10/hr)
2. **Birdie member, second peak booking, overlapping time** → Visitor rate ($35/hr) + banner
3. **Birdie member, second peak booking, non-overlapping time** → Member rate ($10/hr)
4. **Birdie member, off-peak booking** → Always member rate (no restriction)
5. **Eagle member, second peak booking** → Same as Birdie (visitor rate)
6. **Weekday member during peak** → Already restricted, no additional check needed
7. **Visitor, any booking** → No member rate to restrict

