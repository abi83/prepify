import { execFileSync } from "child_process"
import { parseArgs } from "util"

import { OpenAiLlm } from "@/lib/llm/openAiLlm"
import { createLogger } from "@/lib/logger/core"

import { createDiskResultSink, createDiskSampleSource } from "./diskAdapters"
import { loadExperiment } from "./experiment"
import { formatSummary } from "./format"
import { runExperiment } from "./run"

const USAGE = `Usage:
  npm run evals -- run <experiment.yml>
      Judge every sample of the experiment's cell and write results under its outputDir.
API key: OPENAI_API_KEY (any non-empty value for local endpoints).`

function fail(): never {
  console.error(USAGE)
  process.exit(1)
}

const { positionals } = parseArgs({ allowPositionals: true, options: {} })
const [ command, file ] = positionals
const apiKey = process.env.OPENAI_API_KEY
if (command !== "run" || !file || positionals.length > 2 || !apiKey) fail()

const experiment = await loadExperiment(file)
const summary = await runExperiment(experiment, {
  source: createDiskSampleSource(experiment.samplesDir),
  sink: createDiskResultSink(experiment.outputDir),
  llm: new OpenAiLlm({ apiKey, baseUrl: experiment.judge.llm.baseUrl }),
  logger: createLogger({ transport: line => process.stderr.write(line + "\n"), minLevel: "info" }),
  gitSha: execFileSync("git", [ "rev-parse", "HEAD" ], { encoding: "utf-8" }).trim(),
})
console.log(formatSummary(summary))
