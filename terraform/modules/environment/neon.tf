# Free tier quota (storage, compute-hours) is per-project, so two projects
# (one per environment) gets a larger combined free allowance than one
# project split into dev/prod branches.
resource "neon_project" "this" {
  name      = "prepify-${var.environment}"
  region_id = "aws-us-east-2"

  # Free-tier plan caps point-in-time-restore retention at 6h; the
  # provider's own default (24h) exceeds that and the API rejects it.
  history_retention_seconds = 21600
}

# Stored in Secret Manager (not passed as a plain env var) so the
# connection string never appears in Cloud Run's revision config, which is
# otherwise readable by anyone with run.viewer on the project.
#
# Direct (unpooled) connection — used for running Prisma migrations, which
# need session-level locking the pooler doesn't support. Not granted to the
# Cloud Run runtime service account; migrations run out-of-band, not at
# request time.
resource "google_secret_manager_secret" "db_url" {
  project   = google_project.this.project_id
  secret_id = "prepify-db-url"

  replication {
    auto {}
  }

  depends_on = [google_project_service.this]
}

resource "google_secret_manager_secret_version" "db_url" {
  secret      = google_secret_manager_secret.db_url.id
  secret_data = neon_project.this.connection_uri
}

# Pooled connection — what the app actually connects with at runtime.
resource "google_secret_manager_secret" "db_url_pooled" {
  project   = google_project.this.project_id
  secret_id = "prepify-db-url-pooled"

  replication {
    auto {}
  }

  depends_on = [google_project_service.this]
}

resource "google_secret_manager_secret_version" "db_url_pooled" {
  secret      = google_secret_manager_secret.db_url_pooled.id
  secret_data = neon_project.this.connection_uri_pooler
}

resource "google_secret_manager_secret_iam_member" "run_runtime_db_url_pooled_access" {
  secret_id = google_secret_manager_secret.db_url_pooled.id
  project   = google_project.this.project_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.run_runtime.email}"
}
