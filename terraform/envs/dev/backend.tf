terraform {
  required_version = ">= 1.9"

  backend "gcs" {
    bucket = "prepify-tfstate"
    prefix = "terraform/state/dev"
  }

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
    neon = {
      source  = "kislerdm/neon"
      version = "~> 0.13"
    }
  }
}
