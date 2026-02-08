-- Add status column to sgt_weekly_prizes for approval workflow
ALTER TABLE public.sgt_weekly_prizes 
ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'approved';

-- Update existing prizes to be approved (they were previously auto-awarded)
UPDATE public.sgt_weekly_prizes SET status = 'approved' WHERE status IS NULL OR status = '';

-- Add comment explaining the column
COMMENT ON COLUMN public.sgt_weekly_prizes.status IS 'pending = awaiting admin approval, approved = credit awarded and email sent';