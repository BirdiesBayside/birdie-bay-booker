import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const key = Deno.env.get('RESEND_API_KEY')!
  const url = new URL(req.url)
  const id = url.searchParams.get('id')
  const endpoint = id ? `https://api.resend.com/emails/${id}` : 'https://api.resend.com/emails?limit=50'
  const res = await fetch(endpoint, { headers: { Authorization: `Bearer ${key}` } })
  const text = await res.text()
  return new Response(text, { status: res.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
