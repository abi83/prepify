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
#
# Must exactly match the Authorized redirect URI configured on the Google
# OAuth client. Cloud Run exposes each service under two equivalent domains
# (a hash-based one, e.g. *.a.run.app, and a project-number-based one, e.g.
# *.<project-number>.<region>.run.app) — Google's redirect_uri check is an
# exact string match, so whichever one is registered in Console is the one
# that has to go here.
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
