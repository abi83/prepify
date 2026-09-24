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

  retention_policy {
    retention_period = 94608000 # 3 years
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
