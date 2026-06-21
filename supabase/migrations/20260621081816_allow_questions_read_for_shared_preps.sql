-- Allow reading questions for preps that are shared (link or public visibility).
-- The preps RLS already controls who can see which preps; this policy extends
-- question visibility to match: if you can see the prep, you can see its questions.
create policy "questions readable for shared preps"
  on questions for select
  using (
    prep_id in (
      select id from preps where visibility in ('link', 'public')
    )
  );
