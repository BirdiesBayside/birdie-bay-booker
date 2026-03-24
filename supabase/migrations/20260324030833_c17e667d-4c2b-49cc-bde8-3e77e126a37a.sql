UPDATE marketing_templates 
SET html_content = '<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="https://fonts.googleapis.com/css2?family=Anton&family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background-color:#FFF5E4;font-family:Inter,Arial,Helvetica,sans-serif;">
  <div style="max-width:500px;margin:0 auto;padding:20px;">
    <div style="background-color:#1F4C25;border-radius:16px 16px 0 0;padding:24px 20px;text-align:center;">
      <h1 style="color:#FFFFFF;font-family:Anton,sans-serif;font-size:24px;font-weight:400;letter-spacing:1px;text-transform:uppercase;margin:0;">⛳ Weekly Ambrose Comp</h1>
      <p style="color:#FFFFFF;opacity:0.85;font-family:Inter,Arial,sans-serif;font-size:14px;margin:8px 0 0;">We''re launching something new — and we want YOUR input!</p>
    </div>
    <div style="background-color:#FFFFFF;padding:24px 20px;border:1px solid #e5e5e5;border-top:none;border-radius:0 0 16px 16px;">
      <p style="color:#1F4C25;font-family:Inter,Arial,sans-serif;font-size:15px;line-height:1.6;margin:0 0 16px;">
        We''re putting together a <strong>Teams of 2 Ambrose</strong> competition and want to make sure it works for everyone.
      </p>
      <p style="color:#1F4C25;font-family:Inter,Arial,sans-serif;font-size:15px;line-height:1.6;margin:0 0 24px;">
        Tap the button below to let us know your preferences — it only takes 30 seconds!
      </p>
      <div style="text-align:center;margin:0 0 20px;">
        <a href="https://birdie-bay-bookings.lovable.app/comp-survey?email={{email}}" style="display:inline-block;background-color:#EC622D;color:#FFFFFF;font-family:Anton,sans-serif;font-size:18px;font-weight:400;text-transform:uppercase;letter-spacing:1px;text-decoration:none;padding:14px 32px;border-radius:12px;">
          Have Your Say →
        </a>
      </div>
      <p style="color:#1F4C25;opacity:0.5;font-family:Inter,Arial,sans-serif;font-size:13px;text-align:center;margin:0;">
        We''ll use your feedback to finalise the day, time, and entry fee.
      </p>
    </div>
    <p style="text-align:center;font-family:Inter,Arial,sans-serif;font-size:11px;color:#1F4C25;opacity:0.4;margin:16px 0 0;">
      Birdies Bayside · Unit 2, 86 Jardine Drive, Redland Bay
    </p>
  </div>
</body>
</html>',
updated_at = now()
WHERE name = 'Ambrose Comp Launch Survey';