UPDATE public.email_templates
SET html_content = replace(html_content, '<strong>Door Access Code:</strong> 7675#', '<strong>Door Access Code:</strong> {door_code}'),
    updated_at = now()
WHERE template_key IN ('booking_confirmation', 'booking_confirmation_first_unstaffed')
  AND html_content LIKE '%<strong>Door Access Code:</strong> 7675#%';