-- Drop the old trigger that fires when sgt_user_id is set on profiles
DROP TRIGGER IF EXISTS on_sgt_user_id_set ON public.profiles;

-- Drop the old trigger function
DROP FUNCTION IF EXISTS public.trigger_sgt_auto_register();

-- Create new trigger function that fires when a member is added to a tour (admin onboarding)
CREATE OR REPLACE FUNCTION public.trigger_sgt_auto_register_on_tour_member()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  supabase_url TEXT;
BEGIN
  -- Only trigger on INSERT (admin adding member to tour)
  IF TG_OP = 'INSERT' THEN
    supabase_url := 'https://hltrcuypuxhetcjyvedl.supabase.co';
    
    -- Make async HTTP call to edge function using pg_net
    PERFORM net.http_post(
      url := supabase_url || '/functions/v1/sgt-auto-register',
      headers := jsonb_build_object(
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object(
        'sgt_user_id', NEW.user_id
      )
    );
    
    RAISE LOG '[SGT-AUTO-REG] Triggered for sgt_user_id: % on tour: %', NEW.user_id, NEW.tour_id;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger on sgt_tour_members table
CREATE TRIGGER on_tour_member_added
  AFTER INSERT ON public.sgt_tour_members
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_sgt_auto_register_on_tour_member();