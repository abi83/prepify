# Grants to the two shared CI identities (defined in ../../shared), scoped
# to just this environment's project.

resource "google_project_iam_member" "github_deploy_run_admin" {
  project = google_project.this.project_id
  role    = "roles/run.admin"
  member  = "serviceAccount:${var.github_deploy_service_account_email}"
}

# Lets the deploy identity attach the runtime service account to a new Cloud
# Run revision — required by Cloud Run deploys, separate from run.admin.
resource "google_service_account_iam_member" "github_deploy_act_as_runtime" {
  service_account_id = google_service_account.run_runtime.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${var.github_deploy_service_account_email}"
}

# terraform-ci needs project-level Owner to manage everything this module
# defines (project metadata, IAM, buckets, Cloud Run, Neon/Secret Manager
# wiring) — no predefined role covers exactly that short of Owner.
resource "google_project_iam_member" "terraform_ci_owner" {
  project = google_project.this.project_id
  role    = "roles/owner"
  member  = "serviceAccount:${var.terraform_ci_service_account_email}"
}
