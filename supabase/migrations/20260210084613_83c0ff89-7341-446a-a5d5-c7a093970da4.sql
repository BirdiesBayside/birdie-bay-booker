CREATE POLICY "Anyone can view active products"
ON public.pos_products
FOR SELECT
USING (is_active = true);