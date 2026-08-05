-- Re-add FK constraints with ON DELETE CASCADE so deleting a prep
-- automatically removes its questions, attempts, and pipeline_runs.

alter table questions
  drop constraint questions_prep_id_fkey,
  add constraint questions_prep_id_fkey
    foreign key (prep_id) references preps(id) on delete cascade;

alter table attempts
  drop constraint attempts_prep_id_fkey,
  add constraint attempts_prep_id_fkey
    foreign key (prep_id) references preps(id) on delete cascade;

alter table pipeline_runs
  drop constraint pipeline_runs_prep_id_fkey,
  add constraint pipeline_runs_prep_id_fkey
    foreign key (prep_id) references preps(id) on delete cascade;

-- RLS: allow owners to delete their preps
create policy "owners can delete own preps"
  on preps for delete
  using (user_id = auth.uid());
