# Bucket names are prefixed with the (globally-unique) project ID so they
# don't collide with buckets anyone else on GCS has already claimed.
resource "google_storage_bucket" "photos" {
  for_each = var.environments

  project                     = google_project.env[each.key].project_id
  name                        = "${each.value.project_id}-photos"
  location                    = var.region
  uniform_bucket_level_access = true
  force_destroy               = false

  depends_on = [google_project_service.env]
}
