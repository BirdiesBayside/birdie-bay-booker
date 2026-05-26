// Shared branded email wrapper used by all customer-facing transactional emails.
// Every email sent to a customer MUST be wrapped with buildEmailTemplate so it
// renders with the consistent Birdies header (logo) and footer (socials + contact).

export interface EmailCta {
  text: string;
  url: string;
}

export function buildEmailTemplate(
  heading: string,
  bodyContent: string,
  ctaButton?: EmailCta
): string {
  const buttonHtml = ctaButton
    ? `
              <table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="margin:22px auto 0;">
                <tr>
                  <td bgcolor="#EC622D" style="border-radius:12px;">
                    <a href="${ctaButton.url}"
                       style="display:inline-block; padding:14px 24px; font-family:Anton, Impact, Arial Black, sans-serif; font-size:18px; letter-spacing:0.3px; color:#FFFFFF; text-decoration:none;">
                      ${ctaButton.text}
                    </a>
                  </td>
                </tr>
              </table>
  `
    : "";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="x-apple-disable-message-reformatting" />
  <title>Birdies Email</title>
  <style>
    @import url("https://fonts.googleapis.com/css2?family=Anton&family=Inter:wght@400;600&display=swap");
  </style>
</head>
<body style="margin:0; padding:0; background-color:#FFF5E4;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#FFF5E4;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width:600px; width:100%;">
          <tr>
            <td align="center" style="background-color:#1F4C25; padding:18px; border-radius:16px 16px 0 0;">
              <img
                src="https://cdn.shopify.com/s/files/1/0758/7030/6550/files/NO-BG_BIRDIES-LOGOS_WORK-DOC_AMENDED-9.7.25-01.png?v=1761536603"
                width="140"
                alt="Birdies Bayside"
                style="display:block; width:140px; height:auto; border:0;"
              />
            </td>
          </tr>
          <tr>
            <td style="background-color:#FFF5E4; padding:26px 22px; border-left:1px solid rgba(31,76,37,0.12); border-right:1px solid rgba(31,76,37,0.12);">
              <h1 style="margin:0 0 14px; font-family:Anton, Impact, Arial Black, sans-serif; font-size:34px; line-height:1.1; color:#1F4C25; text-align:center;">
                ${heading}
              </h1>
              ${bodyContent}
              ${buttonHtml}
            </td>
          </tr>
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
                    <div><a href="https://maps.app.goo.gl/vTXLZvd8XPZEeRn16" style="color:#FFFFFF; text-decoration:underline;">Unit 2, 86 Jardine Drive, Redland Bay QLD 4165</a></div>
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
</html>`;
}
