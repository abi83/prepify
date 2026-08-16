variable "billing_account_id" {
  type    = string
  default = "01391C-52E7D4-1CC4C8"
}

variable "region" {
  type    = string
  default = "us-central1"
}

variable "infra_project_id" {
  type    = string
  default = "prepify-infra"
}

variable "github_repo" {
  description = "GitHub repo (owner/name) allowed to assume the CI identities"
  type        = string
  default     = "abi83/prepify"
}

# Must match terraform/envs/dev/main.tf and terraform/envs/prod/main.tf's
# project_id values — needed here so Cloud Run in each environment can be
# granted read access to this project's Artifact Registry repo.
variable "dev_project_id" {
  type    = string
  default = "prepify-dev-vk"
}

variable "prod_project_id" {
  type    = string
  default = "prepify-prod"
}
