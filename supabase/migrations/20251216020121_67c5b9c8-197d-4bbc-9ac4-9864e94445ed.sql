-- Create clubhouse posts table
CREATE TABLE public.clubhouse_posts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  image_url TEXT,
  upvote_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create clubhouse comments table
CREATE TABLE public.clubhouse_comments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id UUID NOT NULL REFERENCES public.clubhouse_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create clubhouse upvotes table (to track who upvoted what)
CREATE TABLE public.clubhouse_upvotes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id UUID NOT NULL REFERENCES public.clubhouse_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(post_id, user_id)
);

-- Enable RLS
ALTER TABLE public.clubhouse_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clubhouse_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clubhouse_upvotes ENABLE ROW LEVEL SECURITY;

-- Posts policies: Members can view and create, admins can delete
CREATE POLICY "Members can view posts"
ON public.clubhouse_posts FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() 
    AND membership_tier != 'visitor'
  )
);

CREATE POLICY "Members can create posts"
ON public.clubhouse_posts FOR INSERT
WITH CHECK (
  auth.uid() = user_id AND
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() 
    AND membership_tier != 'visitor'
  )
);

CREATE POLICY "Users can update own posts"
ON public.clubhouse_posts FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Admins can delete posts"
ON public.clubhouse_posts FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can delete own posts"
ON public.clubhouse_posts FOR DELETE
USING (auth.uid() = user_id);

-- Comments policies
CREATE POLICY "Members can view comments"
ON public.clubhouse_comments FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() 
    AND membership_tier != 'visitor'
  )
);

CREATE POLICY "Members can create comments"
ON public.clubhouse_comments FOR INSERT
WITH CHECK (
  auth.uid() = user_id AND
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() 
    AND membership_tier != 'visitor'
  )
);

CREATE POLICY "Users can delete own comments"
ON public.clubhouse_comments FOR DELETE
USING (auth.uid() = user_id);

CREATE POLICY "Admins can delete comments"
ON public.clubhouse_comments FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Upvotes policies
CREATE POLICY "Members can view upvotes"
ON public.clubhouse_upvotes FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() 
    AND membership_tier != 'visitor'
  )
);

CREATE POLICY "Members can create upvotes"
ON public.clubhouse_upvotes FOR INSERT
WITH CHECK (
  auth.uid() = user_id AND
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() 
    AND membership_tier != 'visitor'
  )
);

CREATE POLICY "Users can delete own upvotes"
ON public.clubhouse_upvotes FOR DELETE
USING (auth.uid() = user_id);

-- Create storage bucket for post images
INSERT INTO storage.buckets (id, name, public)
VALUES ('clubhouse-images', 'clubhouse-images', true);

-- Storage policies for clubhouse images
CREATE POLICY "Members can upload clubhouse images"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'clubhouse-images' AND
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() 
    AND membership_tier != 'visitor'
  )
);

CREATE POLICY "Anyone can view clubhouse images"
ON storage.objects FOR SELECT
USING (bucket_id = 'clubhouse-images');

CREATE POLICY "Users can delete own clubhouse images"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'clubhouse-images' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Create trigger for updated_at
CREATE TRIGGER update_clubhouse_posts_updated_at
BEFORE UPDATE ON public.clubhouse_posts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes for performance
CREATE INDEX idx_clubhouse_posts_user_id ON public.clubhouse_posts(user_id);
CREATE INDEX idx_clubhouse_posts_created_at ON public.clubhouse_posts(created_at DESC);
CREATE INDEX idx_clubhouse_comments_post_id ON public.clubhouse_comments(post_id);
CREATE INDEX idx_clubhouse_upvotes_post_id ON public.clubhouse_upvotes(post_id);