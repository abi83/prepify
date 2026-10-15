import { readFile } from "fs/promises"
import path from "path"

import { parse } from "yaml"

import { parseModelCatalog, type ModelCatalog } from "./modelCatalog"

const CATALOG_FILE = path.join(process.cwd(), "config", "models.yml")

/** Reads and validates a catalog file; node-only. A missing or invalid file throws. */
export async function readModelCatalog(file: string): Promise<ModelCatalog> {
  return parseModelCatalog(parse(await readFile(file, "utf-8")))
}

let loaded: Promise<ModelCatalog> | undefined

/** `config/models.yml`, read once per process. */
export function loadModelCatalog(): Promise<ModelCatalog> {
  loaded ??= readModelCatalog(CATALOG_FILE)
  return loaded
}
