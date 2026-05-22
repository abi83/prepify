create table preps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  title text not null default 'Prep #1',
  raw_text text not null,
  created_at timestamptz default now()
);

alter table preps enable row level security;

create policy "users see own preps"
  on preps for all using (auth.uid() = user_id);
