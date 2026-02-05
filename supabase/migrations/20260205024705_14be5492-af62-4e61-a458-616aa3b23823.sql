-- Create table to track weekly prize awards
CREATE TABLE public.sgt_weekly_prizes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id INTEGER NOT NULL,
  player_id INTEGER NOT NULL,
  player_name TEXT NOT NULL,
  profile_user_id UUID REFERENCES auth.users(id),
  prize_amount NUMERIC NOT NULL DEFAULT 40,
  awarded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  email_sent BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tournament_id, player_id)
);

-- Create table to track monthly awards (manually recorded by admin)
CREATE TABLE public.sgt_monthly_awards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tour_id INTEGER NOT NULL,
  month TEXT NOT NULL,
  winner_player_name TEXT NOT NULL,
  winner_player_id INTEGER,
  winner_profile_user_id UUID REFERENCES auth.users(id),
  prize_description TEXT,
  awarded_by UUID REFERENCES auth.users(id),
  awarded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on both tables
ALTER TABLE public.sgt_weekly_prizes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sgt_monthly_awards ENABLE ROW LEVEL SECURITY;

-- Admin-only policies for weekly prizes
CREATE POLICY "Admins can view weekly prizes"
ON public.sgt_weekly_prizes FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_roles.user_id = auth.uid() 
    AND user_roles.role = 'admin'
  )
);

CREATE POLICY "Admins can insert weekly prizes"
ON public.sgt_weekly_prizes FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_roles.user_id = auth.uid() 
    AND user_roles.role = 'admin'
  )
);

-- Admin-only policies for monthly awards
CREATE POLICY "Admins can view monthly awards"
ON public.sgt_monthly_awards FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_roles.user_id = auth.uid() 
    AND user_roles.role = 'admin'
  )
);

CREATE POLICY "Admins can insert monthly awards"
ON public.sgt_monthly_awards FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_roles.user_id = auth.uid() 
    AND user_roles.role = 'admin'
  )
);

CREATE POLICY "Admins can update monthly awards"
ON public.sgt_monthly_awards FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_roles.user_id = auth.uid() 
    AND user_roles.role = 'admin'
  )
);

CREATE POLICY "Admins can delete monthly awards"
ON public.sgt_monthly_awards FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_roles.user_id = auth.uid() 
    AND user_roles.role = 'admin'
  )
);

-- Insert the league weekly winner email template
INSERT INTO public.email_templates (template_key, name, subject, description, is_active, html_content)
VALUES (
  'league_weekly_winner',
  'League Weekly Winner',
  'Congratulations! You Won This Week''s League Prize! 🏆',
  'Sent to league members who win the weekly tournament',
  true,
  '<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: ''Helvetica Neue'', Arial, sans-serif; background-color: #f5f5f5;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f5f5f5;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 600px; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background-color: #1a1a2e; padding: 30px; text-align: center;">
              <img src="https://hltrcuypuxhetcjyvedl.supabase.co/storage/v1/object/public/email-assets/birdies-welcome-logo.png" alt="Birdies" style="max-width: 200px; height: auto;">
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding: 40px 30px;">
              <h1 style="color: #1a1a2e; font-size: 28px; margin: 0 0 20px 0; text-align: center;">🏆 CONGRATULATIONS! 🏆</h1>
              <p style="color: #333; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
                Hi {{first_name}},
              </p>
              <p style="color: #333; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
                Amazing work! You''ve won this week''s Birdies League tournament!
              </p>
              <div style="background-color: #f8f9fa; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center;">
                <p style="color: #666; font-size: 14px; margin: 0 0 5px 0;">Tournament</p>
                <p style="color: #1a1a2e; font-size: 18px; font-weight: bold; margin: 0 0 15px 0;">{{tournament_name}}</p>
                <p style="color: #666; font-size: 14px; margin: 0 0 5px 0;">Your Prize</p>
                <p style="color: #f97316; font-size: 32px; font-weight: bold; margin: 0;">${{prize_amount}} Credit</p>
              </div>
              <p style="color: #333; font-size: 16px; line-height: 1.6; margin: 20px 0;">
                Your credit has been added to your Birdies account and can be used for:
              </p>
              <ul style="color: #333; font-size: 16px; line-height: 1.8; margin: 0 0 20px 0; padding-left: 20px;">
                <li>Future bay bookings</li>
                <li>In-store purchases at Birdies</li>
              </ul>
              <p style="color: #333; font-size: 16px; line-height: 1.6; margin: 0 0 30px 0;">
                Keep up the great play! See you at the next tournament.
              </p>
              <div style="text-align: center;">
                <a href="https://birdie-bay-bookings.lovable.app/my-account" style="display: inline-block; background-color: #f97316; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-weight: bold; font-size: 16px;">View My Account</a>
              </div>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color: #f8f9fa; padding: 30px; text-align: center; border-top: 1px solid #eee;">
              <p style="color: #666; font-size: 14px; margin: 0;">
                Birdies Bayside<br>
                Your Indoor Golf Destination
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>'
);

-- Add index for faster lookups
CREATE INDEX idx_sgt_weekly_prizes_tournament ON public.sgt_weekly_prizes(tournament_id);
CREATE INDEX idx_sgt_monthly_awards_tour_month ON public.sgt_monthly_awards(tour_id, month);