provider "google" {
  region = "us-central1"
}

provider "neon" {
  api_key = var.neon_api_key
}
