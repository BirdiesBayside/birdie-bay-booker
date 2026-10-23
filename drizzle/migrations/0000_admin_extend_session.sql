CREATE OR REPLACE FUNCTION public.admin_extend_session(p_booking_id uuid, p_expected_end_time time, p_additional_minutes integer DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b public.bookings%ROWTYPE;
  closing time;
  limit_time time;
  next_time time;
  max_minutes integer;
  new_end time;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;
  IF p_additional_minutes IS NOT NULL THEN
    IF p_additional_minutes < 30 OR p_additional_minutes > 240 OR p_additional_minutes % 30 <> 0 THEN
      RAISE EXCEPTION 'Choose 30-minute increments up to 4 extra hours';
    END IF;
    -- Serialize with all booking and block writes, including existing customer flows.
    LOCK TABLE public.bookings IN SHARE ROW EXCLUSIVE MODE;
    LOCK TABLE public.bay_blocks IN SHARE ROW EXCLUSIVE MODE;
  END IF;
  SELECT * INTO b FROM public.bookings WHERE id = p_booking_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found'; END IF;
  IF b.status <> 'confirmed' THEN RAISE EXCEPTION 'Only confirmed bookings can be extended'; END IF;
  IF (b.booking_date + b.end_time) AT TIME ZONE 'Australia/Brisbane' <= now() THEN
    RAISE EXCEPTION 'This session has ended';
  END IF;
  IF p_expected_end_time IS NULL OR b.end_time <> p_expected_end_time THEN
    RAISE EXCEPTION 'Booking has changed. Reopen it and check the latest times';
  END IF;
  SELECT close_time INTO closing FROM public.operating_hours
    WHERE day_of_week = extract(dow from b.booking_date)::integer AND is_open;
  IF closing IS NULL THEN RAISE EXCEPTION 'Closing time unavailable for this date'; END IF;
  limit_time := closing;
  SELECT min(start_time) INTO next_time FROM public.bookings
    WHERE bay_id = b.bay_id AND booking_date = b.booking_date AND id <> b.id
      AND status IN ('confirmed','pending') AND end_time > b.end_time;
  IF next_time IS NOT NULL THEN limit_time := least(limit_time, next_time); END IF;
  SELECT min(start_time) INTO next_time FROM public.bay_blocks
    WHERE bay_id = b.bay_id AND block_date = b.booking_date AND end_time > b.end_time;
  IF next_time IS NOT NULL THEN limit_time := least(limit_time, next_time); END IF;
  max_minutes := greatest(0, least(240, floor(extract(epoch from (limit_time - b.end_time)) / 1800)::integer * 30));
  IF p_additional_minutes IS NULL THEN
    RETURN jsonb_build_object('max_minutes', max_minutes, 'end_time', b.end_time);
  END IF;
  IF p_additional_minutes > max_minutes THEN
    RAISE EXCEPTION 'That extra time is no longer available. Check availability again';
  END IF;
  new_end := b.end_time + make_interval(mins => p_additional_minutes);
  -- Purchased duration and all payment/credit fields deliberately remain unchanged.
  UPDATE public.bookings SET end_time = new_end,
    notes = concat_ws(E'\n', nullif(notes,''), format('[EXTENSION] %s complimentary minutes added by %s at %s AEST; finish %s → %s', p_additional_minutes, auth.uid(), to_char(now() AT TIME ZONE 'Australia/Brisbane', 'YYYY-MM-DD HH24:MI'), b.end_time, new_end))
    WHERE id = b.id;
  RETURN jsonb_build_object('max_minutes', max_minutes, 'end_time', new_end);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_extend_session(uuid,time,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_extend_session(uuid,time,integer) TO authenticated;