# Lets GitHub Actions authenticate to GCP via short-lived tokens (OIDC),
# instead of a long-lived service account JSON key sitting in a GitHub secret.
resource "google_iam_workload_identity_pool" "github" {
  project                   = google_project.infra.project_id
  workload_identity_pool_id = "github-actions"
  display_name              = "GitHub Actions"

  depends_on = [google_project_service.infra]
}

resource "google_iam_workload_identity_pool_provider" "github" {
  project                            = google_project.infra.project_id
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github"
  display_name                       = "GitHub"

  attribute_mapping = {
    "google.subject"       = "assertion.sub"
    "attribute.repository" = "assertion.repository"
  }

  # Restricts token exchange to this exact repo — any other repo's Actions
  # runs cannot mint tokens for this identity even if they discover the pool.
  attribute_condition = "assertion.repository == \"${var.github_repo}\""

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

resource "google_service_account" "github_deploy" {
  project      = google_project.infra.project_id
  account_id   = "github-deploy"
  display_name = "GitHub Actions deploy identity"
}

resource "google_service_account_iam_member" "github_deploy_wif_binding" {
  service_account_id = google_service_account.github_deploy.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository/${var.github_repo}"
}

resource "google_artifact_registry_repository_iam_member" "github_deploy_push" {
  project    = google_project.infra.project_id
  location   = google_artifact_registry_repository.images.location
  repository = google_artifact_registry_repository.images.repository_id
  role       = "roles/artifactregistry.writer"
  member     = "serviceAccount:${google_service_account.github_deploy.email}"
}

# Separate, more privileged identity for the terraform.yml workflow.
# github-deploy above is deliberately narrow (Cloud Run + registry only) for
# routine app deploys; running `terraform apply` against dev/prod also
# touches project metadata and IAM bindings there, which needs project-level
# Owner — there's no predefined role that covers exactly "manage this
# Terraform config" short of that. Kept as its own service account so the
# app-deploy identity never needs this much power.
resource "google_service_account" "terraform_ci" {
  project      = google_project.infra.project_id
  account_id   = "terraform-ci"
  display_name = "GitHub Actions terraform apply identity"
}

resource "google_service_account_iam_member" "terraform_ci_wif_binding" {
  service_account_id = google_service_account.terraform_ci.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository/${var.github_repo}"
}

resource "google_project_iam_member" "terraform_ci_owner_infra" {
  project = google_project.infra.project_id
  role    = "roles/owner"
  member  = "serviceAccount:${google_service_account.terraform_ci.email}"
}
