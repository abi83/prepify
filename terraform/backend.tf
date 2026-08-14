terraform {
  required_version = ">= 1.9"

  backend "gcs" {
    bucket = "prepify-tfstate"
    prefix = "terraform/state"
  }

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
  }
}
