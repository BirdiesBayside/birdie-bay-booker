
INSERT INTO public.email_templates (template_key, name, description, subject, html_content, is_active)
VALUES (
  'league_welcome',
  'League Welcome Email',
  'Sent to players after they are onboarded to the Birdies League. Tags: {first_name}, {handicap}, {guide_url}',
  'Welcome to the Birdies League, {first_name}! ⛳',
  '<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="x-apple-disable-message-reformatting" />
  <title>Birdies League Welcome</title>
  <style>
    @import url("https://fonts.googleapis.com/css2?family=Anton&family=Inter:wght@400;600&display=swap");
  </style>
</head>
<body style="margin:0; padding:0; background-color:#FFF5E4;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#FFF5E4;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width:600px; width:100%;">
          <!-- HEADER -->
          <tr>
            <td align="center" style="background-color:#1F4C25; padding:18px; border-radius:16px 16px 0 0;">
              <img src="https://cdn.shopify.com/s/files/1/0758/7030/6550/files/NO-BG_BIRDIES-LOGOS_WORK-DOC_AMENDED-9.7.25-01.png?v=1761536603" width="140" alt="Birdies Bayside" style="display:block; width:140px; height:auto; border:0;" />
            </td>
          </tr>
          <!-- BODY -->
          <tr>
            <td style="background-color:#FFF5E4; padding:26px 22px; border-left:1px solid rgba(31,76,37,0.12); border-right:1px solid rgba(31,76,37,0.12);">
              <h1 style="margin:0 0 14px; font-family:Anton, Impact, Arial Black, sans-serif; font-size:34px; line-height:1.1; color:#1F4C25; text-align:center;">
                YOU''RE IN THE LEAGUE! ⛳
              </h1>
              <p style="margin:0 0 18px; font-family:Inter, Arial, sans-serif; font-size:16px; line-height:1.6; color:#1F4C25; text-align:center;">
                Hey {first_name}, great news — you''ve been registered for the Birdies League and you''re ready to compete!
              </p>

              <!-- HANDICAP CARD -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#FFFFFF; border-radius:12px; margin:18px 0; border-left:4px solid #EC622D;">
                <tr>
                  <td style="padding:20px; font-family:Inter, Arial, sans-serif; color:#1F4C25;">
                    <h3 style="margin:0 0 8px; font-family:Anton, Impact, Arial Black, sans-serif; color:#1F4C25; font-size:20px;">Your Starting Handicap</h3>
                    <p style="margin:0 0 6px; font-size:32px; font-weight:700; color:#EC622D; font-family:Anton, Impact, Arial Black, sans-serif;">{handicap}</p>
                    <p style="margin:0; font-size:14px; line-height:1.5; color:#555;">
                      This handicap will be used for your <strong>first 2 rounds</strong> (first week) only. After that, SGT (Simulator Golf Tour) will continuously monitor your scores and automatically adjust your handicap to keep things fair and competitive.
                    </p>
                  </td>
                </tr>
              </table>

              <!-- HOW TO PLAY -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#FFFFFF; border-radius:12px; margin:18px 0; border-left:4px solid #1F4C25;">
                <tr>
                  <td style="padding:20px; font-family:Inter, Arial, sans-serif; color:#1F4C25;">
                    <h3 style="margin:0 0 8px; font-family:Anton, Impact, Arial Black, sans-serif; color:#1F4C25; font-size:20px;">How to Play a League Round</h3>
                    <p style="margin:0 0 12px; font-size:14px; line-height:1.5; color:#555;">
                      Not sure how it all works? We''ve put together a handy guide that covers everything — from starting your round on the simulator to submitting your scorecard.
                    </p>
                    <a href="{guide_url}" style="display:inline-block; padding:10px 20px; background-color:#1F4C25; color:#FFFFFF; font-family:Anton, Impact, Arial Black, sans-serif; font-size:15px; text-decoration:none; border-radius:8px; letter-spacing:0.3px;">
                      READ THE BIRDIES GUIDE →
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:18px 0 0; font-family:Inter, Arial, sans-serif; font-size:16px; line-height:1.6; color:#1F4C25; text-align:center;">
                Good luck out there — see you on the course! 🏌️<br/>
                <strong>The Birdies Team</strong>
              </p>

              <!-- CTA BUTTON -->
              <table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="margin:22px auto 0;">
                <tr>
                  <td bgcolor="#EC622D" style="border-radius:12px;">
                    <a href="https://hub.birdiesbayside.com.au/booking" style="display:inline-block; padding:14px 24px; font-family:Anton, Impact, Arial Black, sans-serif; font-size:18px; letter-spacing:0.3px; color:#FFFFFF; text-decoration:none;">
                      BOOK A SESSION
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- FOOTER -->
          <tr>
            <td style="background-color:#1F4C25; padding:22px; border-radius:0 0 16px 16px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" style="padding-bottom:14px;">
                    <a href="https://www.instagram.com/birdiesbayside" style="margin:0 8px; text-decoration:none;">
                      <img src="https://cdn-icons-png.flaticon.com/512/174/174855.png" alt="Instagram" width="28" height="28" style="display:inline-block; border:0;" />
                    </a>
                    <a href="https://www.facebook.com/share/17NifCh2vH/" style="margin:0 8px; text-decoration:none;">
                      <img src="https://cdn-icons-png.flaticon.com/512/174/174848.png" alt="Facebook" width="28" height="28" style="display:inline-block; border:0;" />
                    </a>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="font-family:Inter, Arial, sans-serif; font-size:14px; line-height:1.7; color:#FFFFFF;">
                    <div>Unit 2, 86 Jardine Drive, Redland Bay QLD 4165</div>
                    <div><a href="tel:+61721468442" style="color:#FFFFFF; text-decoration:underline;">(07) 2146 8442</a></div>
                    <div><a href="https://birdiesbayside.com.au" style="color:#FFFFFF; text-decoration:underline;">birdiesbayside.com.au</a></div>
                    <div style="margin-top:10px; font-size:12px; opacity:0.75;">© Birdies Bayside</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>',
  true
);
