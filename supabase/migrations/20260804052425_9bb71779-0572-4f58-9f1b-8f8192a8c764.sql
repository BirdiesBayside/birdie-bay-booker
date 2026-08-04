INSERT INTO public.sgt_members (user_id, user_name, user_email, user_active)
VALUES (30232, 'CMoore90', 'chriswmoore10@outlook.com', 1)
ON CONFLICT (user_id) DO UPDATE SET user_active = 1, user_email = EXCLUDED.user_email, updated_at = now();

INSERT INTO public.sgt_tour_members (user_id, user_name, tour_id, hcp_index, custom_hcp)
VALUES (30232, 'CMoore90', 2703, 14, 14)
ON CONFLICT DO NOTHING;