# Single shared repo for both environments' container images — Artifact
# Registry pricing is storage-based, not per-repo, so splitting this per
# environment would add IAM surface without saving anything.
resource "google_artifact_registry_repository" "images" {
  project       = google_project.infra.project_id
  location      = var.region
  repository_id = "prepify"
  format        = "DOCKER"

  depends_on = [google_project_service.infra]
}
