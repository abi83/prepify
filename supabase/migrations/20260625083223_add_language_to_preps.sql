alter table preps
  add column language text check (language in ('en', 'de', 'it', 'fr', 'es', 'pl', 'nl', 'pt', 'ru', 'uk', 'cs', 'sk', 'ro', 'hu', 'tr'));
