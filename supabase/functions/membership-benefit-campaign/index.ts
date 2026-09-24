import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { buildEmailTemplate, fetchEmailLayout } from '../_shared/email-wrapper.ts'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const FROM_EMAIL = 'Birdies Bayside <info@birdiesbayside.com.au>'
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

// Places the unsubscribe link INSIDE the green footer block (same approach as
// send-marketing-email) rather than appending a separate strip underneath.
function injectUnsubscribeIntoFooter(footerHtml: string, unsubscribeUrl: string): string {
  const linkRow = `<tr><td align="center" style="padding-top:14px; font-family:Inter, Arial, sans-serif; font-size:11px; color:#FFFFFF; opacity:0.75;"><a href="${unsubscribeUrl}" style="color:#FFFFFF; text-decoration:underline;">Unsubscribe from marketing emails</a></td></tr>`
  const idx = footerHtml.lastIndexOf("</table>")
  if (idx === -1) return footerHtml
  return footerHtml.slice(0, idx) + linkRow + footerHtml.slice(idx)
}

function money(n: number): string {
  return '$' + n.toFixed(2).replace(/\.00$/, '')
}

const DEFAULT_SUBJECT = "{first_name}, you're in enough to be a member — sessions drop to $10/hr"
// Body-only fallback — the shared header/footer from Admin → Notifications is
// applied around it at send time.
const DEFAULT_HTML = `<h1 style="margin:0 0 14px; font-family:Anton, Impact, Arial Black, sans-serif; font-size:34px; line-height:1.1; color:#1F4C25; text-align:center;">YOU'RE BASICALLY A REGULAR</h1>
<p style="margin:0 0 18px; font-family:Inter, Arial, sans-serif; font-size:16px; line-height:1.6; color:#1F4C25; text-align:center;">
  Hi {first_name}, you've been in {booking_count} times over the last 8 weeks. Birdie membership is <strong>$27/week</strong> and drops every session to just <strong>$10/hour</strong> — peak or off-peak.
</p>`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const url = new URL(req.url)
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {}
    const dryRun = url.searchParams.get('dryRun') === 'true' || body.dryRun === true
    const testEmail: string | undefined = url.searchParams.get('testEmail') ?? body.testEmail

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // --- Template (editable in Admin → Notifications; body content only —
    // the shared header/footer is applied at send time) ---
    const { data: tpl } = await supabase
      .from('email_templates')
      .select('subject, html_content')
      .eq('template_key', 'membership_benefit')
      .eq('is_active', true)
      .maybeSingle()
    const subjectTpl = tpl?.subject || DEFAULT_SUBJECT
    const htmlTpl = tpl?.html_content || DEFAULT_HTML
    const layout = await fetchEmailLayout(supabase)

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
      // Forward-looking pitch: membership is sold on the $10/hr rate and perks
      // going forward, not on an audit of what they already paid. Regular
      // visitors (2-5 bookings / 8 weeks) are revenue-positive as members
      // because of the guaranteed weekly subscription, and the venue has spare
      // peak capacity, so member hours don't displace visitor hours.
      const memberCost = BIRDIE_WEEKLY * WEEKS + BIRDIE_HOURLY * s.hours
      const savings = s.spend - memberCost
      eligible.push({
        user_id: userId,
        email: p.email,
        first_name: p.first_name || 'there',
        booking_count: s.count,
        hours: Math.round(s.hours * 10) / 10,
        visitor_spend: Math.round(s.spend * 100) / 100,
        member_cost: Math.round(memberCost * 100) / 100,
        savings: Math.round(savings * 100) / 100,
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
        : [{ user_id: 'test', email: testEmail, first_name: 'there', booking_count: 5, hours: 12, visitor_spend: 480, member_cost: 336, savings: 144 }]
      : eligible

    let sent = 0
    const errors: string[] = []
    for (const e of targets) {
      // Legacy tag kept so older template copy still renders sensibly.
      const savingsLine = 'The more you play, the more you save.'
      const render = (s: string) => s
        .replaceAll('{first_name}', e.first_name)
        .replaceAll('{booking_count}', String(e.booking_count))
        .replaceAll('{hours}', String(e.hours))
        .replaceAll('{visitor_spend}', money(e.visitor_spend))
        .replaceAll('{member_cost}', money(e.member_cost))
        .replaceAll('{savings}', money(Math.abs(e.savings)))
        .replaceAll('{savings_line}', savingsLine)

      const unsub = await buildUnsubscribeUrl(e.email)
      const html = buildEmailTemplate('', render(htmlTpl), undefined, {
        header_html: layout.header_html,
        footer_html: injectUnsubscribeIntoFooter(layout.footer_html, unsub),
      })

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

    return new Response(JSON.stringify({ sent, eligibleCount: eligible.length, errors }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
