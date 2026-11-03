const WEEK_SECONDS = 7 * 24 * 60 * 60;

export function cancellationPlan(lastPaidAt: number, now: number, paymentFailed: boolean) {
  if (!Number.isFinite(lastPaidAt) || lastPaidAt <= 0) throw new Error("Cannot verify the last successful membership payment.");
  const endsAt = lastPaidAt + WEEK_SECONDS;
  // A cancellation request must never restore benefits lost to a missed payment.
  return { endsAt, scheduled: !paymentFailed && endsAt > now };
}