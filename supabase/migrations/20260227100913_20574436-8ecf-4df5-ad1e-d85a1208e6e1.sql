
-- Create membership_changes audit table
CREATE TABLE public.membership_changes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  previous_tier TEXT NOT NULL,
  new_tier TEXT NOT NULL,
  changed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Index for efficient weekly lookups
CREATE INDEX idx_membership_changes_changed_at ON public.membership_changes (changed_at DESC);

-- Enable RLS
ALTER TABLE public.membership_changes ENABLE ROW LEVEL SECURITY;

-- Admins can view all changes
CREATE POLICY "Admins can view membership changes"
  ON public.membership_changes
  FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Service role can insert (trigger runs as SECURITY DEFINER)
CREATE POLICY "Service can insert membership changes"
  ON public.membership_changes
  FOR INSERT
  WITH CHECK (true);

-- Trigger function to log tier changes
CREATE OR REPLACE FUNCTION public.log_membership_tier_change()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.membership_tier IS DISTINCT FROM NEW.membership_tier THEN
    INSERT INTO public.membership_changes (user_id, previous_tier, new_tier)
    VALUES (NEW.user_id, OLD.membership_tier::text, NEW.membership_tier::text);
  END IF;
  RETURN NEW;
END;
$$;

-- Attach trigger to profiles table
CREATE TRIGGER trg_log_membership_tier_change
  AFTER UPDATE OF membership_tier ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.log_membership_tier_change();
