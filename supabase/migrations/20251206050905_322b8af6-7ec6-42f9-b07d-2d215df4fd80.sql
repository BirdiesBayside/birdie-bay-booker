-- Add player_count column to bookings table
ALTER TABLE public.bookings 
ADD COLUMN player_count integer NOT NULL DEFAULT 1;

-- Add constraint to ensure valid player count (1-4)
ALTER TABLE public.bookings 
ADD CONSTRAINT bookings_player_count_check CHECK (player_count >= 1 AND player_count <= 4);