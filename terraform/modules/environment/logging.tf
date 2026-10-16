# `_Default` is created by GCP with the project; this takes it over so the
# retention we debug against is explicit rather than a provider-side default.
resource "google_logging_project_bucket_config" "default" {
  project        = google_project.this.project_id
  location       = "global"
  bucket_id      = "_Default"
  retention_days = 30

  depends_on = [google_project_service.this]
}
