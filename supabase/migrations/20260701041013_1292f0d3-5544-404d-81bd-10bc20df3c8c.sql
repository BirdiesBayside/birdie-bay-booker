UPDATE public.email_templates
SET html_content = $HTML$
<p style="margin:0 0 18px; font-family:Inter, Arial, sans-serif; font-size:16px; line-height:1.6; color:#1F4C25; text-align:center;">
  Hey {first_name}, welcome to the <strong>Birdies League</strong>! You're officially registered and locked into every open tournament — no extra sign-up needed each week.
</p>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#FFFFFF; border-radius:12px; margin:18px 0; border-left:4px solid #EC622D;">
  <tr>
    <td style="padding:20px; font-family:Inter, Arial, sans-serif; font-size:15px; color:#1F4C25;">
      <h3 style="margin:0 0 6px 0; font-family:Anton, Impact, Arial Black, sans-serif; color:#1F4C25; font-size:22px;">Your Starting Handicap</h3>
      <p style="margin:0; font-size:18px;">
        <strong>{handicap}</strong> — set by the Birdies team based on your ability.
      </p>
    </td>
  </tr>
</table>

<h3 style="margin:22px 0 8px; font-family:Anton, Impact, Arial Black, sans-serif; color:#1F4C25; font-size:22px; text-align:center;">How Your Handicap Works</h3>

<p style="margin:0 0 14px; font-family:Inter, Arial, sans-serif; font-size:16px; line-height:1.6; color:#1F4C25;">
  We use our own <strong>Birdies Custom HCP</strong> system — built for indoor sim golf and designed to reward consistent play.
</p>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#FFF5E4; border:1px solid rgba(31,76,37,0.15); border-radius:12px; margin:0 0 18px;">
  <tr>
    <td style="padding:18px 20px; font-family:Inter, Arial, sans-serif; font-size:15px; line-height:1.7; color:#1F4C25;">
      <div style="margin-bottom:10px;">
        <strong style="color:#EC622D;">Rounds 1–6:</strong> Your starting handicap of <strong>{handicap}</strong> stays locked while you play your first 6 league rounds (roughly your first 3 weeks).
      </div>
      <div style="margin-bottom:10px;">
        <strong style="color:#EC622D;">Round 6 onwards:</strong> Your handicap unlocks and becomes an <strong>average of your best 3 rounds from your last 6</strong>.
      </div>
      <div>
        <strong style="color:#EC622D;">Every week after:</strong> It recalculates automatically — always taking the best 3 of your most recent 6 completed rounds — so it stays fair and always reflects your current form.
      </div>
    </td>
  </tr>
</table>

<p style="margin:0 0 18px; font-family:Inter, Arial, sans-serif; font-size:15px; line-height:1.6; color:#1F4C25;">
  In short: play consistently, and your handicap will settle in around your true level. Have a bad round? It'll drop out as soon as you post a better one.
</p>

<p style="margin:18px 0 0; font-family:Inter, Arial, sans-serif; font-size:16px; line-height:1.6; color:#1F4C25; text-align:center;">
  Any questions, hit us up any time.<br/>
  <strong>See you on the leaderboard.</strong>
</p>
$HTML$,
    subject = 'Welcome to the Birdies League, {first_name}! ⛳',
    description = 'Sent to players after their starting handicap is applied and they are onboarded to the Birdies League. Explains the Birdies Custom HCP system (locked for 6 rounds, then best 3 of last 6). Tags: {first_name}, {handicap}, {guide_url}',
    updated_at = now()
WHERE template_key = 'league_welcome';