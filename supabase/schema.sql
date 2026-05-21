create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  intention text,
  role text not null default 'user' check (role in ('user', 'admin')),
  psychological_profile text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.dream_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  analyst_key text not null check (analyst_key in ('freud', 'jung', 'adler')),
  analyst_name text not null,
  dream_at text,
  dream_text text not null,
  waking_life text,
  mood text,
  followup_answers jsonb not null default '[]'::jsonb,
  analysis jsonb not null,
  image_url text,
  image_prompt text,
  image_mime_type text,
  feedback text check (feedback in ('hit', 'miss', 'unsure')),
  feedback_note text,
  inner_questions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.dream_records add column if not exists image_url text;
alter table public.dream_records add column if not exists image_prompt text;
alter table public.dream_records add column if not exists image_mime_type text;
alter table public.dream_records add column if not exists feedback text check (feedback in ('hit', 'miss', 'unsure'));
alter table public.dream_records add column if not exists feedback_note text;

create table if not exists public.profile_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  dream_record_id uuid references public.dream_records(id) on delete cascade,
  profile text not null,
  change_summary text,
  motifs text[] not null default '{}'::text[],
  feedback text check (feedback in ('hit', 'miss', 'unsure')),
  created_at timestamptz not null default now()
);

create table if not exists public.drift_bottles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 4 and 280),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  moderator_id uuid references auth.users(id) on delete set null,
  moderation_note text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create table if not exists public.bottle_receipts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  bottle_id uuid not null references public.drift_bottles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, bottle_id)
);

create table if not exists public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_table text,
  target_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
before update on public.profiles
for each row execute function public.touch_updated_at();

drop trigger if exists dream_records_touch_updated_at on public.dream_records;
create trigger dream_records_touch_updated_at
before update on public.dream_records
for each row execute function public.touch_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name, intention)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data ->> 'intention'
  )
  on conflict (id) do update
  set
    email = excluded.email,
    display_name = coalesce(public.profiles.display_name, excluded.display_name),
    intention = coalesce(public.profiles.intention, excluded.intention);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.is_admin(user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = user_id
      and role = 'admin'
  );
$$;

alter table public.profiles enable row level security;
alter table public.dream_records enable row level security;
alter table public.profile_snapshots enable row level security;
alter table public.drift_bottles enable row level security;
alter table public.bottle_receipts enable row level security;
alter table public.admin_audit_logs enable row level security;

drop policy if exists "Users read own profile" on public.profiles;
create policy "Users read own profile"
on public.profiles for select
using (auth.uid() = id or public.is_admin(auth.uid()));

drop policy if exists "Users update own profile" on public.profiles;
create policy "Users update own profile"
on public.profiles for update
using (auth.uid() = id)
with check (auth.uid() = id and role = (select role from public.profiles where id = auth.uid()));

drop policy if exists "Users insert own dreams" on public.dream_records;
create policy "Users insert own dreams"
on public.dream_records for insert
with check (auth.uid() = user_id);

drop policy if exists "Users read own dreams" on public.dream_records;
create policy "Users read own dreams"
on public.dream_records for select
using (auth.uid() = user_id or public.is_admin(auth.uid()));

drop policy if exists "Users update own dreams" on public.dream_records;
create policy "Users update own dreams"
on public.dream_records for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users delete own dreams" on public.dream_records;
create policy "Users delete own dreams"
on public.dream_records for delete
using (auth.uid() = user_id);

drop policy if exists "Users insert own profile snapshots" on public.profile_snapshots;
create policy "Users insert own profile snapshots"
on public.profile_snapshots for insert
with check (auth.uid() = user_id);

drop policy if exists "Users read own profile snapshots" on public.profile_snapshots;
create policy "Users read own profile snapshots"
on public.profile_snapshots for select
using (auth.uid() = user_id or public.is_admin(auth.uid()));

drop policy if exists "Users update own profile snapshots" on public.profile_snapshots;
create policy "Users update own profile snapshots"
on public.profile_snapshots for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users delete own profile snapshots" on public.profile_snapshots;
create policy "Users delete own profile snapshots"
on public.profile_snapshots for delete
using (auth.uid() = user_id);

drop policy if exists "Users create pending bottles" on public.drift_bottles;
create policy "Users create pending bottles"
on public.drift_bottles for insert
with check (auth.uid() = user_id and status = 'pending');

drop policy if exists "Users read own or approved bottles" on public.drift_bottles;
create policy "Users read own or approved bottles"
on public.drift_bottles for select
using (auth.uid() = user_id or status = 'approved' or public.is_admin(auth.uid()));

drop policy if exists "Users update own pending bottles" on public.drift_bottles;
create policy "Users update own pending bottles"
on public.drift_bottles for update
using (auth.uid() = user_id and status = 'pending')
with check (auth.uid() = user_id and status = 'pending');

drop policy if exists "Users receive bottles" on public.bottle_receipts;
create policy "Users receive bottles"
on public.bottle_receipts for insert
with check (auth.uid() = user_id);

drop policy if exists "Users read own receipts" on public.bottle_receipts;
create policy "Users read own receipts"
on public.bottle_receipts for select
using (auth.uid() = user_id or public.is_admin(auth.uid()));

drop policy if exists "Admins read audit logs" on public.admin_audit_logs;
create policy "Admins read audit logs"
on public.admin_audit_logs for select
using (public.is_admin(auth.uid()));

drop policy if exists "Admins write audit logs" on public.admin_audit_logs;
create policy "Admins write audit logs"
on public.admin_audit_logs for insert
with check (public.is_admin(auth.uid()));

create index if not exists dream_records_user_created_idx on public.dream_records (user_id, created_at desc);
create index if not exists profile_snapshots_user_created_idx on public.profile_snapshots (user_id, created_at desc);
create index if not exists drift_bottles_status_created_idx on public.drift_bottles (status, created_at desc);
create index if not exists bottle_receipts_user_created_idx on public.bottle_receipts (user_id, created_at desc);
