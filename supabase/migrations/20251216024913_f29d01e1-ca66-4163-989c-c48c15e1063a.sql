-- Add source tracking and members_only flag to announcements
ALTER TABLE public.announcements 
ADD COLUMN IF NOT EXISTS source_type text DEFAULT 'admin',
ADD COLUMN IF NOT EXISTS source_id text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS members_only boolean DEFAULT false;

-- Update RLS policy for viewing announcements to respect members_only flag
DROP POLICY IF EXISTS "Authenticated users can view active announcements" ON public.announcements;

CREATE POLICY "Users can view applicable announcements" 
ON public.announcements 
FOR SELECT 
USING (
  (is_active = true) 
  AND ((expires_at IS NULL) OR (expires_at > now()))
  AND (
    members_only = false 
    OR EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.user_id = auth.uid() 
      AND profiles.membership_tier != 'visitor'
    )
  )
);

-- Create function to notify members when clubhouse post is created
CREATE OR REPLACE FUNCTION public.notify_members_on_clubhouse_post()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  author_name text;
BEGIN
  -- Get author name
  SELECT first_name || ' ' || last_name INTO author_name
  FROM profiles
  WHERE user_id = NEW.user_id;

  -- Create announcement for members
  INSERT INTO announcements (
    title,
    content,
    is_active,
    source_type,
    source_id,
    members_only,
    created_by
  ) VALUES (
    'New Clubhouse Post',
    author_name || ' shared: "' || LEFT(NEW.title, 50) || CASE WHEN LENGTH(NEW.title) > 50 THEN '...' ELSE '' END || '"',
    true,
    'clubhouse_post',
    NEW.id,
    true,
    NEW.user_id
  );

  RETURN NEW;
END;
$$;

-- Create trigger for clubhouse posts
DROP TRIGGER IF EXISTS on_clubhouse_post_created ON public.clubhouse_posts;
CREATE TRIGGER on_clubhouse_post_created
  AFTER INSERT ON public.clubhouse_posts
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_members_on_clubhouse_post();