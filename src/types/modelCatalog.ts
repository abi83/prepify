export interface CatalogTier {
  label: string
  multiplier: number
}

export interface ModelRate {
  input: number
  cachedInput: number
  output: number
}

export interface CatalogModel extends ModelRate {
  id: string
  label: string
  provider: string
  tiers: Record<string, CatalogTier>
}

/** Whitelisted models by id; every model carries its provider's tiers. */
export interface ModelCatalog {
  models: Record<string, CatalogModel>
}
