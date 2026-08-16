# Provisioned here so Terraform is authoritative, but the underlying project
# was created once by hand and imported — see README.md. GCP project deletion
# is a 30-day soft-delete, so `prevent_destroy` guards against an accidental
# `terraform destroy` making the project ID unusable for a month.
resource "google_project" "infra" {
  project_id      = var.infra_project_id
  name            = "Prepify Infra"
  billing_account = var.billing_account_id

  lifecycle {
    prevent_destroy = true
  }
}

module "apis" {
  source = "../modules/apis"
}

resource "google_project_service" "infra" {
  for_each = toset(module.apis.list)

  project = google_project.infra.project_id
  service = each.value

  disable_on_destroy = false
}
