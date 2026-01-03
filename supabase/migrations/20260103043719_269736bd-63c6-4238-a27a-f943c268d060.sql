-- Update visitor to have peak rate (we'll handle off-peak in code)
UPDATE pricing_config SET hourly_rate = 35, updated_at = now() WHERE tier = 'visitor';

-- Delete par and albatross tiers (we'll migrate members separately)
DELETE FROM pricing_config WHERE tier IN ('par', 'albatross');

-- Update birdie tier with new pricing and Stripe IDs
UPDATE pricing_config 
SET hourly_rate = 10, 
    weekly_subscription_price = 27,
    stripe_product_id = 'prod_TioC3XI7T8GpXd',
    stripe_price_id = 'price_1SlMZjLpXZPXTNVBK7nr4Wsr',
    display_order = 2,
    updated_at = now()
WHERE tier = 'birdie';

-- Update eagle tier with new pricing and Stripe IDs  
UPDATE pricing_config 
SET hourly_rate = 8, 
    weekly_subscription_price = 35,
    stripe_product_id = 'prod_TioCdsw2GO5v5T',
    stripe_price_id = 'price_1SlMZtLpXZPXTNVBfgjiczGa',
    display_order = 3,
    updated_at = now()
WHERE tier = 'eagle';

-- Insert new weekday tier
INSERT INTO pricing_config (tier, display_name, hourly_rate, weekly_subscription_price, stripe_product_id, stripe_price_id, display_order, is_subscription)
VALUES ('weekday', 'Weekday Member', 10, 15, 'prod_TioBcaSmquQmwW', 'price_1SlMZXLpXZPXTNVB2aLrl9Qb', 1, true);

-- Update membership_tier enum to add weekday and remove par/albatross
-- First migrate existing par members to birdie
UPDATE profiles SET membership_tier = 'birdie' WHERE membership_tier = 'par';

-- Migrate existing albatross members to eagle  
UPDATE profiles SET membership_tier = 'eagle' WHERE membership_tier = 'albatross';