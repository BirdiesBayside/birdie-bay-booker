INSERT INTO public.email_templates (template_key, name, description, subject, html_content, is_active)
VALUES (
  'membership_benefit',
  'Membership Benefit',
  'Automated campaign: emailed daily to visitors with 2-5 bookings in the last 8 weeks showing their membership maths. Tags: {first_name} {booking_count} {hours} {visitor_spend} {member_cost} {savings} {savings_line}',
  'Your Birdies maths, {first_name} — member sessions are just $10/hr',
  '<h1 style="margin:0 0 14px; font-family:Anton, Impact, Arial Black, sans-serif; font-size:34px; line-height:1.1; color:#1F4C25; text-align:center;">You''re Basically A Regular Now</h1>
<p style="margin:0 0 18px; font-family:Inter, Arial, sans-serif; font-size:16px; line-height:1.6; color:#1F4C25; text-align:center;">
  Hi {first_name}, you''ve played {booking_count} times in the last 8 weeks — here''s what that looks like as a Birdie member.
</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#1F4C25; border-radius:12px; margin:18px 0;">
  <tr>
    <td style="padding:26px; text-align:center;">
      <p style="margin:0 0 6px; font-family:Inter, Arial, sans-serif; font-size:14px; color:#FFF5E4;">Your last 8 weeks as a visitor</p>
      <p style="margin:0; font-family:Anton, Impact, Arial Black, sans-serif; font-size:40px; color:#FFF5E4;">{visitor_spend}</p>
      <p style="margin:14px 0 6px; font-family:Inter, Arial, sans-serif; font-size:14px; color:#FFF5E4;">The same golf as a Birdie member</p>
      <p style="margin:0; font-family:Anton, Impact, Arial Black, sans-serif; font-size:40px; color:#EC622D;">{member_cost}</p>
      <p style="margin:10px 0 0; font-family:Inter, Arial, sans-serif; font-size:14px; color:#FFF5E4;">{savings_line}</p>
    </td>
  </tr>
</table>
<p style="margin:18px 0 0; font-family:Inter, Arial, sans-serif; font-size:16px; line-height:1.6; color:#1F4C25; text-align:center;">
  Birdie membership is <strong>$27/week</strong> and every session drops to just <strong>$10/hour</strong> — peak or off-peak. The more you play, the better it gets.
</p>
<table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="margin:22px auto 0;">
  <tr>
    <td bgcolor="#EC622D" style="border-radius:12px;">
      <a href="https://hub.birdiesbayside.com.au/membership" style="display:inline-block; padding:14px 28px; font-family:Anton, Impact, Arial Black, sans-serif; font-size:18px; color:#FFFFFF; text-decoration:none;">See Membership Options</a>
    </td>
  </tr>
</table>',
  true
)
ON CONFLICT (template_key) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    subject = EXCLUDED.subject,
    html_content = EXCLUDED.html_content,
    is_active = EXCLUDED.is_active;

DELETE FROM public.marketing_templates
WHERE name = 'Membership Benefit' AND category = 'automated';