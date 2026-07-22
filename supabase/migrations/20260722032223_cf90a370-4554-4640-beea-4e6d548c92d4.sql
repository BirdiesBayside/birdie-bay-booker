
-- Allow customers to view their own recording sessions and clips
CREATE POLICY "Users can view their own recording sessions"
  ON public.recording_sessions FOR SELECT
  TO authenticated
  USING (
    booking_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = recording_sessions.booking_id
        AND b.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can view their own recording clips"
  ON public.recording_clips FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.recording_sessions rs
      JOIN public.bookings b ON b.id = rs.booking_id
      WHERE rs.id = recording_clips.recording_session_id
        AND b.user_id = auth.uid()
    )
  );
