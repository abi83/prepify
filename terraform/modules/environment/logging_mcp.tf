# Read-only identity for the Cloud Logging MCP server (#65). Dev only: gated
# on local_dev_email, which is null in prod.
resource "google_service_account" "logs_reader" {
  count = var.local_dev_email != null ? 1 : 0

  project      = google_project.this.project_id
  account_id   = "claude-logs-reader"
  display_name = "Claude logs reader (Cloud Logging MCP)"
}

resource "google_project_iam_member" "logs_reader" {
  for_each = var.local_dev_email != null ? toset(["roles/mcp.toolUser", "roles/logging.viewer"]) : toset([])

  project = google_project.this.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.logs_reader[0].email}"
}

# Impersonation instead of a key file — see local_dev_act_as_runtime.
resource "google_service_account_iam_member" "local_dev_act_as_logs_reader" {
  count = var.local_dev_email != null ? 1 : 0

  service_account_id = google_service_account.logs_reader[0].name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = "user:${var.local_dev_email}"
}
