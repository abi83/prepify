import { parseArgs } from "util"

import { loadCliConfig, resolveCliConfig } from "./config"
import { runCli } from "./root"

const USAGE = `Usage: npm run cli -- <prepDir> [--config-file <file.yml>]
Images are read from <prepDir>/images; jobs, logs and samples are written next to them.
API key: OPENAI_API_KEY (any non-empty value for local endpoints).
Config file: YAML overrides for llm, job, run and target; see src/cli/config.ts.
Unfinished jobs keep the config they were created with — use a fresh <prepDir> to apply new settings.`

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { "config-file": { type: "string" } },
})

const [ prepDir ] = positionals
const apiKey = process.env.OPENAI_API_KEY
if (!prepDir || !apiKey) {
  console.error(USAGE)
  process.exit(1)
}

const configFile = values["config-file"]
await runCli({
  prepDir,
  apiKey,
  config: configFile ? await loadCliConfig(configFile) : resolveCliConfig({}),
  onProgress: progress => console.log(progress.stage === "done" ? "done" : `${progress.stage} ${progress.done}/${progress.total}`),
})
