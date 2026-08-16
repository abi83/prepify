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

data "google_project" "dev" {
  project_id = var.dev_project_id
}

data "google_project" "prod" {
  project_id = var.prod_project_id
}

# Pulling is done by each project's own Cloud Run Service Agent, not github-deploy.
resource "google_artifact_registry_repository_iam_member" "cloud_run_dev_read" {
  project    = google_project.infra.project_id
  location   = google_artifact_registry_repository.images.location
  repository = google_artifact_registry_repository.images.repository_id
  role       = "roles/artifactregistry.reader"
  member     = "serviceAccount:service-${data.google_project.dev.number}@serverless-robot-prod.iam.gserviceaccount.com"
}

resource "google_artifact_registry_repository_iam_member" "cloud_run_prod_read" {
  project    = google_project.infra.project_id
  location   = google_artifact_registry_repository.images.location
  repository = google_artifact_registry_repository.images.repository_id
  role       = "roles/artifactregistry.reader"
  member     = "serviceAccount:service-${data.google_project.prod.number}@serverless-robot-prod.iam.gserviceaccount.com"
}
