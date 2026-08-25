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

# Direct (unpooled) connection, for running migrations — not granted to
# the Cloud Run runtime service account, only github-deploy (below).
# Secret ID and downstream env var name (DATABASE_URL_DIRECT) are kept in
# lockstep on purpose — see issue #95.
resource "google_secret_manager_secret" "db_url_direct" {
  project   = google_project.this.project_id
  secret_id = "database-url-direct"

  replication {
    auto {}
  }

  depends_on = [google_project_service.this]
}

resource "google_secret_manager_secret_version" "db_url_direct" {
  secret      = google_secret_manager_secret.db_url_direct.id
  secret_data = neon_project.this.connection_uri
}

# Needed for CI to run `prisma migrate deploy` (deploy.yml).
resource "google_secret_manager_secret_iam_member" "github_deploy_db_url_direct_access" {
  secret_id = google_secret_manager_secret.db_url_direct.id
  project   = google_project.this.project_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${var.github_deploy_service_account_email}"
}

# Pooled connection — what the app actually connects with at runtime.
resource "google_secret_manager_secret" "db_url_pooling" {
  project   = google_project.this.project_id
  secret_id = "database-url-pooling"

  replication {
    auto {}
  }

  depends_on = [google_project_service.this]
}

resource "google_secret_manager_secret_version" "db_url_pooling" {
  secret      = google_secret_manager_secret.db_url_pooling.id
  secret_data = neon_project.this.connection_uri_pooler
}

resource "google_secret_manager_secret_iam_member" "run_runtime_db_url_pooling_access" {
  secret_id = google_secret_manager_secret.db_url_pooling.id
  project   = google_project.this.project_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.run_runtime.email}"
}
