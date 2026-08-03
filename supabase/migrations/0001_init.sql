-- Core schema for the MBTI-style measurement site.
-- Run this in the Supabase SQL Editor (or via `supabase db push` once the CLI is linked).

create extension if not exists "pgcrypto";

-- A quiz, e.g. "Which of 16 personality types are you?"
create table quizzes (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  description text,
  is_published boolean not null default false,
  created_at timestamptz not null default now()
);

-- A scoring axis within a quiz, e.g. "E/I", "S/N" for MBTI-style quizzes.
create table quiz_dimensions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references quizzes (id) on delete cascade,
  key text not null,              -- short code, e.g. "EI"
  low_label text not null,        -- e.g. "Introvert"
  high_label text not null,       -- e.g. "Extrovert"
  sort_order int not null default 0,
  unique (quiz_id, key)
);

create table questions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references quizzes (id) on delete cascade,
  prompt text not null,
  sort_order int not null default 0
);

-- Each answer option contributes weighted scores to one or more dimensions,
-- e.g. {"EI": 1, "SN": -1}. Keys must match quiz_dimensions.key for the same quiz.
create table question_options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references questions (id) on delete cascade,
  label text not null,
  sort_order int not null default 0,
  scores jsonb not null default '{}'::jsonb
);

-- A possible outcome/profile for a quiz, e.g. "INTJ - The Architect".
create table result_profiles (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references quizzes (id) on delete cascade,
  code text not null,             -- e.g. "INTJ"
  name text not null,             -- e.g. "The Architect"
  description text,
  unique (quiz_id, code)
);

-- One completed run of a quiz. user_id is nullable to allow anonymous takers.
create table attempts (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references quizzes (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  result_profile_id uuid references result_profiles (id),
  raw_scores jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table answers (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references attempts (id) on delete cascade,
  question_id uuid not null references questions (id) on delete cascade,
  option_id uuid not null references question_options (id) on delete cascade
);

create index answers_attempt_id_idx on answers (attempt_id);
create index attempts_user_id_idx on attempts (user_id);
create index questions_quiz_id_idx on questions (quiz_id);
create index question_options_question_id_idx on question_options (question_id);

-- Row Level Security -------------------------------------------------------

alter table quizzes enable row level security;
alter table quiz_dimensions enable row level security;
alter table questions enable row level security;
alter table question_options enable row level security;
alter table result_profiles enable row level security;
alter table attempts enable row level security;
alter table answers enable row level security;

-- Quiz content is public read-only (editing happens via the dashboard/service role).
create policy "Published quiz content is publicly readable"
  on quizzes for select
  using (is_published = true);

create policy "Dimensions of published quizzes are publicly readable"
  on quiz_dimensions for select
  using (exists (
    select 1 from quizzes q where q.id = quiz_dimensions.quiz_id and q.is_published
  ));

create policy "Questions of published quizzes are publicly readable"
  on questions for select
  using (exists (
    select 1 from quizzes q where q.id = questions.quiz_id and q.is_published
  ));

create policy "Options of published quizzes are publicly readable"
  on question_options for select
  using (exists (
    select 1 from questions qu
    join quizzes q on q.id = qu.quiz_id
    where qu.id = question_options.question_id and q.is_published
  ));

create policy "Result profiles of published quizzes are publicly readable"
  on result_profiles for select
  using (exists (
    select 1 from quizzes q where q.id = result_profiles.quiz_id and q.is_published
  ));

-- Attempts/answers: anyone can create one (anonymous quiz-taking is allowed),
-- but you can only read/manage your own once signed in.
create policy "Anyone can create an attempt"
  on attempts for insert
  with check (true);

create policy "Users can read their own attempts"
  on attempts for select
  using (auth.uid() = user_id);

create policy "Anyone can create answers"
  on answers for insert
  with check (true);

create policy "Users can read answers on their own attempts"
  on answers for select
  using (exists (
    select 1 from attempts a
    where a.id = answers.attempt_id
      and a.user_id = auth.uid()
  ));
