import { readFile, readdir } from "fs/promises"
import path from "path"

import { createFileStore } from "@/core/fileStore"
import type { Job } from "@/core/job"
import type { ListUnfinishedJobs, PrepData, PrepImageRef, Store } from "@/core/ports"
import { activeAssetHint } from "@/lib/assetHint"
import type { SupportedLanguage } from "@/lib/config"
import { ASSET_JOB_TYPE, CONCEPTS_EXTRACT_JOB_TYPE, CONCEPTS_JOB_TYPE, OCR_JOB_TYPE, PREP_META_JOB_TYPE, QUESTION_JOB_TYPE } from "@/lib/jobs/jobTypes"
import { indexMerges, indexPageConcepts } from "@/lib/jobs/pageConcepts"
import { countConceptUsage, type PrepState } from "@/lib/planner"
import type { StoredConcept } from "@/types/pipeline"
import type { GeneratedQuestion } from "@/types/questions"

const IMAGES_DIR = "images"
const JOBS_DIR = "jobs"
const MIME_TYPES: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" }

export interface FilePrep {
  data: PrepData
  store: Store
  listUnfinishedJobs: ListUnfinishedJobs
}

const jobNumber = (job: Job) => Number(job.id.replace(/^job-/, ""))

/**
 * A prep on disk: images under `<dir>/images`, jobs (via `createFileStore`) under `<dir>/jobs`.
 * Image ids are file names without extension; OCR results, concepts and counts are derived from
 * the executed jobs, so a rerun resumes where the last one stopped.
 */
export function createFilePrep(dir: string): FilePrep {
  const imagesDir = path.join(dir, IMAGES_DIR)
  const jobsDir = path.join(dir, JOBS_DIR)

  async function readJobs(): Promise<Job[]> {
    const names = await readdir(jobsDir).catch(err => {
      if (err.code === "ENOENT") return []
      throw err
    })
    const jobs = await Promise.all(names.map(async name => JSON.parse(await readFile(path.join(jobsDir, name), "utf-8")) as Job))
    return jobs.sort((a, b) => jobNumber(a) - jobNumber(b))
  }

  async function executed<T>(type: string): Promise<{ job: Job; output: T }[]> {
    const jobs = await readJobs()
    return jobs.filter(job => job.type === type && job.status === "executed").map(job => ({ job, output: job.output as T }))
  }

  async function concepts(): Promise<(StoredConcept & { id: string })[]> {
    const outputs = await executed<StoredConcept[]>(CONCEPTS_JOB_TYPE)
    return outputs.flatMap(({ job, output }) => output.map((concept, i) => ({ ...concept, id: `${job.id}-concept-${i + 1}` })))
  }

  async function listImages(): Promise<PrepImageRef[]> {
    const names = (await readdir(imagesDir)).filter(name => path.extname(name).toLowerCase() in MIME_TYPES).sort()
    const ocr = await executed<{ language: SupportedLanguage }>(OCR_JOB_TYPE)
    return names.map(name => {
      const id = path.parse(name).name
      const done = ocr.find(({ job }) => job.inputIds[0] === id)
      return { id, gcsKey: name, ocrResult: done?.output ?? null, language: done?.output.language ?? null }
    })
  }

  /** A question is identified by its `question` job's id; its asset, if any, is the output of its `asset` job. */
  const questions = () => executed<GeneratedQuestion>(QUESTION_JOB_TYPE)

  const data: PrepData = {
    listImages,
    async loadQuestion(_prepId, questionId) {
      const question = (await questions()).find(({ job }) => job.id === questionId)
      if (!question) throw new Error(`Question ${questionId} not found`)
      return { id: questionId, content: question.output.content }
    },
    async loadState(): Promise<PrepState> {
      const [ images, allConcepts, extractions, meta, allQuestions, jobs ] = await Promise.all([
        listImages(),
        concepts(),
        executed<unknown>(CONCEPTS_EXTRACT_JOB_TYPE),
        executed<unknown>(PREP_META_JOB_TYPE),
        questions(),
        readJobs(),
      ])
      const assetJobQuestionIds = new Set(jobs.filter(job => job.type === ASSET_JOB_TYPE).flatMap(job => job.inputIds))
      const pageConcepts = indexPageConcepts(extractions.map(({ job, output }) => ({ inputIds: job.inputIds, output })))
      const merges = indexMerges(jobs.filter(job => job.type === CONCEPTS_JOB_TYPE))
      return {
        images: images.map(image => ({ id: image.id, ocrDone: image.ocrResult !== null, concepts: pageConcepts.get(image.id) ?? { status: "pending" as const }, merge: merges.get(image.id) ?? "none" as const })),
        concepts: allConcepts,
        prepMetaDone: meta.length > 0,
        questionCount: allQuestions.length,
        questionJobCount: jobs.filter(job => job.type === QUESTION_JOB_TYPE).length,
        unfinishedJobCount: jobs.filter(job => job.status !== "executed").length,
        conceptUsage: countConceptUsage(jobs.filter(job => job.type === QUESTION_JOB_TYPE && job.status === "executed").flatMap(job => job.inputIds)),
        assetQuestionIds: allQuestions.filter(({ job, output }) => activeAssetHint(output.content) && !assetJobQuestionIds.has(job.id)).map(({ job }) => job.id),
      }
    },
    async downloadImage(_prepId, name) {
      const bytes = await readFile(path.join(imagesDir, name))
      return { base64: bytes.toString("base64"), mimeType: MIME_TYPES[path.extname(name).toLowerCase()] }
    },
  }

  const fileStore = createFileStore(jobsDir)
  const store: Store = {
    ...fileStore,
    // Job inputs are images, concepts and questions, not jobs.
    async existingIds(_actorId, ids) {
      const known = new Set([
        ...(await listImages()).map(image => image.id),
        ...(await concepts()).map(concept => concept.id),
        ...(await questions()).map(({ job }) => job.id),
      ])
      return new Set(ids.filter(id => known.has(id)))
    },
  }

  return {
    data,
    store,
    listUnfinishedJobs: async () => (await readJobs()).filter(job => job.status !== "executed"),
  }
}
