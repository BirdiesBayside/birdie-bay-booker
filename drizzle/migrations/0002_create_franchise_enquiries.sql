CREATE TABLE public.franchise_enquiries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 created_at timestamptz NOT NULL DEFAULT now(),
 name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
 email text NOT NULL CHECK (char_length(email) <= 255),
 phone text NOT NULL CHECK (char_length(phone) BETWEEN 6 AND 30),
 region text NOT NULL CHECK (char_length(region) BETWEEN 1 AND 100),
 location text NOT NULL CHECK (char_length(location) BETWEEN 1 AND 200),
 budget text NOT NULL CHECK (budget IN ('$250k – $300k', '$300k - $500k', '$500k - $1M', 'Over $1M')),
 email_status text NOT NULL DEFAULT 'pending' CHECK (email_status IN ('pending','sent','failed')),
 email_message_id text,
 email_error text
);
GRANT SELECT ON public.franchise_enquiries TO authenticated;
GRANT ALL ON public.franchise_enquiries TO service_role;
ALTER TABLE public.franchise_enquiries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read franchise enquiries" ON public.franchise_enquiries FOR SELECT TO authenticated USING (public.has_role((SELECT auth.uid()), 'admin'));