-- Fresh reset + setup script for MegaPrep Supabase backend.
-- WARNING: This script drops existing public app tables and recreates them.

begin;

create extension if not exists "pgcrypto";

-- Drop tables (dependent order)
drop table if exists public.attempts cascade;
drop table if exists public.exams cascade;
drop table if exists public.questions cascade;
drop table if exists public.students cascade;
drop table if exists public.devices cascade;
drop table if exists public.app_settings cascade;
drop table if exists public.profiles cascade;

drop function if exists public.is_admin() cascade;

-- Profiles for auth -> role mapping
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'admin' check (role in ('admin', 'student')),
  full_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  );
$$;

-- Core app tables
create table public.exams (
  id text primary key,
  level text,
  "group" text,
  subject text,
  course text,
  exam_number text,
  title text not null,
  duration integer,
  full_marks integer,
  exam_type text,
  exam_date date,
  start_time text,
  end_time text,
  sections jsonb default '[]'::jsonb,
  question_ids jsonb default '[]'::jsonb,
  published boolean default false,
  published_at timestamptz,
  published_snapshot jsonb,
  solution_published boolean default false,
  solution_published_at timestamptz,
  created_at timestamptz default now()
);

create table public.questions (
  id text primary key,
  type text not null check (type in ('mcq', 'cq')),
  level text,
  "group" text,
  subject text,
  topic text,
  section text,
  question text,
  stimulus text,
  options jsonb default '[]'::jsonb,
  correct integer,
  explanation text,
  sub_questions jsonb default '[]'::jsonb,
  image text,
  created_at timestamptz default now()
);

create table public.students (
  id text primary key,
  name text not null,
  roll_number text,
  class_name text,
  institute text,
  phone text,
  active boolean default true,
  created_at timestamptz default now()
);

create table public.attempts (
  id text primary key,
  exam_id text references public.exams(id) on delete cascade,
  student_id text references public.students(id) on delete cascade,
  score numeric default 0,
  total numeric default 0,
  correct_ids jsonb default '[]'::jsonb,
  incorrect_ids jsonb default '[]'::jsonb,
  student_answers jsonb default '[]'::jsonb,
  answer_breakdown jsonb default '[]'::jsonb,
  omr_preview text,
  omr_set text,
  created_at timestamptz default now()
);

create table public.devices (
  id text primary key,
  label text,
  browser text,
  role text,
  last_active timestamptz default now()
);

-- Singleton workspace document used by app.js cloud sync
create table public.app_settings (
  id integer primary key,
  dark_mode boolean default false,
  workspace_data jsonb not null default '{}'::jsonb,
  print_config jsonb not null default '{}'::jsonb,
  credentials jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  constraint app_settings_singleton check (id = 1)
);

insert into public.app_settings (id) values (1);

-- Row level security
alter table public.profiles enable row level security;
alter table public.exams enable row level security;
alter table public.questions enable row level security;
alter table public.students enable row level security;
alter table public.attempts enable row level security;
alter table public.devices enable row level security;
alter table public.app_settings enable row level security;

-- Profiles policies
create policy "profiles_self_read" on public.profiles
for select using (id = auth.uid());

create policy "profiles_self_insert" on public.profiles
for insert with check (id = auth.uid());

create policy "profiles_self_update" on public.profiles
for update using (id = auth.uid()) with check (id = auth.uid());

create policy "profiles_admin_all" on public.profiles
for all using (public.is_admin()) with check (public.is_admin());

-- Admin only policies for all data tables
create policy "admin_all_exams" on public.exams
for all using (public.is_admin()) with check (public.is_admin());

create policy "admin_all_questions" on public.questions
for all using (public.is_admin()) with check (public.is_admin());

create policy "admin_all_students" on public.students
for all using (public.is_admin()) with check (public.is_admin());

create policy "admin_all_attempts" on public.attempts
for all using (public.is_admin()) with check (public.is_admin());

create policy "admin_all_devices" on public.devices
for all using (public.is_admin()) with check (public.is_admin());

create policy "admin_all_app_settings" on public.app_settings
for all using (public.is_admin()) with check (public.is_admin());

-- Auto-promote your known admin email (if auth user already exists)
do $$
declare
  v_admin_id uuid;
begin
  select id into v_admin_id
  from auth.users
  where email = 'shahreyar202020@gmail.com'
  limit 1;

  if v_admin_id is not null then
    insert into public.profiles (id, role, full_name)
    values (v_admin_id, 'admin', 'shahreyar202020')
    on conflict (id) do update
      set role = 'admin',
          full_name = excluded.full_name,
          updated_at = now();
  end if;
end
$$;

commit;
