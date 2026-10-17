import { execFileSync } from "child_process"
import { parseArgs } from "util"

import { OpenAiLlm } from "@/lib/llm/openAiLlm"
import { createLogger } from "@/lib/logger/core"
import { loadModelCatalog } from "@/lib/modelCatalogFile"

import { createDiskResultSink, createDiskSampleSource } from "./diskAdapters"
import { loadExperiment, type Location } from "./experiment"
import { formatSummary } from "./format"
import { createGcsResultSink, createGcsSampleSource, teeResultSinks, uploadSamples } from "./gcsAdapters"
import { runExperiment } from "./run"

const USAGE = `Usage:
  npm run evals -- run <experiment.yml>
      Judge every sample of the experiment's cell and write results to its \`results\` location.
API key: OPENAI_API_KEY (any non-empty value for local endpoints).
GCS locations and artifactsBucket authenticate via Application Default Credentials.`

function fail(): never {
  console.error(USAGE)
  process.exit(1)
}

const { positionals } = parseArgs({ allowPositionals: true, options: {} })
const [ command, file ] = positionals
const apiKey = process.env.OPENAI_API_KEY
if (command !== "run" || !file || positionals.length > 2 || !apiKey) fail()

const experiment = await loadExperiment(file)
const gitSha = execFileSync("git", [ "rev-parse", "HEAD" ], { encoding: "utf-8" }).trim()
const artifactsPrefix = `runs/${new Date().toISOString().replace(/[:.]/g, "-")}-${gitSha.slice(0, 7)}/`

const resultSink = (results: Location) =>
  "bucket" in results ? createGcsResultSink(results.bucket) : createDiskResultSink(results.dir)

const { samples, results, artifactsBucket } = experiment
const baseSource = "bucket" in samples ? createGcsSampleSource(samples.bucket) : createDiskSampleSource(samples.dir)
const source = artifactsBucket
  ? {
    async readCell(cell: Parameters<typeof baseSource.readCell>[0]) {
      const cellSamples = await baseSource.readCell(cell)
      await uploadSamples(artifactsBucket, cellSamples, undefined, artifactsPrefix)
      return cellSamples
    },
  }
  : baseSource
const sink = artifactsBucket
  ? teeResultSinks(resultSink(results), createGcsResultSink(artifactsBucket, undefined, artifactsPrefix))
  : resultSink(results)

const summary = await runExperiment(experiment, {
  source,
  sink,
  llm: new OpenAiLlm({ apiKey, baseUrl: experiment.judge.baseUrl }),
  logger: createLogger({ transport: line => process.stderr.write(line + "\n"), minLevel: "info" }),
  catalog: await loadModelCatalog(),
  gitSha,
})
console.log(formatSummary(summary))
if (artifactsBucket) console.log(`Artifacts: gs://${artifactsBucket}/${artifactsPrefix}`)
