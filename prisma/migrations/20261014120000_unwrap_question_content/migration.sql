-- Question jobs stored the {type, content} envelope in Question.content; unwrap it.
UPDATE "Question"
SET "content" = "content" -> 'content'
WHERE jsonb_typeof("content") = 'object'
  AND "content" ? 'type'
  AND "content" ? 'content';
