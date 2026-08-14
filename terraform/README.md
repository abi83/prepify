# Prepify infra (Terraform)

Provisions the infra decided in the wiki's ADR-Hosting-and-Backend page (Cloud Run + Neon + GCS), for `dev` and `prod`.

## One-time manual bootstrap

Two things exist outside this config on purpose, to break the chicken-and-egg
problem of Terraform needing somewhere to put its own state before anything
exists yet:

1. The three GCP projects (`prepify-infra`, `prepify-dev-vk`, `prepify-prod`) were created with `gcloud projects create` + `gcloud billing projects link`, then imported into this config (see `google_project.infra` / `google_project.env` in [projects.tf](projects.tf)). Terraform owns them from here on.
2. The state bucket itself (`gs://prepify-tfstate`, in `prepify-infra`) was created by hand and is **not** managed by this config — a bucket can't manage the state file that describes itself.

## Usage

```bash
cd terraform
terraform init
terraform plan
terraform apply
```

Requires `gcloud auth application-default login` (or a service account key via `GOOGLE_APPLICATION_CREDENTIALS`) with owner/editor access on the billing account.

## Neon (Postgres)

Not yet in this config — pending a Neon account/API key. Once that exists, two Neon projects (dev/prod) will be added here via the Neon Terraform provider.
