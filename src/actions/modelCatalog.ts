"use server"

import { requireUserId } from "@/lib/currentUser"
import type { ModelCatalog } from "@/lib/modelCatalog"
import { loadModelCatalog } from "@/lib/modelCatalogFile"

/** The model whitelist and prices, for the browser: model pickers and client-side runs. */
export async function getModelCatalog(): Promise<ModelCatalog> {
  await requireUserId()
  return loadModelCatalog()
}
