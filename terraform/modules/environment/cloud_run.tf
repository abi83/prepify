resource "google_service_account" "run_runtime" {
  project      = google_project.this.project_id
  account_id   = "prepify-run-runtime"
  display_name = "Prepify Cloud Run runtime (${var.environment})"

  depends_on = [google_project_service.this]
}

resource "google_storage_bucket_iam_member" "run_runtime_storage_access" {
  bucket = google_storage_bucket.this.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.run_runtime.email}"
}

# The image below is a placeholder — the real image is deployed by
# .github/workflows/deploy.yml. `ignore_changes` keeps Terraform from
# fighting that pipeline over the image field.
resource "google_cloud_run_v2_service" "app" {
  project  = google_project.this.project_id
  name     = "prepify"
  location = var.region

  deletion_protection = false

  template {
    service_account = google_service_account.run_runtime.email

    scaling {
      min_instance_count = 0
      max_instance_count = 2
    }

    containers {
      image = "us-docker.pkg.dev/cloudrun/container/hello"

      env {
        name = "DATABASE_URL"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.db_url_pooled.secret_id
            version = "latest"
          }
        }
      }

      env {
        name = "AUTH_SECRET"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.auth_secret.secret_id
            version = "latest"
          }
        }
      }

      env {
        name = "AUTH_GOOGLE_ID"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.google_client_id.secret_id
            version = "latest"
          }
        }
      }

      env {
        name = "AUTH_GOOGLE_SECRET"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.google_client_secret.secret_id
            version = "latest"
          }
        }
      }
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

  depends_on = [google_project_service.this]
}

resource "google_cloud_run_v2_service_iam_member" "public_invoker" {
  project  = google_project.this.project_id
  location = var.region
  name     = google_cloud_run_v2_service.app.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}
