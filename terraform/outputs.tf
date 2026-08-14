output "cloud_run_urls" {
  value = { for env, svc in google_cloud_run_v2_service.app : env => svc.uri }
}

output "photo_buckets" {
  value = { for env, b in google_storage_bucket.photos : env => b.name }
}

output "artifact_registry_repo" {
  value = "${var.region}-docker.pkg.dev/${google_project.infra.project_id}/${google_artifact_registry_repository.images.repository_id}"
}

output "github_actions_workload_identity_provider" {
  description = "Value for the `workload_identity_provider` input of google-github-actions/auth"
  value       = google_iam_workload_identity_pool_provider.github.name
}

output "neon_project_ids" {
  value = { for env, p in neon_project.env : env => p.id }
}

output "github_actions_deploy_service_account" {
  description = "For app-deploy workflows (build/push/deploy) once that pipeline exists"
  value       = google_service_account.github_deploy.email
}

output "github_actions_terraform_service_account" {
  description = "For the terraform.yml workflow"
  value       = google_service_account.terraform_ci.email
}
