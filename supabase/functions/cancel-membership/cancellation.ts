const WEEK_SECONDS = 7 * 24 * 60 * 60;

export function cancellationPlan(lastPaidAt: number, now: number, paymentFailed: boolean) {
  if (!Number.isFinite(lastPaidAt) || lastPaidAt <= 0) throw new Error("Cannot verify the last successful membership payment.");
  const endsAt = lastPaidAt + WEEK_SECONDS;
  // A cancellation request must never restore benefits lost to a missed payment.
  return { endsAt, scheduled: !paymentFailed && endsAt > now };
}

export function scheduledCancellationSettings(endsAt: number, sendNotification: boolean) {
  return {
    cancel_at: endsAt,
    proration_behavior: "none" as const,
    // Payment can settle later than the billing boundary. Never charge a renewal
    // in the gap between that boundary and seven days after actual payment.
    pause_collection: { behavior: "void" as const },
    metadata: { cancellation_reason: "voluntary", send_cancellation_email: String(sendNotification) },
  };
}