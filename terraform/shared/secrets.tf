# The Neon account-level API key itself (management-plane credential —
# can create/delete any Neon project, not scoped to one database). Readable
# only by terraform-ci — deliberately NOT granted to the Cloud Run runtime
# service accounts, since that's a much bigger blast radius than the
# per-environment DB connection string (see modules/environment/neon.tf).
#
# Bootstrap: this secret's value can't be set by Terraform (the neon
# provider needs the key before it can do anything), so after the first
# `terraform apply` creates the empty secret container, populate it once
# by hand — see README.md.
resource "google_secret_manager_secret" "neon_api_key" {
  project   = google_project.infra.project_id
  secret_id = "neon-api-key"

  replication {
    auto {}
  }

  depends_on = [google_project_service.infra]
}

resource "google_secret_manager_secret_iam_member" "terraform_ci_neon_key_access" {
  secret_id = google_secret_manager_secret.neon_api_key.id
  project   = google_project.infra.project_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.terraform_ci.email}"
}
