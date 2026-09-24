CREATE TABLE public.membership_campaign_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  email text NOT NULL,
  booking_count integer NOT NULL,
  hours numeric NOT NULL DEFAULT 0,
  visitor_spend numeric NOT NULL DEFAULT 0,
  member_cost numeric NOT NULL DEFAULT 0,
  savings numeric NOT NULL DEFAULT 0,
  sent_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.membership_campaign_sends TO authenticated;
GRANT ALL ON public.membership_campaign_sends TO service_role;

ALTER TABLE public.membership_campaign_sends ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read membership campaign sends"
ON public.membership_campaign_sends
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_membership_campaign_sends_user_sent
ON public.membership_campaign_sends (user_id, sent_at DESC);

INSERT INTO public.marketing_templates (name, description, subject, html_content, category, is_active)
VALUES (
  'Membership Benefit',
  'Automated campaign for visitors with 2-5 bookings in the last 8 weeks. Emails them their personalised maths for the Birdie membership ($27/wk + $10/hr). Tags: {first_name}, {booking_count}, {hours}, {visitor_spend}, {member_cost}, {savings_line}',
  'Your Birdies maths, {first_name} — member sessions are just $10/hr',
  '<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Your Birdies Maths</title>
</head>
<body style="margin:0; padding:0; background-color:#FFF5E4;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#FFF5E4;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width:600px; width:100%;">
          <tr>
            <td align="center" style="background-color:#1F4C25; padding:18px; border-radius:16px 16px 0 0;">
              <img src="https://cdn.shopify.com/s/files/1/0758/7030/6550/files/NO-BG_BIRDIES-LOGOS_WORK-DOC_AMENDED-9.7.25-01.png?v=1761536603" width="140" alt="Birdies Bayside" style="display:block; width:140px; height:auto; border:0;" />
            </td>
          </tr>
          <tr>
            <td style="background-color:#FFF5E4; padding:26px 22px; border-left:1px solid rgba(31,76,37,0.12); border-right:1px solid rgba(31,76,37,0.12);">
              <h1 style="margin:0 0 14px; font-family:Arial, sans-serif; font-size:34px; line-height:1.1; color:#1F4C25; text-align:center;">You''re Basically A Regular Now</h1>
              <p style="margin:0 0 18px; font-family:Arial, sans-serif; font-size:16px; line-height:1.6; color:#1F4C25; text-align:center;">
                Hi {first_name}, you''ve played {booking_count} times in the last 8 weeks — here''s what that looks like as a Birdie member.
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#1F4C25; border-radius:12px; margin:18px 0;">
                <tr>
                  <td style="padding:26px; text-align:center;">
                    <p style="margin:0 0 6px; font-family:Arial, sans-serif; font-size:14px; color:#FFF5E4; opacity:0.9;">Your last 8 weeks as a visitor</p>
                    <p style="margin:0; font-family:Arial, sans-serif; font-size:40px; font-weight:bold; color:#FFF5E4;">{visitor_spend}</p>
                    <p style="margin:14px 0 6px; font-family:Arial, sans-serif; font-size:14px; color:#FFF5E4; opacity:0.9;">The same golf as a Birdie member</p>
                    <p style="margin:0; font-family:Arial, sans-serif; font-size:40px; font-weight:bold; color:#EC622D;">{member_cost}</p>
                    <p style="margin:10px 0 0; font-family:Arial, sans-serif; font-size:14px; color:#FFF5E4; opacity:0.9;">{savings_line}</p>
                  </td>
                </tr>
              </table>
              <p style="margin:18px 0; font-family:Arial, sans-serif; font-size:16px; line-height:1.6; color:#1F4C25; text-align:center;">
                Birdie membership is <strong>$27/week</strong> and every session drops to just <strong>$10/hour</strong> — peak or off-peak. The more you play, the better it gets.
              </p>
              <table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="margin:22px auto 0;">
                <tr>
                  <td bgcolor="#EC622D" style="border-radius:12px;">
                    <a href="https://hub.birdiesbayside.com.au/membership" style="display:inline-block; padding:14px 28px; font-family:Arial, sans-serif; font-size:18px; font-weight:bold; color:#FFFFFF; text-decoration:none;">See Membership Options</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background-color:#1F4C25; padding:22px; border-radius:0 0 16px 16px;">
              <p style="margin:0; font-family:Arial, sans-serif; font-size:13px; color:#FFF5E4; text-align:center; opacity:0.85;">
                Birdies Bayside | <a href="mailto:hello@birdiesbayside.com.au" style="color:#EC622D; text-decoration:none;">hello@birdiesbayside.com.au</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>',
  'automated',
  true
);