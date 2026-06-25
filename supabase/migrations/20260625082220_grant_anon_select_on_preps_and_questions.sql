-- Allow unauthenticated (anon) users to SELECT preps and questions.
-- RLS policies already restrict which rows are visible (public/link visibility),
-- but without this GRANT the anon role is denied at the table level before RLS runs.
grant select on table preps to anon;
grant select on table questions to anon;
