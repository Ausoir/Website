-- Fixes an RLS bug in 0001_init.sql: the original policies let any
-- signed-in user read *every* anonymous visitor's attempts/answers
-- (since `user_id is null` matched for everyone), not just their own.
-- Only needed if you already ran 0001_init.sql before this fix landed there.

drop policy if exists "Users can read their own attempts" on attempts;
create policy "Users can read their own attempts"
  on attempts for select
  using (auth.uid() = user_id);

drop policy if exists "Users can read answers on their own attempts" on answers;
create policy "Users can read answers on their own attempts"
  on answers for select
  using (exists (
    select 1 from attempts a
    where a.id = answers.attempt_id
      and a.user_id = auth.uid()
  ));
