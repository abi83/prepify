output "cloud_run_url" {
  value = google_cloud_run_v2_service.app.uri
}

output "storage_bucket" {
  value = google_storage_bucket.this.name
}

output "neon_project_id" {
  value = neon_project.this.id
}
