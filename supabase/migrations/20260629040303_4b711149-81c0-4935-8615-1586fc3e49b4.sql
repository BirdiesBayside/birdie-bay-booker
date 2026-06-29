
CREATE TABLE public.ai_caddy_threads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'New conversation',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_caddy_threads TO authenticated;
GRANT ALL ON public.ai_caddy_threads TO service_role;
ALTER TABLE public.ai_caddy_threads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own threads" ON public.ai_caddy_threads FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX ai_caddy_threads_user_idx ON public.ai_caddy_threads(user_id, updated_at DESC);

CREATE TABLE public.ai_caddy_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  thread_id UUID NOT NULL REFERENCES public.ai_caddy_threads(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
  parts JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_caddy_messages TO authenticated;
GRANT ALL ON public.ai_caddy_messages TO service_role;
ALTER TABLE public.ai_caddy_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Messages in own threads" ON public.ai_caddy_messages FOR ALL
  USING (EXISTS (SELECT 1 FROM public.ai_caddy_threads t WHERE t.id = thread_id AND t.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.ai_caddy_threads t WHERE t.id = thread_id AND t.user_id = auth.uid()));
CREATE INDEX ai_caddy_messages_thread_idx ON public.ai_caddy_messages(thread_id, created_at);

CREATE TABLE public.ai_caddy_actions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  thread_id UUID REFERENCES public.ai_caddy_threads(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tool_name TEXT NOT NULL,
  args JSONB,
  result JSONB,
  status TEXT NOT NULL DEFAULT 'success',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.ai_caddy_actions TO authenticated;
GRANT ALL ON public.ai_caddy_actions TO service_role;
ALTER TABLE public.ai_caddy_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read all actions" ON public.ai_caddy_actions FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users read own actions" ON public.ai_caddy_actions FOR SELECT
  USING (auth.uid() = user_id);
CREATE INDEX ai_caddy_actions_user_idx ON public.ai_caddy_actions(user_id, created_at DESC);

CREATE TRIGGER ai_caddy_threads_updated_at
  BEFORE UPDATE ON public.ai_caddy_threads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
