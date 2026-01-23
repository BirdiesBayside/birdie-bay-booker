-- Add display_order column to pos_products for manual ordering
ALTER TABLE public.pos_products ADD COLUMN IF NOT EXISTS display_order integer DEFAULT 0;

-- Set initial display_order based on current order (family, name)
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY family NULLS LAST, name) as rn
  FROM public.pos_products
)
UPDATE public.pos_products p
SET display_order = n.rn
FROM numbered n
WHERE p.id = n.id;