# Auth.js JWT signing secret — Terraform can generate this itself (unlike the
# Google OAuth credentials below), so there's no manual bootstrap step for it.
resource "random_password" "auth_secret" {
  length  = 64
  special = false
}

resource "google_secret_manager_secret" "auth_secret" {
  project   = google_project.this.project_id
  secret_id = "prepify-auth-secret"

  replication {
    auto {}
  }

  depends_on = [google_project_service.this]
}

resource "google_secret_manager_secret_version" "auth_secret" {
  secret      = google_secret_manager_secret.auth_secret.id
  secret_data = random_password.auth_secret.result
}

resource "google_secret_manager_secret_iam_member" "run_runtime_auth_secret_access" {
  secret_id = google_secret_manager_secret.auth_secret.id
  project   = google_project.this.project_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.run_runtime.email}"
}

# Google OAuth client credentials — unlike the Neon API key, there's no
# provider that can create an OAuth 2.0 client for us, so this is a genuine
# manual step (see terraform/README.md's bootstrap section): create the
# client in Google Cloud Console (APIs & Services > Credentials) with an
# authorized redirect URI of https://<cloud-run-url>/api/auth/callback/google,
# then populate these two secrets by hand the same way as neon-api-key.
# Secret IDs and downstream env var names (AUTH_GOOGLE_CLIENT_ID/_SECRET) are
# kept in lockstep on purpose — see issue #95.
resource "google_secret_manager_secret" "auth_google_client_id" {
  project   = google_project.this.project_id
  secret_id = "auth-google-client-id"

  replication {
    auto {}
  }

  depends_on = [google_project_service.this]
}

resource "google_secret_manager_secret" "auth_google_client_secret" {
  project   = google_project.this.project_id
  secret_id = "auth-google-client-secret"

  replication {
    auto {}
  }

  depends_on = [google_project_service.this]
}

resource "google_secret_manager_secret_iam_member" "run_runtime_auth_google_client_id_access" {
  secret_id = google_secret_manager_secret.auth_google_client_id.id
  project   = google_project.this.project_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.run_runtime.email}"
}

resource "google_secret_manager_secret_iam_member" "run_runtime_auth_google_client_secret_access" {
  secret_id = google_secret_manager_secret.auth_google_client_secret.id
  project   = google_project.this.project_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.run_runtime.email}"
}
