alter table preps add column tokens_used int not null default 0;

-- Atomically increment tokens_used for a prep.
-- Runs as the invoker so RLS on preps is respected — users can only update their own rows.
create or replace function increment_prep_tokens(p_prep_id uuid, p_delta int)
returns void
language sql
as $$
  update preps set tokens_used = tokens_used + p_delta where id = p_prep_id;
$$;

grant execute on function increment_prep_tokens(uuid, int) to authenticated;
