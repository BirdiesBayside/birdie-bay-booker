-- Add grace period tracking for payment failures
-- This tracks when the 24-hour clock starts
ALTER TABLE profiles 
ADD COLUMN payment_failed_at TIMESTAMPTZ DEFAULT NULL;