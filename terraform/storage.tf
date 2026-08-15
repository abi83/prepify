# Bucket names are prefixed with the (globally-unique) project ID so they
# don't collide with buckets anyone else on GCS has already claimed.
# One generic bucket per environment, not one per content type — the app
# manages its own key prefixes (photos/, audio/, ...) inside it, so adding
# a new upload type never means provisioning a new bucket + IAM set.
resource "google_storage_bucket" "storage" {
  for_each = var.environments

  project                     = google_project.env[each.key].project_id
  name                        = "${each.value.project_id}-storage"
  location                    = var.region
  uniform_bucket_level_access = true
  force_destroy               = false

  depends_on = [google_project_service.env]
}
