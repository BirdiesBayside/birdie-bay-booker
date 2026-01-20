-- Add missing admin INSERT policy for bookings table
-- This allows admins to create bookings on behalf of customers

CREATE POLICY "Admins can create bookings for customers"
ON public.bookings
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));