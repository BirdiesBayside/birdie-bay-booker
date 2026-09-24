UPDATE email_templates
SET
  name = 'Membership Benefit',
  description = 'Automated campaign inviting regular visitors (2-5 bookings in 8 weeks) to become Birdie members at $10/hr.',
  subject = '{first_name}, you''re in enough to be a member — sessions drop to $10/hr',
  html_content = '<h1 style="margin:0 0 14px; font-family:Anton, Impact, Arial Black, sans-serif; font-size:34px; line-height:1.1; color:#1F4C25; text-align:center;">YOU''RE BASICALLY A REGULAR</h1>
<p style="margin:0 0 18px; font-family:Inter, Arial, sans-serif; font-size:16px; line-height:1.6; color:#1F4C25; text-align:center;">
  Hi {first_name}, you''ve been in {booking_count} times over the last 8 weeks. We love having you in the bays — so here''s the deal that''s made for people like you.
</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
  <tr>
    <td align="center" style="padding:18px; background:#FFF5E4; border-radius:12px;">
      <div style="font-family:Inter, Arial, sans-serif; font-size:13px; letter-spacing:1px; text-transform:uppercase; color:#1F4C25; opacity:0.7;">Birdie Membership</div>
      <div style="font-family:Anton, Impact, Arial Black, sans-serif; font-size:40px; line-height:1.1; color:#EC622D; margin:6px 0;">$10<span style="font-size:20px;">/hour</span></div>
      <div style="font-family:Inter, Arial, sans-serif; font-size:14px; color:#1F4C25;">Peak or off-peak, every session. Just $27/week.</div>
    </td>
  </tr>
</table>
<p style="margin:0 0 10px; font-family:Inter, Arial, sans-serif; font-size:16px; line-height:1.6; color:#1F4C25;">
  Right now you''re paying visitor rates of up to $40 an hour. As a member, an hour in the bay is $10 — so if you''re playing around once a week, membership pays for itself and the rest is upside.
</p>
<p style="margin:0 0 8px; font-family:Inter, Arial, sans-serif; font-size:16px; line-height:1.6; color:#1F4C25;">Members also get:</p>
<ul style="margin:0 0 20px; padding-left:20px; font-family:Inter, Arial, sans-serif; font-size:15px; line-height:1.8; color:#1F4C25;">
  <li>$10/hour on every booking, any time of day</li>
  <li>Extended booking window so you can lock in your spot</li>
  <li>Entry to our weekly SGT online league and in-house comps</li>
  <li>Cancel any time — no lock-in contract</li>
</ul>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 10px;">
  <tr>
    <td align="center">
      <a href="https://birdiesbayside.com.au/membership" style="display:inline-block; padding:14px 32px; background:#EC622D; color:#FFFFFF; font-family:Anton, Impact, Arial Black, sans-serif; font-size:18px; letter-spacing:1px; text-transform:uppercase; text-decoration:none; border-radius:8px;">Become a Member</a>
    </td>
  </tr>
</table>
<p style="margin:16px 0 0; font-family:Inter, Arial, sans-serif; font-size:14px; line-height:1.6; color:#1F4C25; text-align:center; opacity:0.8;">
  Questions? Just reply to this email and we''ll sort you out.
</p>',
  is_active = true
WHERE template_key = 'membership_benefit';
