UPDATE public.email_templates
SET html_content = $HTML$
<p style="margin:0 0 18px; font-family:Inter, Arial, sans-serif; font-size:16px; line-height:1.6; color:#1F4C25; text-align:center;">
  Hey {first_name}, welcome to the <strong>Birdies League</strong>! You're officially registered and locked into every open tournament — no extra sign-up needed each week.
</p>

<h3 style="margin:22px 0 8px; font-family:Anton, Impact, Arial Black, sans-serif; color:#1F4C25; font-size:22px; text-align:center;">How To Play Your League Round</h3>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#FFFFFF; border-radius:12px; margin:0 0 18px; border-left:4px solid #EC622D;">
  <tr>
    <td style="padding:18px 20px; font-family:Inter, Arial, sans-serif; font-size:15px; line-height:1.7; color:#1F4C25;">
      <div style="margin-bottom:14px;">
        <strong style="color:#EC622D;">1. Book a bay</strong><br/>
        League rounds are played during normal bookings — just book a bay like you usually would, any time during the tournament window.
      </div>
      <div style="margin-bottom:14px;">
        <strong style="color:#EC622D;">2. Find your SGT Username and UID</strong><br/>
        When you're in your bay, open <strong>My Account</strong> in the Birdies Hub app (or on the web). You'll see your <strong>SGT Username</strong> and <strong>SGT UID</strong> there.
      </div>
      <div style="margin-bottom:14px;">
        <strong style="color:#EC622D;">3. Add yourself in GSPro</strong><br/>
        Add a new player (or edit <strong>Guest 1</strong>) in GSPro, entering your SGT Username <strong>exactly as it appears</strong>, along with the UID.
      </div>
      <div>
        <strong style="color:#EC622D;">4. Load your weekly Birdies league round</strong><br/>
        In GSPro, click <strong>Tournaments</strong> to load your weekly Birdies league round. Your player details are saved for next time regardless of which bay you book.
      </div>
    </td>
  </tr>
</table>

<h3 style="margin:22px 0 8px; font-family:Anton, Impact, Arial Black, sans-serif; color:#1F4C25; font-size:22px; text-align:center;">How Your Handicap Works</h3>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#FFF5E4; border:1px solid rgba(31,76,37,0.15); border-radius:12px; margin:0 0 18px;">
  <tr>
    <td style="padding:18px 20px; font-family:Inter, Arial, sans-serif; font-size:15px; line-height:1.7; color:#1F4C25;">
      <div style="margin-bottom:10px;">
        <strong style="color:#EC622D;">Your first 3 rounds:</strong> Play your first 3 full league rounds and we'll calculate your <strong>official Birdies handicap</strong> from your actual performance at Birdies — no guesswork.
      </div>
      <div style="margin-bottom:10px;">
        <strong style="color:#EC622D;">First two weekly comps:</strong> You're <strong>exempt from winning</strong> your first two weekly league comps (your first 4 rounds). You'll show on the leaderboard with an <strong>(E)</strong> next to your name while you're in this period.
      </div>
      <div>
        <strong style="color:#EC622D;">After that:</strong> Your handicap recalculates automatically from your recent completed rounds, so it always reflects your current form.
      </div>
    </td>
  </tr>
</table>

<p style="margin:0 0 18px; font-family:Inter, Arial, sans-serif; font-size:15px; line-height:1.6; color:#1F4C25;">
  Why the exemption? It ensures your handicap is based on your <strong>actual performance at Birdies</strong> before you're eligible to take home the weekly prize — keeping the comp fair for everyone.
</p>

<h3 style="margin:22px 0 8px; font-family:Anton, Impact, Arial Black, sans-serif; color:#1F4C25; font-size:22px; text-align:center;">Important Rules</h3>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#FFFFFF; border-radius:12px; margin:0 0 18px; border-left:4px solid #EC622D;">
  <tr>
    <td style="padding:18px 20px; font-family:Inter, Arial, sans-serif; font-size:15px; line-height:1.7; color:#1F4C25;">
      <div style="margin-bottom:14px;">
        <strong style="color:#EC622D;">1. Take a drop when stuck in the rough</strong><br/>
        Please always take a drop if you're stuck in the rough. Click <strong>Shot Options</strong> in the bottom left, then click <strong>Sim Drop</strong>. Click a spot on the fairway and click <strong>Accept</strong>.
      </div>
      <div>
        <strong style="color:#EC622D;">2. Have fun!</strong><br/>
        We try to make the league as fair as possible, but golf is golf — people play great one week and bad the next, so handicapping is always hard to get right.
      </div>
    </td>
  </tr>
</table>

<p style="margin:18px 0 0; font-family:Inter, Arial, sans-serif; font-size:16px; line-height:1.6; color:#1F4C25; text-align:center;">
  Any questions, hit us up any time.<br/>
  <strong>See you on the leaderboard.</strong>
</p>
$HTML$,
    updated_at = now()
WHERE template_key = 'league_welcome';