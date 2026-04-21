ALTER TABLE public.local_competitions
  ADD COLUMN IF NOT EXISTS course_id integer,
  ADD COLUMN IF NOT EXISTS course_name text,
  ADD COLUMN IF NOT EXISTS tees text DEFAULT 'White',
  ADD COLUMN IF NOT EXISTS green_speed integer DEFAULT 11,
  ADD COLUMN IF NOT EXISTS green_firmness text DEFAULT 'Normal',
  ADD COLUMN IF NOT EXISTS fairway_firmness text DEFAULT 'Normal',
  ADD COLUMN IF NOT EXISTS pins text DEFAULT 'Thursday',
  ADD COLUMN IF NOT EXISTS wind text DEFAULT 'Calm';