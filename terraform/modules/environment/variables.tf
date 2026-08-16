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
