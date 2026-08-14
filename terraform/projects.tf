# Projects are created here so Terraform is authoritative, but they were
# provisioned once by hand (`gcloud projects create` + billing link) and
# imported into state — see README.md. GCP project deletion is a 30-day
# soft-delete, so `prevent_destroy` guards against an accidental
# `terraform destroy` making the project ID unusable for a month.

resource "google_project" "infra" {
  project_id      = var.infra_project_id
  name            = "Prepify Infra"
  billing_account = var.billing_account_id

  lifecycle {
    prevent_destroy = true
  }
}

resource "google_project" "env" {
  for_each = var.environments

  project_id      = each.value.project_id
  name            = "Prepify ${title(each.key)}"
  billing_account = var.billing_account_id

  lifecycle {
    prevent_destroy = true
  }
}

locals {
  apis = [
    "run.googleapis.com",
    "artifactregistry.googleapis.com",
    "storage.googleapis.com",
    "iam.googleapis.com",
    "iamcredentials.googleapis.com",
    "cloudresourcemanager.googleapis.com",
  ]
}

resource "google_project_service" "infra" {
  for_each = toset(local.apis)

  project = google_project.infra.project_id
  service = each.value

  disable_on_destroy = false
}

resource "google_project_service" "env" {
  for_each = { for pair in setproduct(keys(var.environments), local.apis) : "${pair[0]}.${pair[1]}" => {
    env     = pair[0]
    service = pair[1]
  } }

  project = google_project.env[each.value.env].project_id
  service = each.value.service

  disable_on_destroy = false
}
