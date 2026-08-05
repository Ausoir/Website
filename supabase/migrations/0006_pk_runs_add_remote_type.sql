-- If pk_runs (0003) was already applied before "remote" was added as a
-- valid test_type, saving a Remote View run would fail its check
-- constraint. Safe to run whether or not pk_runs exists yet or already
-- allows 'remote' — no-ops in either case.

do $$
begin
  if exists (select 1 from information_schema.tables where table_name = 'pk_runs') then
    alter table pk_runs drop constraint if exists pk_runs_test_type_check;
    alter table pk_runs add constraint pk_runs_test_type_check
      check (test_type in ('micro', 'macro', 'instinct', 'remote'));
  end if;
end $$;
