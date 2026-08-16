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
