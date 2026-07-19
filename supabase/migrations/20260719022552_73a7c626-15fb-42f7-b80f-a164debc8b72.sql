
CREATE TABLE IF NOT EXISTS public.email_layout (
  id text PRIMARY KEY DEFAULT 'global',
  header_html text NOT NULL,
  footer_html text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

GRANT SELECT ON public.email_layout TO authenticated;
GRANT UPDATE ON public.email_layout TO authenticated;
GRANT ALL ON public.email_layout TO service_role;

ALTER TABLE public.email_layout ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view email layout"
  ON public.email_layout FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update email layout"
  ON public.email_layout FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.email_layout (id, header_html, footer_html)
VALUES (
  'global',
  $HEADER$<tr>
  <td align="center" style="background-color:#1F4C25; padding:18px; border-radius:16px 16px 0 0;">
    <img
      src="https://cdn.shopify.com/s/files/1/0758/7030/6550/files/NO-BG_BIRDIES-LOGOS_WORK-DOC_AMENDED-9.7.25-01.png?v=1761536603"
      width="140"
      alt="Birdies Bayside"
      style="display:block; width:140px; height:auto; border:0;"
    />
  </td>
</tr>$HEADER$,
  $FOOTER$<tr>
  <td style="background-color:#1F4C25; padding:22px; border-radius:0 0 16px 16px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td align="center" style="padding-bottom:14px;">
          <a href="https://www.instagram.com/birdiesbayside" style="margin:0 8px; text-decoration:none;">
            <img src="https://cdn-icons-png.flaticon.com/512/174/174855.png" alt="Instagram" width="28" height="28" style="display:inline-block; border:0;" />
          </a>
          <a href="https://www.facebook.com/share/17NifCh2vH/" style="margin:0 8px; text-decoration:none;">
            <img src="https://cdn-icons-png.flaticon.com/512/174/174848.png" alt="Facebook" width="28" height="28" style="display:inline-block; border:0;" />
          </a>
        </td>
      </tr>
      <tr>
        <td align="center" style="font-family:Inter, Arial, sans-serif; font-size:14px; line-height:1.7; color:#FFFFFF;">
          <div><a href="https://maps.app.goo.gl/vTXLZvd8XPZEeRn16" style="color:#FFFFFF; text-decoration:underline;">Unit 2, 86 Jardine Drive, Redland Bay QLD 4165</a></div>
          <div><a href="tel:+61721468442" style="color:#FFFFFF; text-decoration:underline;">(07) 2146 8442</a></div>
          <div><a href="https://birdiesbayside.com.au" style="color:#FFFFFF; text-decoration:underline;">birdiesbayside.com.au</a></div>
          <div style="margin-top:10px; font-size:12px; opacity:0.75;">© Birdies Bayside</div>
        </td>
      </tr>
    </table>
  </td>
</tr>$FOOTER$
)
ON CONFLICT (id) DO NOTHING;
