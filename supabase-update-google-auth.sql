-- StudyBuddy: switch to Google sign in + remove matric number + lock down roles
-- Run this ONCE in Supabase > SQL Editor. It is safe to run twice.

-- 1) Matric number is gone. Keep the column (old data stays) but stop requiring it.
--    This is what stops "Database error saving new user" for new Google accounts.
alter table public.profiles alter column matric_number drop not null;
alter table public.profiles drop constraint if exists profiles_matric_number_key;
-- (If the line above did nothing, find the real name with:
--  select conname from pg_constraint where conrelid = 'public.profiles'::regclass and contype = 'u';)

-- A new Google student has no school yet. They fill it in on the onboarding page.
alter table public.profiles alter column institution drop not null;

-- 2) Create the profile row automatically when a student signs in with Google for the first time.
--    Google gives us full_name (or name) in the account details.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
      nullif(trim(new.raw_user_meta_data->>'name'), ''),
      split_part(coalesce(new.email, 'student'), '@', 1)
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Your project already has a trigger from the old sign up (name unknown). See STEP 4 in the guide:
-- list it first, then drop it, then run the create trigger line below.
-- drop trigger if exists on_auth_user_created on auth.users;
-- create trigger on_auth_user_created after insert on auth.users
--   for each row execute function public.handle_new_user();

-- 3) SECURITY: stop students from making themselves admin.
--    Before this, a student could run  update profiles set role = 'admin'  from the browser.
revoke update on public.profiles from authenticated, anon;
grant update (full_name, institution, department, level) on public.profiles to authenticated;

drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id and role = 'student');
