alter table preps
  add column pages jsonb;

alter table preps
  drop column raw_text,
  drop column visual_elements;
