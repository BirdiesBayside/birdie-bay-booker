
-- Fix Lochlan Roff's account: typo .con -> .com
-- Step 1: Remove duplicate ghost account (bebb73ef, .com, no bookings/membership)
DELETE FROM public.profiles WHERE user_id = 'bebb73ef-b7d0-4406-81c0-50360b1f6d06';
DELETE FROM auth.users WHERE id = 'bebb73ef-b7d0-4406-81c0-50360b1f6d06';

-- Step 2: Correct the real account's email
UPDATE auth.users SET email = 'lochyroff@gmail.com' WHERE id = '18070dad-efd7-429b-8eed-eeb45b1789a5';
UPDATE public.profiles SET email = 'lochyroff@gmail.com', updated_at = now() WHERE user_id = '18070dad-efd7-429b-8eed-eeb45b1789a5';

-- Step 3: Fix SGT member record so sync matches correctly
UPDATE public.sgt_members SET user_email = 'lochyroff@gmail.com', updated_at = now() WHERE user_id = 45234;

-- Step 4: Clear the sgt_user_id linkage on the profile so admin can re-onboard cleanly
-- (he isn't in sgt_tour_members yet so this just removes him from the Pending Onboarding list
-- with the stale SGT ID; admin will re-link via the onboarding flow)
UPDATE public.profiles SET sgt_user_id = NULL WHERE user_id = '18070dad-efd7-429b-8eed-eeb45b1789a5';
