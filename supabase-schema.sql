-- StudyBuddy NG Database Schema
-- Run this in Supabase SQL Editor

-- Profiles (extends auth.users)
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  full_name text not null,
  matric_number text not null unique,
  institution text not null,
  role text not null default 'student' check (role in ('student', 'admin')),
  created_at timestamptz default now()
);

-- Courses
create table if not exists public.courses (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  code text not null,
  title text,
  created_at timestamptz default now()
);

-- Materials (uploaded PDFs)
create table if not exists public.materials (
  id uuid default gen_random_uuid() primary key,
  course_id uuid references public.courses(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  title text not null,
  file_path text not null,
  file_size bigint,
  page_count int,
  status text not null default 'uploading' check (status in ('uploading', 'processing', 'ready', 'failed')),
  created_at timestamptz default now()
);

-- Questions generated from materials
create table if not exists public.questions (
  id uuid default gen_random_uuid() primary key,
  material_id uuid references public.materials(id) on delete cascade not null,
  question_text text not null,
  options jsonb not null, -- ["optionA", "optionB", "optionC", "optionD"]
  correct_index int not null check (correct_index between 0 and 3),
  explanation text,
  page_reference text,
  topic text,
  created_at timestamptz default now()
);

-- Quiz attempts
create table if not exists public.quiz_attempts (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  material_id uuid references public.materials(id) on delete cascade not null,
  type text not null check (type in ('test', 'exam', 'custom', 'quick')),
  total_questions int not null,
  correct_count int not null,
  time_taken_seconds int not null,
  answers jsonb not null default '{}',
  created_at timestamptz default now()
);

-- Indexes
create index if not exists idx_courses_user on public.courses(user_id);
create index if not exists idx_materials_course on public.materials(course_id);
create index if not exists idx_materials_user on public.materials(user_id);
create index if not exists idx_questions_material on public.questions(material_id);
create index if not exists idx_attempts_user on public.quiz_attempts(user_id);

-- RLS
alter table public.profiles enable row level security;
alter table public.courses enable row level security;
alter table public.materials enable row level security;
alter table public.questions enable row level security;
alter table public.quiz_attempts enable row level security;

-- Profiles policies
create policy "Users can view own profile"
  on public.profiles for select using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update using (auth.uid() = id);

create policy "Users can insert own profile"
  on public.profiles for insert with check (auth.uid() = id);

-- Courses policies
create policy "Users can manage own courses"
  on public.courses for all using (auth.uid() = user_id);

-- Materials policies
create policy "Users can manage own materials"
  on public.materials for all using (auth.uid() = user_id);

-- Questions policies (read for owner of material)
create policy "Users can read questions from own materials"
  on public.questions for select using (
    exists (
      select 1 from public.materials m
      where m.id = material_id and m.user_id = auth.uid()
    )
  );

create policy "System can insert questions"
  on public.questions for insert with check (true);

-- Quiz attempts policies
create policy "Users can manage own attempts"
  on public.quiz_attempts for all using (auth.uid() = user_id);

-- Storage bucket (run separately if needed)
-- insert into storage.buckets (id, name, public) values ('materials', 'materials', false);

-- Storage policies would go here after creating the bucket
