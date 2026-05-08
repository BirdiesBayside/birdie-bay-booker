-- Create storage bucket for sim centre brand guide PDFs
insert into storage.buckets (id, name, public)
values ('sim-centre-brand-guides', 'sim-centre-brand-guides', true)
on conflict (id) do nothing;

-- Allow anonymous uploads (questionnaire is public, no auth)
create policy "Anyone can upload brand guides"
on storage.objects
for insert
to anon, authenticated
with check (bucket_id = 'sim-centre-brand-guides');

create policy "Anyone can read brand guides"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'sim-centre-brand-guides');

-- Add brand_guide_url column to submissions
alter table public.sim_centre_submissions
add column if not exists brand_guide_url text;