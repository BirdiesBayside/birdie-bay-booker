UPDATE public.recording_sessions
SET stream_uid = NULL,
    stream_status = 'failed',
    stream_error = 'Upload never completed (Cloudflare left in pendingupload) — placeholder deleted',
    updated_at = now()
WHERE id IN ('5e2fba00-435d-4819-a010-d427b77d936b','0ece3814-1150-4bef-84f7-7967b0b8a1c7');