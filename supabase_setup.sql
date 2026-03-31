-- Run in Supabase SQL Editor
create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'admin' check (role in ('admin','student')),
  full_name text,
  created_at timestamptz not null default now()
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

alter table public.profiles enable row level security;

drop policy if exists "admin all profiles" on public.profiles;
create policy "admin all profiles" on public.profiles
for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "self read profile" on public.profiles;
create policy "self read profile" on public.profiles
for select using (id = auth.uid());

-- Core tables
create table if not exists public.exams (
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

create table if not exists public.questions (
  id text primary key,
  type text not null check (type in ('mcq','cq')),
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

create table if not exists public.students (
  id text primary key,
  name text not null,
  roll_number text,
  class_name text,
  institute text,
  phone text,
  active boolean default true,
  created_at timestamptz default now()
);

create table if not exists public.attempts (
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

create table if not exists public.devices (
  id text primary key,
  label text,
  browser text,
  role text,
  last_active timestamptz default now()
);

create table if not exists public.app_settings (
  id int primary key default 1,
  dark_mode boolean default false,
  print_config jsonb default '{}'::jsonb,
  credentials jsonb default '{}'::jsonb,
  constraint app_settings_singleton check (id = 1)
);

insert into public.app_settings(id) values (1)
on conflict (id) do nothing;

-- Admin-only policies for app tables
alter table public.exams enable row level security;
alter table public.questions enable row level security;
alter table public.students enable row level security;
alter table public.attempts enable row level security;
alter table public.devices enable row level security;
alter table public.app_settings enable row level security;

drop policy if exists "admin all exams" on public.exams;
create policy "admin all exams" on public.exams for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admin all questions" on public.questions;
create policy "admin all questions" on public.questions for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admin all students" on public.students;
create policy "admin all students" on public.students for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admin all attempts" on public.attempts;
create policy "admin all attempts" on public.attempts for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admin all devices" on public.devices;
create policy "admin all devices" on public.devices for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admin all app_settings" on public.app_settings;
create policy "admin all app_settings" on public.app_settings for all using (public.is_admin()) with check (public.is_admin());
