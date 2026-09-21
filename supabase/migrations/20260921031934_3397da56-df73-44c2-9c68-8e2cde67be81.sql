-- profiles: wrap auth checks in (select ...) so they evaluate once per query
drop policy if exists "Admins can view all profiles" on public.profiles;
create policy "Admins can view all profiles" on public.profiles for select using ((select public.has_role(auth.uid(), 'admin'::app_role)));

drop policy if exists "Admins can update all profiles" on public.profiles;
create policy "Admins can update all profiles" on public.profiles for update using ((select public.has_role(auth.uid(), 'admin'::app_role))) with check ((select public.has_role(auth.uid(), 'admin'::app_role)));

drop policy if exists "Users can view their own profile" on public.profiles;
create policy "Users can view their own profile" on public.profiles for select using ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile" on public.profiles for update using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert their own profile" on public.profiles;
create policy "Users can insert their own profile" on public.profiles for insert with check ((select auth.uid()) = user_id);

-- bookings: same treatment
drop policy if exists "Admins can view all bookings" on public.bookings;
create policy "Admins can view all bookings" on public.bookings for select using ((select public.has_role(auth.uid(), 'admin'::app_role)));

drop policy if exists "Admins can update all bookings" on public.bookings;
create policy "Admins can update all bookings" on public.bookings for update using ((select public.has_role(auth.uid(), 'admin'::app_role))) with check ((select public.has_role(auth.uid(), 'admin'::app_role)));

drop policy if exists "Admins can delete bookings" on public.bookings;
create policy "Admins can delete bookings" on public.bookings for delete using ((select public.has_role(auth.uid(), 'admin'::app_role)));

drop policy if exists "Admins can create bookings for customers" on public.bookings;
create policy "Admins can create bookings for customers" on public.bookings for insert with check ((select public.has_role(auth.uid(), 'admin'::app_role)));

drop policy if exists "Users can view their own bookings" on public.bookings;
create policy "Users can view their own bookings" on public.bookings for select using ((select auth.uid()) = user_id);

drop policy if exists "Users can view all bookings for availability" on public.bookings;
create policy "Users can view all bookings for availability" on public.bookings for select using ((select auth.role()) = 'authenticated');

drop policy if exists "Users can update their own bookings" on public.bookings;
create policy "Users can update their own bookings" on public.bookings for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own bookings" on public.bookings;
create policy "Users can create their own bookings" on public.bookings for insert with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own pending bookings" on public.bookings;
create policy "Users can delete their own pending bookings" on public.bookings for delete using (((select auth.uid()) = user_id) and (status = 'pending'::text));

-- indexes for admin lists
create index if not exists idx_profiles_name on public.profiles (first_name, last_name);
create index if not exists idx_pos_transactions_booking_completed on public.pos_transactions (status) where booking_id is not null;