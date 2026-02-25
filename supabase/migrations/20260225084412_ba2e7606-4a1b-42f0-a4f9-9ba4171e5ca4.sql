
-- Create a function that auto-redeems pending gift cards when a new profile is created
CREATE OR REPLACE FUNCTION public.auto_redeem_gift_cards()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  gc RECORD;
  current_balance numeric;
  new_balance numeric;
BEGIN
  -- Find all pending/sent gift cards for this email
  FOR gc IN
    SELECT id, amount FROM gift_cards
    WHERE recipient_email = LOWER(TRIM(NEW.email))
      AND status IN ('pending', 'sent')
  LOOP
    -- Get current balance (might have been updated by a previous iteration)
    SELECT deposit_balance INTO current_balance FROM profiles WHERE id = NEW.id;
    new_balance := COALESCE(current_balance, 0) + gc.amount;

    -- Update balance
    UPDATE profiles SET deposit_balance = new_balance WHERE id = NEW.id;

    -- Mark gift card as redeemed
    UPDATE gift_cards
    SET status = 'redeemed',
        redeemed_at = now(),
        redeemed_by_user_id = NEW.user_id
    WHERE id = gc.id;

    -- Log the transaction
    INSERT INTO deposit_transactions (user_id, amount, balance_before, balance_after, transaction_type, description)
    VALUES (NEW.user_id, gc.amount, COALESCE(current_balance, 0), new_balance, 'gift_card', 'Gift card credit - auto-redeemed on account creation');

    RAISE LOG '[auto-redeem-gift-cards] Redeemed gift card % ($%) for %', gc.id, gc.amount, NEW.email;
  END LOOP;

  RETURN NEW;
END;
$$;

-- Attach trigger to profiles table - fires AFTER insert so the profile row exists
CREATE TRIGGER trigger_auto_redeem_gift_cards
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_redeem_gift_cards();
