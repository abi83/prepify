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

  depends_on = [google_project_service.this]
}
