# Read-only identity for the GCS MCP server (#65). Dev only: gated on
# local_dev_email, which is null in prod. Bucket-level grants only — no
# project-level storage role, so it can't list or read other buckets.
resource "google_service_account" "gcs_reader" {
  count = var.local_dev_email != null ? 1 : 0

  project      = google_project.this.project_id
  account_id   = "claude-gcs-reader"
  display_name = "Claude GCS reader (storage MCP)"
}

locals {
  gcs_reader_buckets = var.local_dev_email != null ? {
    uploads = google_storage_bucket.this.name
    samples = google_storage_bucket.samples.name
  } : {}
}

resource "google_storage_bucket_iam_member" "gcs_reader_objects" {
  for_each = local.gcs_reader_buckets

  bucket = each.value
  role   = "roles/storage.objectViewer"
  member = "serviceAccount:${google_service_account.gcs_reader[0].email}"
}

# storage.buckets.get, for the get_bucket_metadata tool.
resource "google_storage_bucket_iam_member" "gcs_reader_bucket" {
  for_each = local.gcs_reader_buckets

  bucket = each.value
  role   = "roles/storage.legacyBucketReader"
  member = "serviceAccount:${google_service_account.gcs_reader[0].email}"
}

# Impersonation instead of a key file — see local_dev_act_as_runtime.
resource "google_service_account_iam_member" "local_dev_act_as_gcs_reader" {
  count = var.local_dev_email != null ? 1 : 0

  service_account_id = google_service_account.gcs_reader[0].name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = "user:${var.local_dev_email}"
}
