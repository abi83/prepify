create table questions (
  id uuid primary key default gen_random_uuid(),
  prep_id uuid references preps not null,
  type text not null, -- 'flashcard' | 'mcq' | 'fill'
  content jsonb not null,
  -- flashcard: { front, back }
  -- mcq:       { question, options: string[], answer: number }
  -- fill:      { sentence, answer }
  created_at timestamptz default now()
);

create table attempts (
  id uuid primary key default gen_random_uuid(),
  prep_id uuid references preps not null,
  user_id uuid references auth.users not null,
  mode text not null,   -- 'quiz' | 'test'
  score int not null,   -- correct answers
  total int not null,   -- total questions
  created_at timestamptz default now()
);

alter table questions enable row level security;
alter table attempts enable row level security;

create policy "users see own questions"
  on questions for all
  using (prep_id in (select id from preps where user_id = auth.uid()));

create policy "users see own attempts"
  on attempts for all using (auth.uid() = user_id);
