-- Create table to cache SGT courses
CREATE TABLE public.sgt_courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id integer NOT NULL UNIQUE,
  course_key text,
  name text NOT NULL,
  par integer,
  difficulty integer,
  course_designer text,
  city text,
  state text,
  country text,
  course_location text,
  elevation_in_feet integer,
  thumbnail_url text,
  description text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.sgt_courses ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to view courses
CREATE POLICY "Authenticated users can view courses"
ON public.sgt_courses
FOR SELECT
USING (true);

-- Create index for faster lookups
CREATE INDEX idx_sgt_courses_course_id ON public.sgt_courses(course_id);
CREATE INDEX idx_sgt_courses_name ON public.sgt_courses(name);
CREATE INDEX idx_sgt_courses_country ON public.sgt_courses(country);

-- Add updated_at trigger
CREATE TRIGGER update_sgt_courses_updated_at
BEFORE UPDATE ON public.sgt_courses
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();