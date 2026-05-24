create table pipeline_runs (
  id uuid primary key default gen_random_uuid(),
  prep_id uuid references preps not null unique,
  concepts jsonb,
  question_tasks jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table pipeline_questions (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references pipeline_runs on delete cascade not null,
  task_index int not null,
  task jsonb not null,
  question jsonb,
  created_at timestamptz default now(),
  unique (run_id, task_index)
);

alter table pipeline_runs enable row level security;
alter table pipeline_questions enable row level security;

create policy "Users access own pipeline_runs"
  on pipeline_runs for all
  using (prep_id in (select id from preps where user_id = auth.uid()));

create policy "Users access own pipeline_questions"
  on pipeline_questions for all
  using (
    run_id in (
      select pr.id from pipeline_runs pr
      join preps p on p.id = pr.prep_id
      where p.user_id = auth.uid()
    )
  );

grant select, insert, update, delete on pipeline_runs to authenticated;
grant select, insert, update, delete on pipeline_questions to authenticated;
