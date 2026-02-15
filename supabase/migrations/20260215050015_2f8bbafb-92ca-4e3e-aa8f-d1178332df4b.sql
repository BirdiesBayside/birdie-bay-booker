-- Allow users to delete their own PENDING bookings (needed for retry/see-through logic)
CREATE POLICY "Users can delete their own pending bookings"
ON public.bookings
FOR DELETE
USING (auth.uid() = user_id AND status = 'pending');