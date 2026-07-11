
-- Insert Status line after the Bay line in email templates (only if not already present)
UPDATE public.email_templates
SET html_content = regexp_replace(
  html_content,
  '(<strong>Bay:</strong> \{bay_name\}</p>)',
  '\1' || E'\n                    <p style="margin:5px 0;"><strong>Status:</strong> {staffed_status}</p>',
  'g'
)
WHERE template_key IN ('booking_confirmation','booking_confirmation_first_unstaffed','booking_cancellation')
  AND html_content NOT LIKE '%{staffed_status}%';

-- Append status to SMS templates (only if not already present)
UPDATE public.sms_templates
SET message = message || E'\n\nStatus: {staffed_status}'
WHERE template_key IN ('booking_confirmation','booking_confirmation_first_unstaffed','booking_reschedule','booking_cancellation')
  AND message NOT LIKE '%{staffed_status}%';
