# One generic bucket, not one per content type — the app manages its own
# key prefixes (photos/, audio/, ...) inside it, so adding a new upload
# type never means provisioning a new bucket + IAM set.
resource "google_storage_bucket" "this" {
  project                     = google_project.this.project_id
  name                        = "${var.project_id}-storage"
  location                    = var.region
  storage_class               = "STANDARD"
  uniform_bucket_level_access = true
  force_destroy               = false

  # Auto-delete, not retain: a retention_policy blocks deletion/overwrite
  # until the object reaches that age, which is the opposite of intent — see #285.
  lifecycle_rule {
    condition {
      age = var.environment == "dev" ? 90 : 1095 # dev: 90 days, prod: 3 years
    }
    action {
      type = "Delete"
    }
  }

  # Recoverable window for accidental delete/overwrite, same in both envs.
  soft_delete_policy {
    retention_duration_seconds = 7776000 # 90 days
  }

  cors {
    origin          = var.environment == "dev" ? [var.auth_url, "http://localhost:3000"] : [var.auth_url]
    method          = ["PUT", "OPTIONS"]
    response_header = ["Content-Type", "x-goog-content-length-range"]
    max_age_seconds = 3600
  }

  depends_on = [google_project_service.this]

  lifecycle {
    prevent_destroy = true
  }
}
