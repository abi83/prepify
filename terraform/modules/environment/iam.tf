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

locals {
  terraform_ci_env_roles = [
    "roles/resourcemanager.projectIamAdmin",
    "roles/serviceusage.serviceUsageAdmin",
    "roles/iam.serviceAccountAdmin",
    "roles/storage.admin",
    "roles/run.admin",
    "roles/secretmanager.admin",
  ]
}

resource "google_project_iam_member" "terraform_ci" {
  for_each = toset(local.terraform_ci_env_roles)

  project = google_project.this.project_id
  role    = each.value
  member  = "serviceAccount:${var.terraform_ci_service_account_email}"
}

resource "google_storage_bucket_iam_member" "runtime_uploads_admin" {
  bucket = google_storage_bucket.this.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.run_runtime.email}"
}

# Allows storage.buckets.get — needed for bucket.exists() in the readyz probe.
resource "google_storage_bucket_iam_member" "runtime_bucket_reader" {
  bucket = google_storage_bucket.this.name
  role   = "roles/storage.legacyBucketReader"
  member = "serviceAccount:${google_service_account.run_runtime.email}"
}

# Allows the Cloud Run SA to call signBlob on itself — required for ADC-based
# signed URL generation without a key file.
resource "google_service_account_iam_member" "run_runtime_sign_blobs" {
  service_account_id = google_service_account.run_runtime.name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = "serviceAccount:${google_service_account.run_runtime.email}"
}
