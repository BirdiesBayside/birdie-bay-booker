BEGIN;

-- mrswhy@mail.com: 5-hour pack wrongly redeemed as $200 deposit -> convert to 5 hour credits
UPDATE profiles SET deposit_balance = deposit_balance - 200, hour_credit_balance = COALESCE(hour_credit_balance,0) + 5 WHERE user_id = 'd644e6dd-349e-4949-ac9d-18420eea0d09';
INSERT INTO deposit_transactions (user_id, amount, balance_before, balance_after, transaction_type, description, related_gift_card_id)
VALUES ('d644e6dd-349e-4949-ac9d-18420eea0d09', -200, 200, 0, 'adjustment', 'Correction: 5-hour gift pack was credited as dollars — converted to hour credits', 'd8454fb7-488e-499d-89e9-ce0607849d96');
INSERT INTO hour_credit_transactions (user_id, amount, balance_before, balance_after, transaction_type, description, related_gift_card_id)
VALUES ('d644e6dd-349e-4949-ac9d-18420eea0d09', 5, 0, 5, 'gift_card', 'Gift card redemption - hour credits (correction)', 'd8454fb7-488e-499d-89e9-ce0607849d96');

-- kye_wilson@y7mail.com: 2-hour pack double-granted (2 hours + $80) -> remove the $80
UPDATE profiles SET deposit_balance = deposit_balance - 80 WHERE user_id = '539f433b-0eaf-46da-9bf5-ecde8feddd40';
INSERT INTO deposit_transactions (user_id, amount, balance_before, balance_after, transaction_type, description, related_gift_card_id)
VALUES ('539f433b-0eaf-46da-9bf5-ecde8feddd40', -80, 80, 0, 'adjustment', 'Correction: 2-hour gift pack also credited as dollars by mistake — dollars removed, 2 hours kept', '1639e218-5c3f-4c8b-83cd-a5d059890aaf');

COMMIT;