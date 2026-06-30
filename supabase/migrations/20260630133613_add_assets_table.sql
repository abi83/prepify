-- Assets: LLM-generated visual content (formulas, diagrams, molecules) attached to questions.
-- Each asset is a self-contained HTML blob rendered in a sandboxed iframe.
create table assets (
  id          uuid primary key default gen_random_uuid(),
  question_id uuid not null references questions(id) on delete cascade,
  type        text not null check (type in ('formula', 'molecule', 'diagram', 'table', 'svg', 'image')),
  blob        text not null,
  created_at  timestamptz not null default now()
);

-- RLS: asset is readable if the parent question's prep is readable by the current user.
alter table assets enable row level security;

create policy "assets owner full access"
  on assets for all
  using (
    question_id in (
      select q.id from questions q
      join preps p on p.id = q.prep_id
      where p.user_id = auth.uid()
    )
  )
  with check (
    question_id in (
      select q.id from questions q
      join preps p on p.id = q.prep_id
      where p.user_id = auth.uid()
    )
  );

create policy "assets readable for shared preps"
  on assets for select
  using (
    question_id in (
      select q.id from questions q
      join preps p on p.id = q.prep_id
      where p.visibility in ('link', 'public')
    )
  );
