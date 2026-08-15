resource "google_service_account" "run_runtime" {
  for_each = var.environments

  project      = google_project.env[each.key].project_id
  account_id   = "prepify-run-runtime"
  display_name = "Prepify Cloud Run runtime (${each.key})"
}

resource "google_storage_bucket_iam_member" "run_runtime_storage_access" {
  for_each = var.environments

  bucket = google_storage_bucket.storage[each.key].name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.run_runtime[each.key].email}"
}

# TODO(#54): replace the placeholder image below once the deploy pipeline
# exists. `ignore_changes` keeps Terraform from fighting that pipeline over
# the image field once it starts deploying real ones.
resource "google_cloud_run_v2_service" "app" {
  for_each = var.environments

  project  = google_project.env[each.key].project_id
  name     = "prepify"
  location = var.region

  deletion_protection = false

  template {
    service_account = google_service_account.run_runtime[each.key].email

    scaling {
      min_instance_count = 0
      max_instance_count = 2
    }

    containers {
      image = "us-docker.pkg.dev/cloudrun/container/hello"
    }
  }

  # NOTE: `terraform plan` will perpetually show a no-op diff on
  # template.scaling (manual_instance_count/min_instance_count flipping
  # between 0 and null) — a known google provider quirk with Cloud Run v2's
  # automatic scaling mode, not real drift. ignore_changes doesn't suppress
  # it (nested-block diffs at this depth aren't ignorable), so it's just
  # noise to expect in every plan/apply, not a bug in this config.
  lifecycle {
    ignore_changes = [template[0].containers[0].image]
  }

  depends_on = [google_project_service.env]
}

resource "google_cloud_run_v2_service_iam_member" "public_invoker" {
  for_each = var.environments

  project  = google_project.env[each.key].project_id
  location = var.region
  name     = google_cloud_run_v2_service.app[each.key].name
  role     = "roles/run.invoker"
  member   = "allUsers"
}
