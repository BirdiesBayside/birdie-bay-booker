-- Add the First Session Free template to marketing_templates
INSERT INTO public.marketing_templates (
  name,
  description,
  subject,
  html_content,
  category,
  is_active
) VALUES (
  'First Session Free',
  'Automated campaign for new users who haven''t booked yet. Gifts $35 credit and encourages first booking.',
  'Your Free Hour is Waiting, {first_name}!',
  '<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Your Free Hour</title>
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
              <h1 style="margin:0 0 14px; font-family:Arial, sans-serif; font-size:34px; line-height:1.1; color:#1F4C25; text-align:center;">A Gift From Us To You!</h1>
              <p style="margin:0 0 18px; font-family:Arial, sans-serif; font-size:16px; line-height:1.6; color:#1F4C25; text-align:center;">
                Hi {first_name}, we noticed you haven''t booked your first session yet. We''d love to see you at Birdies, so we''ve added credit to your account!
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#1F4C25; border-radius:12px; margin:18px 0;">
                <tr>
                  <td style="padding:30px; text-align:center;">
                    <p style="margin:0 0 8px; font-family:Arial, sans-serif; font-size:14px; color:#FFF5E4; opacity:0.9;">Your Account Credit</p>
                    <p style="margin:0; font-family:Arial, sans-serif; font-size:52px; font-weight:bold; color:#EC622D;">$35.00</p>
                    <p style="margin:8px 0 0; font-family:Arial, sans-serif; font-size:14px; color:#FFF5E4; opacity:0.9;">Enough for 1 hour off-peak!</p>
                  </td>
                </tr>
              </table>
              <p style="margin:18px 0; font-family:Arial, sans-serif; font-size:16px; line-height:1.6; color:#1F4C25; text-align:center;">
                This credit has been automatically added to your account and will be applied at checkout. No code needed!
              </p>
              <table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="margin:22px auto 0;">
                <tr>
                  <td bgcolor="#EC622D" style="border-radius:12px;">
                    <a href="https://hub.birdiesbayside.com.au/booking" style="display:inline-block; padding:14px 28px; font-family:Arial, sans-serif; font-size:18px; font-weight:bold; color:#FFFFFF; text-decoration:none;">Book Your Free Session</a>
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