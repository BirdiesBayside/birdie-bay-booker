UPDATE public.email_templates
SET
  subject = 'Booking Confirmed - Birdies Bayside',
  html_content = $HTML$<p style="margin:0 0 18px; font-family:Inter, Arial, sans-serif; font-size:16px; line-height:1.6; color:#1F4C25; text-align:center;">Hi {first_name}, your golf simulator booking has been confirmed!</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#FFFFFF; border-radius:12px; margin:18px 0; border-left:4px solid #EC622D;">
                <tr>
                  <td style="padding:20px; font-family:Inter, Arial, sans-serif; font-size:15px; color:#1F4C25;">
                    <p style="margin:5px 0;"><strong>Date:</strong> {booking_date}</p>
                    <p style="margin:5px 0;"><strong>Time:</strong> {booking_time} - {end_time}</p>
                    <p style="margin:5px 0;"><strong>Duration:</strong> {duration} hour(s)</p>
                    <p style="margin:5px 0;"><strong>Bay:</strong> {bay_name}</p>
                    <p style="margin:5px 0;"><strong>Players:</strong> {player_count}</p>
                    <p style="margin:5px 0;"><strong>Total:</strong> {total_price}</p>
                  </td>
                </tr>
              </table>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#1F4C25; border-radius:12px; margin:18px 0;">
                <tr>
                  <td style="padding:20px; font-family:Inter, Arial, sans-serif; font-size:15px; color:#FFF5E4; text-align:center;">
                    <p style="margin:0 0 10px 0;"><strong>Door Access Code:</strong> 7675#</p>
                    <p style="margin:0; font-size:14px;"><strong>IMPORTANT:</strong> You may require Boom gate access for your booking time.<br/><a href="https://birdiesbayside.com.au/pages/birdies-gate-access" style="color:#EC622D;">Download the app here</a></p>
                  </td>
                </tr>
              </table>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#FFFFFF; border-radius:12px; margin:18px 0; border:2px solid #EC622D;">
                <tr>
                  <td style="padding:22px; text-align:center; font-family:Inter, Arial, sans-serif; color:#1F4C25;">
                    <p style="margin:0 0 8px; font-family:Anton, Impact, Arial Black, sans-serif; font-size:22px; color:#1F4C25; letter-spacing:0.3px;">FIRST TIME AT BIRDIES?</p>
                    <p style="margin:0 0 14px; font-size:15px; line-height:1.6;">Your booking is during our unstaffed hours. Please read the <strong>Quick Start Guide</strong> located inside your bay when you arrive.</p>
                    <p style="margin:0 0 6px; font-size:15px; line-height:1.6;">If you have any issues at all, call us straight away:</p>
                    <p style="margin:0;"><a href="tel:+61721468442" style="display:inline-block; font-family:Anton, Impact, Arial Black, sans-serif; font-size:26px; color:#EC622D; text-decoration:none; letter-spacing:0.5px;">(07) 2146 8442</a></p>
                  </td>
                </tr>
              </table>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#FFFFFF; border-radius:12px; margin:18px 0; border:1px solid rgba(31,76,37,0.15);">
                <tr>
                  <td style="padding:20px; text-align:center;">
                    <p style="margin:0 0 12px; font-family:Anton, Impact, Arial Black, sans-serif; font-size:18px; color:#1F4C25;">First Time at Birdies?</p>
                    <p style="margin:0 0 14px; font-family:Inter, Arial, sans-serif; font-size:14px; line-height:1.5; color:#1F4C25;">Check out our guide for everything you need to know about using the simulators, accessing the facility, and making the most of your session.</p>
                    <a href="https://hub.birdiesbayside.com.au/birdies-guide" style="display:inline-block; padding:10px 20px; background-color:#EC622D; border-radius:8px; font-family:Anton, Impact, Arial Black, sans-serif; font-size:14px; color:#FFFFFF; text-decoration:none;">View the Guide</a>
                  </td>
                </tr>
              </table>
              <p style="margin:18px 0 0; font-family:Inter, Arial, sans-serif; font-size:16px; line-height:1.6; color:#1F4C25; text-align:center;">We look forward to seeing you at Birdies Bayside!</p>$HTML$,
  updated_at = now()
WHERE template_key = 'booking_confirmation_first_unstaffed';