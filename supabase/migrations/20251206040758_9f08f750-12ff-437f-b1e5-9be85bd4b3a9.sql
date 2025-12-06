-- Create membership tier enum
CREATE TYPE public.membership_tier AS ENUM ('visitor', 'par', 'birdie', 'eagle', 'albatross');

-- Add membership tier to profiles
ALTER TABLE public.profiles 
ADD COLUMN membership_tier public.membership_tier NOT NULL DEFAULT 'visitor';

-- Create bays table
CREATE TABLE public.bays (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  bay_number INTEGER NOT NULL UNIQUE,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Insert 6 bays
INSERT INTO public.bays (bay_number, name) VALUES
  (1, 'Bay 1'),
  (2, 'Bay 2'),
  (3, 'Bay 3'),
  (4, 'Bay 4'),
  (5, 'Bay 5'),
  (6, 'Bay 6');

-- Enable RLS on bays (public read)
ALTER TABLE public.bays ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active bays"
ON public.bays FOR SELECT
USING (is_active = true);

-- Create bookings table
CREATE TABLE public.bookings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  bay_id UUID NOT NULL REFERENCES public.bays(id),
  booking_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  duration_hours INTEGER NOT NULL CHECK (duration_hours BETWEEN 1 AND 4),
  hourly_rate DECIMAL(10,2) NOT NULL,
  total_price DECIMAL(10,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled', 'completed')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on bookings
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

-- Users can view their own bookings
CREATE POLICY "Users can view their own bookings"
ON public.bookings FOR SELECT
USING (auth.uid() = user_id);

-- Users can create their own bookings
CREATE POLICY "Users can create their own bookings"
ON public.bookings FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Anyone can view bookings for availability check (only date/time/bay, not user details)
CREATE POLICY "Anyone can check availability"
ON public.bookings FOR SELECT
USING (status = 'confirmed');

-- Create index for faster availability queries
CREATE INDEX idx_bookings_availability ON public.bookings(bay_id, booking_date, start_time, end_time) WHERE status = 'confirmed';

-- Add trigger for updated_at
CREATE TRIGGER update_bookings_updated_at
BEFORE UPDATE ON public.bookings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();