-- The Remote View console was reworked from a lat/lon coordinate-guessing
-- game to an ARV-style guess-the-target game, and pk_remote_sessions'
-- schema changed incompatibly (target_name/guess_name replace lat/lon,
-- then later replaced target_number/guess_number). Old rows from any prior
-- version of this table are no longer meaningful under the new schema, so
-- this drops and recreates the table from scratch rather than migrating
-- data forward.

drop table if exists pk_remote_sessions;

create table pk_remote_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  target_name text not null,
  guess_name text not null,
  hit boolean not null,
  notes text not null default '',
  created_at timestamptz not null default now()
);

create index pk_remote_sessions_user_id_idx on pk_remote_sessions (user_id, created_at desc);

alter table pk_remote_sessions enable row level security;

create policy "Users can create their own remote view sessions"
  on pk_remote_sessions for insert
  with check (auth.uid() = user_id);

create policy "Users can read their own remote view sessions"
  on pk_remote_sessions for select
  using (auth.uid() = user_id);
