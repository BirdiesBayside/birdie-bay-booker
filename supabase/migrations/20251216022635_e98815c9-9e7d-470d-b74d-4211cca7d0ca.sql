-- Create announcements table
CREATE TABLE public.announcements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  is_active BOOLEAN NOT NULL DEFAULT true,
  expires_at TIMESTAMP WITH TIME ZONE
);

-- Create table to track read announcements per user
CREATE TABLE public.announcement_reads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  announcement_id UUID NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
  read_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, announcement_id)
);

-- Enable RLS
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcement_reads ENABLE ROW LEVEL SECURITY;

-- Announcements policies
CREATE POLICY "Admins can manage announcements"
ON public.announcements FOR ALL
USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated users can view active announcements"
ON public.announcements FOR SELECT
USING (is_active = true AND (expires_at IS NULL OR expires_at > now()));

-- Announcement reads policies
CREATE POLICY "Users can view their own reads"
ON public.announcement_reads FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can mark announcements as read"
ON public.announcement_reads FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Index for performance
CREATE INDEX idx_announcements_active ON public.announcements(is_active, expires_at);
CREATE INDEX idx_announcement_reads_user ON public.announcement_reads(user_id);