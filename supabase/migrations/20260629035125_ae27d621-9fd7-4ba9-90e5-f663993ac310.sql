
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS booking_flag_enabled boolean NOT NULL DEFAULT false;

UPDATE public.profiles
SET booking_flag_enabled = true
WHERE lower(email) IN ('luke.p.taylor81@gmail.com', 'jannie2909@gmail.com');

INSERT INTO public.email_templates (template_key, name, description, subject, html_content, is_active)
VALUES (
  'watched_customer_alert',
  'Watched Customer Booking Alert',
  'Internal admin alert sent to admin@birdiesbayside.com.au whenever a customer with the booking flag enabled makes a new booking. Tags: {first_name}, {last_name}, {email}, {phone}, {booking_date}, {booking_time}, {end_time}, {duration}, {bay_name}, {player_count}, {total_price}, {membership_tier}.',
  '⚠️ Watched Customer Booking: {first_name} {last_name}',
  '<p style="margin:0 0 18px; font-family:Inter, Arial, sans-serif; font-size:16px; line-height:1.6; color:#1F4C25; text-align:center;"><strong>{first_name} {last_name}</strong> ({email}) has just made a new booking.</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#FFFFFF; border-radius:12px; margin:18px 0; border-left:4px solid #EC622D;"><tr><td style="padding:20px; font-family:Inter, Arial, sans-serif; font-size:15px; color:#1F4C25;"><p style="margin:5px 0;"><strong>Date:</strong> {booking_date}</p><p style="margin:5px 0;"><strong>Time:</strong> {booking_time} - {end_time}</p><p style="margin:5px 0;"><strong>Duration:</strong> {duration} hour(s)</p><p style="margin:5px 0;"><strong>Bay:</strong> {bay_name}</p><p style="margin:5px 0;"><strong>Players:</strong> {player_count}</p><p style="margin:5px 0;"><strong>Total:</strong> {total_price}</p><p style="margin:5px 0;"><strong>Phone:</strong> {phone}</p><p style="margin:5px 0;"><strong>Membership:</strong> {membership_tier}</p></td></tr></table>',
  true
)
ON CONFLICT (template_key) DO NOTHING;
