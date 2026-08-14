# Free tier quota (storage, compute-hours) is per-project, so two projects
# gets a larger combined free allowance than one project split into
# dev/prod branches — see the AskUserQuestion decision this mirrors.
resource "neon_project" "env" {
  for_each = var.environments

  name      = "prepify-${each.key}"
  region_id = "aws-us-east-2"

  # Free-tier plan caps point-in-time-restore retention at 6h; the
  # provider's own default (24h) exceeds that and the API rejects it.
  history_retention_seconds = 21600
}

# Stored in Secret Manager (not passed as a plain env var) so the
# connection string never appears in Cloud Run's revision config, which is
# otherwise readable by anyone with run.viewer on the project.
resource "google_project_service" "secretmanager" {
  for_each = var.environments

  project = google_project.env[each.key].project_id
  service = "secretmanager.googleapis.com"
}

resource "google_secret_manager_secret" "db_url" {
  for_each = var.environments

  project   = google_project.env[each.key].project_id
  secret_id = "prepify-db-url"

  replication {
    auto {}
  }

  depends_on = [google_project_service.secretmanager]
}

resource "google_secret_manager_secret_version" "db_url" {
  for_each = var.environments

  secret      = google_secret_manager_secret.db_url[each.key].id
  secret_data = neon_project.env[each.key].connection_uri
}

resource "google_secret_manager_secret_iam_member" "run_runtime_db_url_access" {
  for_each = var.environments

  secret_id = google_secret_manager_secret.db_url[each.key].id
  project   = google_project.env[each.key].project_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.run_runtime[each.key].email}"
}
