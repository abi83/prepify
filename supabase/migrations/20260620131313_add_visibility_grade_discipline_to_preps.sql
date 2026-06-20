-- Enums
create type prep_visibility as enum ('private', 'link', 'public');

create type prep_discipline as enum (
  'History',
  'Geography',
  'Literature',
  'Languages',
  'Social Studies',
  'Economics',
  'Philosophy/Ethics',
  'Biology',
  'Chemistry',
  'Physics',
  'Mathematics',
  'Computer Science'
);

-- New columns on preps
alter table preps
  add column visibility prep_visibility not null default 'private',
  add column grade integer check (grade between 1 and 13),
  add column discipline prep_discipline;

-- Drop the existing catch-all RLS policy
drop policy "users see own preps" on preps;

-- Owner can do everything on their own preps
create policy "owner full access"
  on preps for all
  using (auth.uid() = user_id);

-- link-visibility: any authenticated or anonymous user can SELECT if they know the id
create policy "link preps readable by anyone with id"
  on preps for select
  using (visibility = 'link');

-- public-visibility: readable by everyone including unauthenticated
create policy "public preps readable by all"
  on preps for select
  using (visibility = 'public');
