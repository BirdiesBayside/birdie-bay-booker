-- Enable pg_net extension for HTTP requests from database
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Function to call SGT auto-register edge function when sgt_user_id is set
CREATE OR REPLACE FUNCTION public.trigger_sgt_auto_register()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  supabase_url TEXT;
  service_role_key TEXT;
BEGIN
  -- Only trigger if sgt_user_id is being set (was NULL, now has value)
  IF OLD.sgt_user_id IS NULL AND NEW.sgt_user_id IS NOT NULL THEN
    -- Get supabase URL from env
    supabase_url := current_setting('app.settings.supabase_url', true);
    
    -- If we can't get the URL from settings, use hardcoded value
    IF supabase_url IS NULL OR supabase_url = '' THEN
      supabase_url := 'https://hltrcuypuxhetcjyvedl.supabase.co';
    END IF;
    
    -- Make async HTTP call to edge function using pg_net
    PERFORM net.http_post(
      url := supabase_url || '/functions/v1/sgt-auto-register',
      headers := jsonb_build_object(
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object(
        'sgt_user_id', NEW.sgt_user_id
      )
    );
    
    RAISE LOG '[SGT-AUTO-REG] Triggered for sgt_user_id: %', NEW.sgt_user_id;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger on profiles table
DROP TRIGGER IF EXISTS on_sgt_user_id_set ON public.profiles;
CREATE TRIGGER on_sgt_user_id_set
  AFTER UPDATE OF sgt_user_id ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_sgt_auto_register();