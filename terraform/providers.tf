provider "google" {
  region = var.region
}

provider "neon" {
  api_key = var.neon_api_key
}
