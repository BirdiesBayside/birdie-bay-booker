-- Add user_game_id column to sgt_members table for the 12-digit SGT UID
ALTER TABLE public.sgt_members 
ADD COLUMN IF NOT EXISTS user_game_id text;