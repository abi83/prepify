import { parseArgs } from "util"

import type { GenerationProgress } from "@/lib/jobs/generation"
import { loadModelCatalog } from "@/lib/modelCatalogFile"

import { loadCliConfig, resolveCliConfig } from "./config"
import { apiKeyEnv, createCliJobs, runCli, runCliJobs } from "./root"

const USAGE = `Usage:
  npm run cli -- create <prepDir> [--config-file <file.yml>]
      Plan the next stage and save it as jobs (carrying the config's llm/job settings); runs nothing.
  npm run cli -- run <prepDir> [--config-file <file.yml>] [--job <id>]...
      Run the given jobs, or every unfinished job when no --job is given.
  npm run cli -- all <prepDir> [--config-file <file.yml>]
      Run the whole pipeline: OCR, then everything else the target needs.
Images are read from <prepDir>/images; jobs and logs are written next to them.
Samples always go to ./data/samples/{agent}/{promptHash}/{model}/{id}.json, whatever the <prepDir>.
API key (run, all): GEMINI_API_KEY for Gemini models, otherwise OPENAI_API_KEY (any non-empty value for local endpoints).
Config file: YAML overrides for llm, job, run, log and target; see src/cli/config.ts.
Unfinished jobs keep the config they were created with — use a fresh <prepDir> to apply new settings.`

const logProgress = (progress: GenerationProgress) => console.log(progress.stage === "done" ? "done" : `${progress.stage} ${progress.done}/${progress.total}`)

function fail(): never {
  console.error(USAGE)
  process.exit(1)
}

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { "config-file": { type: "string" }, job: { type: "string", multiple: true } },
})

const [ command, prepDir ] = positionals
if (!prepDir || positionals.length > 2) fail()

const configFile = values["config-file"]
const config = configFile ? await loadCliConfig(configFile) : resolveCliConfig({})
const jobIds = values.job ?? []
const apiKey = command === "run" || command === "all" ? process.env[apiKeyEnv(config, await loadModelCatalog())] : undefined
const samplesRoot = "data"

switch (command) {
case "create": {
  if (jobIds.length > 0) fail()
  const jobs = await createCliJobs({ prepDir, config })
  console.log(jobs.length === 0 ? "nothing to create" : jobs.map(job => `${job.id} ${job.type}`).join("\n"))
  break
}
case "run": {
  if (!apiKey) fail()
  await runCliJobs({ prepDir, samplesRoot, apiKey, config, jobIds, onProgress: logProgress })
  break
}
case "all": {
  if (!apiKey || jobIds.length > 0) fail()
  await runCli({ prepDir, samplesRoot, apiKey, config, onProgress: logProgress })
  break
}
default:
  fail()
}
