# Prepify infra (Terraform)

Provisions the infra decided in the wiki's ADR-Hosting-and-Backend page (Cloud Run + Neon + GCS), for `dev` and `prod`.

## One-time manual bootstrap

Two things exist outside this config on purpose, to break the chicken-and-egg
problem of Terraform needing somewhere to put its own state before anything
exists yet:

1. The three GCP projects (`prepify-infra`, `prepify-dev-vk`, `prepify-prod`) were created with `gcloud projects create` + `gcloud billing projects link`, then imported into this config (see `google_project.infra` / `google_project.env` in [projects.tf](projects.tf)). Terraform owns them from here on.
2. The state bucket itself (`gs://prepify-tfstate`, in `prepify-infra`) was created by hand and is **not** managed by this config — a bucket can't manage the state file that describes itself.
3. The Neon API key's *value* — Terraform manages the Secret Manager container (`google_secret_manager_secret.neon_api_key` in [neon.tf](neon.tf)), but can't populate its own bootstrap credential. Set/rotate it with:
   ```bash
   read -s -p "Neon API key: " NEON_KEY && printf '%s' "$NEON_KEY" | gcloud secrets versions add neon-api-key --project=prepify-infra --data-file=-
   ```

## Usage

```bash
cd terraform
export TF_VAR_neon_api_key=$(gcloud secrets versions access latest --secret=neon-api-key --project=prepify-infra)
terraform init
terraform plan
terraform apply
```

Requires `gcloud auth application-default login` (or a service account key via `GOOGLE_APPLICATION_CREDENTIALS`) with owner/editor access on the billing account, and `roles/secretmanager.secretAccessor` on `neon-api-key` (already covered by Owner).

CI (`.github/workflows/terraform.yml`) fetches the same secret via its WIF identity — there's no `NEON_API_KEY` GitHub secret, and no local `.tfvars` file; the Secret Manager entry is the single source of truth for both.

## Neon (Postgres)

Two Neon projects (`prepify-dev`, `prepify-prod`) managed via the Neon Terraform provider (see [neon.tf](neon.tf)). Connection strings live in per-environment Secret Manager entries (`prepify-db-url`), readable only by that environment's Cloud Run runtime service account — never a plain Cloud Run env var. The Neon account-level API key (management-plane, not scoped to one database) is readable only by `terraform-ci`, deliberately not granted to the runtime service accounts.
