-- Add 'weekday' to the membership_tier enum
ALTER TYPE membership_tier ADD VALUE IF NOT EXISTS 'weekday' AFTER 'visitor';