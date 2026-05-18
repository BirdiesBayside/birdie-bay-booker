
-- Add Shopify-related fields to gift_cards
ALTER TABLE public.gift_cards
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS shopify_order_id text,
  ADD COLUMN IF NOT EXISTS shopify_line_item_id text,
  ADD COLUMN IF NOT EXISTS shopify_order_number text,
  ADD COLUMN IF NOT EXISTS recipient_name text,
  ADD COLUMN IF NOT EXISTS sender_name text,
  ADD COLUMN IF NOT EXISTS sender_email text,
  ADD COLUMN IF NOT EXISTS personal_message text,
  ADD COLUMN IF NOT EXISTS scheduled_for date,
  ADD COLUMN IF NOT EXISTS sent_at timestamptz;

-- Allow 'scheduled' status
ALTER TABLE public.gift_cards DROP CONSTRAINT IF EXISTS gift_cards_status_check;
ALTER TABLE public.gift_cards ADD CONSTRAINT gift_cards_status_check
  CHECK (status = ANY (ARRAY['pending'::text, 'scheduled'::text, 'redeemed'::text, 'cancelled'::text]));

-- Idempotency: one card per shopify line item
CREATE UNIQUE INDEX IF NOT EXISTS gift_cards_shopify_line_item_uidx
  ON public.gift_cards (shopify_order_id, shopify_line_item_id)
  WHERE shopify_order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS gift_cards_scheduled_for_idx
  ON public.gift_cards (scheduled_for) WHERE status = 'scheduled';
