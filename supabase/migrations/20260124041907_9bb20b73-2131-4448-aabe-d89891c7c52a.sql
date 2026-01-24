-- Add membership_on_hold column to profiles table
ALTER TABLE public.profiles 
ADD COLUMN membership_on_hold boolean NOT NULL DEFAULT false;

-- Add a comment explaining the column
COMMENT ON COLUMN public.profiles.membership_on_hold IS 'When true, the member cannot book and is not billed';