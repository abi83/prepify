variable "environment" {
  description = "dev or prod"
  type        = string
}

variable "project_id" {
  type = string
}

variable "region" {
  type    = string
  default = "us-central1"
}

# Next.js standalone mode sets HOSTNAME=0.0.0.0 for its own bind address, and
# Auth.js's host inference picks that up instead of the request's real host
# even with trustHost: true (a known upstream issue, not fixable via request
# headers) — so the public URL has to be supplied explicitly instead.
variable "auth_url" {
  type = string
}

variable "billing_account_id" {
  type = string
}

# Deterministic — account_id and infra project are fixed, so no cross-state
# reference to the shared root is needed to know these. Values must match
# the service accounts terraform/shared/github_actions.tf creates; a rename
# there needs a matching update to these defaults.
variable "github_deploy_service_account_email" {
  type    = string
  default = "github-deploy@prepify-infra.iam.gserviceaccount.com"
}

variable "terraform_ci_service_account_email" {
  type    = string
  default = "terraform-ci@prepify-infra.iam.gserviceaccount.com"
}
