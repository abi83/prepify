import { z } from "zod"

import { SUPPORTED_LANGUAGES } from "@/lib/config"
import { ASSET_JOB_TYPE, CONCEPTS_EXTRACT_JOB_TYPE, CONCEPTS_JOB_TYPE, OCR_JOB_TYPE, PREP_META_JOB_TYPE, QUESTION_JOB_TYPE } from "@/lib/jobs/jobTypes"

import { pageConceptsSchema, storedConceptSchema } from "./pipeline"
import { ocrResultSchema, prepDisciplineSchema } from "./prep"
import { assetTypeSchema, generatedQuestionSchema } from "./questions"

/** Per-job-type shape of `JobOutcome.output`, enforced server-side before any domain writer runs. */
const JOB_OUTPUT_SCHEMAS: Record<string, z.ZodType> = {
  [OCR_JOB_TYPE]: ocrResultSchema.extend({ language: z.enum(SUPPORTED_LANGUAGES) }),
  [CONCEPTS_EXTRACT_JOB_TYPE]: pageConceptsSchema,
  [CONCEPTS_JOB_TYPE]: z.array(storedConceptSchema),
  [PREP_META_JOB_TYPE]: z.object({
    title: z.string(),
    description: z.string(),
    grade: z.number().int().nullable(),
    discipline: prepDisciplineSchema.nullable(),
  }),
  [QUESTION_JOB_TYPE]: generatedQuestionSchema,
  [ASSET_JOB_TYPE]: z.object({ type: assetTypeSchema, blob: z.string() }),
}

/** Returns `output` stripped to its job type's schema; throws on a mismatch or an unknown type. */
export function parseJobOutput(jobType: string, output: unknown): unknown {
  const schema = JOB_OUTPUT_SCHEMAS[jobType]
  if (!schema) throw new Error(`Job type "${jobType}" has no output schema`)
  return schema.parse(output)
}
