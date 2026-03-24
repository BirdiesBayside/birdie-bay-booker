
UPDATE marketing_templates 
SET html_content = '<!-- HERO BANNER -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">
  <tr>
    <td align="center" style="background-color:#1F4C25; border-radius:16px; padding:32px 20px;">
      <div style="font-size:42px; line-height:1;">⛳</div>
      <h2 style="margin:12px 0 8px; font-family:Anton, Impact, ''Arial Black'', sans-serif; font-size:28px; letter-spacing:1px; color:#FFFFFF; text-transform:uppercase; font-weight:400;">WEEKLY AMBROSE COMP</h2>
      <p style="margin:0; font-family:Inter, Arial, sans-serif; font-size:16px; color:rgba(255,255,255,0.85);">We''re launching something new — and we want YOUR input!</p>
    </td>
  </tr>
</table>

<p style="font-family:Inter, Arial, sans-serif; font-size:16px; line-height:1.6; color:#1F4C25; margin:0 0 16px;">
  We''re putting together a <strong>Teams of 2 Ambrose</strong> competition and want to make sure it works for everyone.
</p>

<p style="font-family:Inter, Arial, sans-serif; font-size:16px; line-height:1.6; color:#1F4C25; margin:0 0 24px;">
  Tap the button below to let us know your preferences — it only takes 30 seconds!
</p>

<!-- CTA BUTTON -->
<table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 24px;">
  <tr>
    <td align="center" bgcolor="#EC622D" style="border-radius:12px;">
      <a href="https://birdie-bay-bookings.lovable.app/comp-survey?email={email}"
         style="display:inline-block; padding:16px 36px; font-family:Anton, Impact, ''Arial Black'', sans-serif; font-size:20px; letter-spacing:0.5px; color:#FFFFFF; text-decoration:none; text-transform:uppercase; font-weight:400;">
        HAVE YOUR SAY →
      </a>
    </td>
  </tr>
</table>

<p style="font-family:Inter, Arial, sans-serif; font-size:13px; color:#1F4C25; opacity:0.6; text-align:center; margin:0;">
  We''ll use your feedback to finalise the comp format.
</p>',
updated_at = now()
WHERE name = 'Ambrose Comp Launch Survey';
