CREATE OR REPLACE FUNCTION public.auto_redeem_gift_cards()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  gc RECORD;
  current_balance numeric;
  new_balance numeric;
  current_hours numeric;
  new_hours numeric;
BEGIN
  FOR gc IN
    SELECT id, amount, credit_hours FROM gift_cards
    WHERE recipient_email = LOWER(TRIM(NEW.email))
      AND status IN ('pending', 'sent')
  LOOP
    -- Hour packs grant hour credits only; their dollar amount is the purchase price
    IF COALESCE(gc.credit_hours, 0) > 0 THEN
      SELECT hour_credit_balance INTO current_hours FROM profiles WHERE id = NEW.id;
      new_hours := COALESCE(current_hours, 0) + gc.credit_hours;

      UPDATE profiles SET hour_credit_balance = new_hours WHERE id = NEW.id;

      UPDATE gift_cards
      SET status = 'redeemed',
          redeemed_at = now(),
          redeemed_by_user_id = NEW.user_id
      WHERE id = gc.id;

      INSERT INTO hour_credit_transactions (user_id, amount, balance_before, balance_after, transaction_type, description, related_gift_card_id)
      VALUES (NEW.user_id, gc.credit_hours, COALESCE(current_hours, 0), new_hours, 'gift_card', 'Gift card credit - auto-redeemed on account creation', gc.id);

      RAISE LOG '[auto-redeem-gift-cards] Redeemed hour pack % (% hours) for %', gc.id, gc.credit_hours, NEW.email;
    ELSE
      SELECT deposit_balance INTO current_balance FROM profiles WHERE id = NEW.id;
      new_balance := COALESCE(current_balance, 0) + gc.amount;

      UPDATE profiles SET deposit_balance = new_balance WHERE id = NEW.id;

      UPDATE gift_cards
      SET status = 'redeemed',
          redeemed_at = now(),
          redeemed_by_user_id = NEW.user_id
      WHERE id = gc.id;

      INSERT INTO deposit_transactions (user_id, amount, balance_before, balance_after, transaction_type, description, related_gift_card_id)
      VALUES (NEW.user_id, gc.amount, COALESCE(current_balance, 0), new_balance, 'gift_card', 'Gift card credit - auto-redeemed on account creation', gc.id);

      RAISE LOG '[auto-redeem-gift-cards] Redeemed gift card % ($%) for %', gc.id, gc.amount, NEW.email;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$function$