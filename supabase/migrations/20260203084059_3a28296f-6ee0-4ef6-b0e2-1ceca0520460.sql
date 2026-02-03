-- Add public SELECT policies for TV embed displays
-- These tables contain non-sensitive metadata (names, dates, statuses)

CREATE POLICY "Public can view tours" 
ON public.sgt_tours
FOR SELECT 
USING (true);

CREATE POLICY "Public can view tournaments" 
ON public.sgt_tournaments
FOR SELECT 
USING (true);