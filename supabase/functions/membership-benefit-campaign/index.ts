import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { createClient } from 'npm:@supabase/supabase-js@2'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const FROM_EMAIL = 'Birdies Bayside <info@birdiesbayside.com.au>'
const ADMIN_EMAIL = 'admin@birdiesbayside.com.au'
const SITE_URL = 'https://birdiesbayside.com.au'

const WINDOW_DAYS = 56          // trailing 8 weeks
const RESEND_GUARD_DAYS = 60    // don't re-email within 60 days
const MIN_BOOKINGS = 2
const MAX_BOOKINGS = 5          // 6+ heavy users stay visitors (most profitable per hour)
const BIRDIE_WEEKLY = 27
const BIRDIE_HOURLY = 10
const WEEKS = WINDOW_DAYS / 7

// Same token scheme as send-marketing-email so /unsubscribe accepts these links
async function buildUnsubscribeUrl(email: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(email.toLowerCase() + 'birdies-unsubscribe-salt')
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const token = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('')
  return `${SITE_URL}/unsubscribe?email=${encodeURIComponent(email)}&token=${token}`
}

function money(n: number): string {
  return '$' + n.toFixed(2).replace(/\.00$/, '')
}

const DEFAULT_SUBJECT = 'Your Birdies maths, {first_name} — member sessions are just $10/hr'
const DEFAULT_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head>
<body style="margin:0; padding:0; background-color:#FFF5E4;">
  <p>Hi {first_name}, you've played {booking_count} times in the last 8 weeks. As a Birdie member ($27/week) every session is just $10/hour. {savings_line}</p>
</body></html>`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const url = new URL(req.url)
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {}
    const dryRun = url.searchParams.get('dryRun') === 'true' || body.dryRun === true
    const testEmail: string | undefined = url.searchParams.get('testEmail') ?? body.testEmail

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // --- Template ---
    const { data: tpl } = await supabase
      .from('marketing_templates')
      .select('subject, html_content')
      .eq('name', 'Membership Benefit')
      .eq('category', 'automated')
      .eq('is_active', true)
      .maybeSingle()
    const subjectTpl = tpl?.subject || DEFAULT_SUBJECT
    const htmlTpl = tpl?.html_content || DEFAULT_HTML

    // --- Recent sends (60-day guard) ---
    const guardSince = new Date(Date.now() - RESEND_GUARD_DAYS * 864e5).toISOString()
    const recentSenders = new Set<string>()
    {
      let from = 0
      for (;;) {
        const { data } = await supabase
          .from('membership_campaign_sends')
          .select('user_id')
          .gte('sent_at', guardSince)
          .range(from, from + 999)
        if (!data || data.length === 0) break
        data.forEach(r => recentSenders.add(r.user_id))
        if (data.length < 1000) break
        from += 1000
      }
    }

    // --- Suppression list ---
    const suppressed = new Set<string>()
    {
      const { data } = await supabase.from('marketing_unsubscribes').select('email')
      data?.forEach(r => suppressed.add(r.email.toLowerCase()))
    }

    // --- Visitor profiles opted into marketing ---
    const visitors = new Map<string, { user_id: string; email: string; first_name: string }>()
    {
      let from = 0
      for (;;) {
        const { data } = await supabase
          .from('profiles')
          .select('user_id, email, first_name')
          .eq('membership_tier', 'visitor')
          .eq('marketing_opt_out', false)
          .not('email', 'is', null)
          .range(from, from + 999)
        if (!data || data.length === 0) break
        data.forEach(p => visitors.set(p.user_id, p))
        if (data.length < 1000) break
        from += 1000
      }
    }

    // --- Past members (any membership_changes row) — never re-pitch ---
    {
      const { data } = await supabase.from('membership_changes').select('user_id')
      data?.forEach(r => visitors.delete(r.user_id))
    }

    // --- Confirmed bookings in the trailing window ---
    const since = new Date()
    since.setDate(since.getDate() - WINDOW_DAYS)
    const sinceDate = since.toISOString().slice(0, 10)
    const stats = new Map<string, { count: number; hours: number; spend: number }>()
    {
      let from = 0
      for (;;) {
        const { data } = await supabase
          .from('bookings')
          .select('user_id, duration_hours, total_price')
          .eq('status', 'confirmed')
          .gte('booking_date', sinceDate)
          .range(from, from + 999)
        if (!data || data.length === 0) break
        for (const b of data) {
          const s = stats.get(b.user_id) || { count: 0, hours: 0, spend: 0 }
          s.count += 1
          s.hours += Number(b.duration_hours) || 0
          s.spend += Number(b.total_price) || 0
          stats.set(b.user_id, s)
        }
        if (data.length < 1000) break
        from += 1000
      }
    }

    // --- Eligibility ---
    const eligible: Array<{
      user_id: string; email: string; first_name: string;
      booking_count: number; hours: number; visitor_spend: number; member_cost: number; savings: number
    }> = []
    for (const [userId, s] of stats) {
      if (s.count < MIN_BOOKINGS || s.count > MAX_BOOKINGS) continue
      const p = visitors.get(userId)
      if (!p) continue
      if (recentSenders.has(userId)) continue
      if (suppressed.has(p.email.toLowerCase())) continue
      const memberCost = BIRDIE_WEEKLY * WEEKS + BIRDIE_HOURLY * s.hours
      eligible.push({
        user_id: userId,
        email: p.email,
        first_name: p.first_name || 'there',
        booking_count: s.count,
        hours: Math.round(s.hours * 10) / 10,
        visitor_spend: Math.round(s.spend * 100) / 100,
        member_cost: Math.round(memberCost * 100) / 100,
        savings: Math.round((s.spend - memberCost) * 100) / 100,
      })
    }

    if (dryRun) {
      return new Response(JSON.stringify({ eligibleCount: eligible.length, eligible }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ error: 'RESEND_API_KEY not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // --- Send ---
    const targets = testEmail
      ? eligible.filter(e => e.email.toLowerCase() === testEmail.toLowerCase()).length
        ? eligible.filter(e => e.email.toLowerCase() === testEmail.toLowerCase())
        : [{ user_id: 'test', email: testEmail, first_name: 'there', booking_count: 4, hours: 6.5, visitor_spend: 227.5, member_cost: 281, savings: -53.5 }]
      : eligible

    let sent = 0
    const errors: string[] = []
    for (const e of targets) {
      const savingsLine = e.savings > 0
        ? `You'd have saved ${money(e.savings)} over the last 8 weeks.`
        : 'The more you play, the more you save.'
      const render = (s: string) => s
        .replaceAll('{first_name}', e.first_name)
        .replaceAll('{booking_count}', String(e.booking_count))
        .replaceAll('{hours}', String(e.hours))
        .replaceAll('{visitor_spend}', money(e.visitor_spend))
        .replaceAll('{member_cost}', money(e.member_cost))
        .replaceAll('{savings}', money(Math.abs(e.savings)))
        .replaceAll('{savings_line}', savingsLine)

      let html = render(htmlTpl)
      const unsub = await buildUnsubscribeUrl(e.email)
      const unsubBlock = `<div style="text-align:center; padding:16px; font-family:Arial, sans-serif; font-size:11px; color:#1F4C25; background-color:#FFF5E4;"><a href="${unsub}" style="color:#1F4C25; text-decoration:underline; opacity:0.7;">Unsubscribe from marketing emails</a></div>`
      html = html.includes('</body>') ? html.replace('</body>', unsubBlock + '</body>') : html + unsubBlock

      try {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: FROM_EMAIL, to: [e.email], subject: render(subjectTpl), html }),
        })
        if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`)

        if (!testEmail) {
          await supabase.from('membership_campaign_sends').insert({
            user_id: e.user_id,
            email: e.email,
            booking_count: e.booking_count,
            hours: e.hours,
            visitor_spend: e.visitor_spend,
            member_cost: e.member_cost,
            savings: e.savings,
          })
        }
        sent++
      } catch (err) {
        errors.push(`${e.email}: ${(err as Error).message}`)
      }
      await new Promise(r => setTimeout(r, 600))
    }

    // --- Admin report ---
    if (!testEmail && sent > 0) {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: FROM_EMAIL,
          to: [ADMIN_EMAIL],
          subject: `Membership Benefit campaign: ${sent} email(s) sent`,
          html: `<p>The membership benefit campaign emailed <strong>${sent}</strong> visitor(s) with ${MIN_BOOKINGS}-${MAX_BOOKINGS} bookings in the last ${WINDOW_DAYS} days.</p>${errors.length ? `<p>Errors:</p><pre>${errors.join('\n')}</pre>` : ''}`,
        }),
      }).catch(() => {})
    }

    return new Response(JSON.stringify({ sent, eligibleCount: eligible.length, errors }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
