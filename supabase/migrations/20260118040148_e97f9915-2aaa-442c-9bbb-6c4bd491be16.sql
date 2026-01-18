-- Fix gift_cards foreign key to allow user deletion
-- Drop the existing constraint and recreate with ON DELETE SET NULL

ALTER TABLE public.gift_cards 
DROP CONSTRAINT IF EXISTS gift_cards_redeemed_by_user_id_fkey;

ALTER TABLE public.gift_cards 
DROP CONSTRAINT IF EXISTS gift_cards_issued_by_fkey;

-- Recreate with SET NULL so gift card records are preserved but user reference is cleared
ALTER TABLE public.gift_cards 
ADD CONSTRAINT gift_cards_redeemed_by_user_id_fkey 
FOREIGN KEY (redeemed_by_user_id) 
REFERENCES auth.users(id) 
ON DELETE SET NULL;

ALTER TABLE public.gift_cards 
ADD CONSTRAINT gift_cards_issued_by_fkey 
FOREIGN KEY (issued_by) 
REFERENCES auth.users(id) 
ON DELETE SET NULL;