-- Persisted PP Lab run history, for signed-in users only. Anonymous runs are
-- never written here — they only ever live in the browser's in-memory state.

create table pk_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  test_type text not null check (test_type in ('micro', 'macro', 'instinct', 'remote')),
  target text not null,
  trials integer not null,
  observed integer not null,
  expected double precision not null,
  deviation double precision not null,
  z double precision not null,
  p double precision not null,
  created_at timestamptz not null default now()
);

create index pk_runs_user_id_idx on pk_runs (user_id, test_type);

alter table pk_runs enable row level security;

create policy "Users can create their own pk runs"
  on pk_runs for insert
  with check (auth.uid() = user_id);

create policy "Users can read their own pk runs"
  on pk_runs for select
  using (auth.uid() = user_id);
