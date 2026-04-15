
CREATE TABLE public.comp_partner_board (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  player_name TEXT NOT NULL,
  contact_info TEXT NOT NULL,
  handicap NUMERIC NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.comp_partner_board ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view active listings"
  ON public.comp_partner_board FOR SELECT
  TO authenticated
  USING (is_active = true);

CREATE POLICY "Users can add themselves"
  ON public.comp_partner_board FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own listing"
  ON public.comp_partner_board FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own listing"
  ON public.comp_partner_board FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all listings"
  ON public.comp_partner_board FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_comp_partner_board_updated_at
  BEFORE UPDATE ON public.comp_partner_board
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
