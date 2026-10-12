import { parseArgs } from "util"

import { DEFAULT_GEN_CONFIG } from "@/lib/generationConfig"

import { runCli } from "./root"

const USAGE = `Usage: npm run cli -- <prepDir> [--model <id>] [--base-url <url>] [--questions <n>] [--tier <tier>]
API key: OPENAI_API_KEY (any non-empty value for local endpoints).`

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    model: { type: "string", default: "gpt-5-mini" },
    "base-url": { type: "string" },
    questions: { type: "string" },
    tier: { type: "string", default: "default" },
  },
})

const [ prepDir ] = positionals
const apiKey = process.env.OPENAI_API_KEY
if (!prepDir || !apiKey) {
  console.error(USAGE)
  process.exit(1)
}

await runCli({
  prepDir,
  model: values.model,
  tier: values.tier,
  apiKey,
  baseUrl: values["base-url"],
  target: { ...DEFAULT_GEN_CONFIG, questionCount: values.questions ? Number(values.questions) : DEFAULT_GEN_CONFIG.questionCount },
  onProgress: progress => console.log(progress.stage === "done" ? "done" : `${progress.stage} ${progress.done}/${progress.total}`),
})
