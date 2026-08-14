variable "billing_account_id" {
  description = "GCP billing account ID linked to all Prepify projects"
  type        = string
  default     = "01391C-52E7D4-1CC4C8"
}

variable "region" {
  description = "GCP region used for all regional resources"
  type        = string
  default     = "us-central1"
}

variable "infra_project_id" {
  description = "Shared project holding Artifact Registry, CI identity, and Terraform state"
  type        = string
  default     = "prepify-infra"
}

variable "github_repo" {
  description = "GitHub repo (owner/name) allowed to assume the CI deploy identity"
  type        = string
  default     = "abi83/prepify"
}

variable "neon_api_key" {
  description = "Neon account-level API key, used only by the neon provider to create/manage projects"
  type        = string
  sensitive   = true
}

variable "environments" {
  description = "Per-environment GCP project IDs"
  type = map(object({
    project_id = string
  }))
  default = {
    dev = {
      project_id = "prepify-dev-vk"
    }
    prod = {
      project_id = "prepify-prod"
    }
  }
}
