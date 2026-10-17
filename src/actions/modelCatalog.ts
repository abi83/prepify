"use server"

import { requireUserId } from "@/lib/currentUser"
import { loadModelCatalog } from "@/lib/modelCatalogFile"
import type { ModelCatalog } from "@/types/modelCatalog"

/** The model whitelist and prices, for the browser: model pickers and client-side runs. */
export async function getModelCatalog(): Promise<ModelCatalog> {
  await requireUserId()
  return loadModelCatalog()
}
