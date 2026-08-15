# Prepify infra (Terraform)

Provisions the infra decided in the wiki's ADR-Hosting-and-Backend page (Cloud Run + Neon + GCS), for `dev` and `prod`.

## Layout

Three independent root configs, each with its own state — a change to dev never puts prod in the same plan/apply, and vice versa:

- **`shared/`** — the `prepify-infra` project: Artifact Registry, the GitHub Actions Workload Identity Federation pool, and the two CI service accounts (`github-deploy`, `terraform-ci`). Changes rarely; auto-applies on merge.
- **`envs/dev/`**, **`envs/prod/`** — thin roots that call `modules/environment` with per-environment values (project ID, environment name). All the actual per-environment resources (Cloud Run, storage, Neon project, DB secret) live in the module, so dev and prod can never drift out of sync in shape — only in the values passed in.
- **`modules/environment/`** — not a standalone root; has no backend of its own, just resource definitions reused by both env roots.

State for all three lives in the same `gs://prepify-tfstate` bucket, under different prefixes (`terraform/state/{shared,dev,prod}`).

## One-time manual bootstrap

Three things exist outside this config on purpose, to break the chicken-and-egg problem of Terraform needing somewhere to put its own state before anything exists yet:

1. The three GCP projects (`prepify-infra`, `prepify-dev-vk`, `prepify-prod`) were created with `gcloud projects create` + `gcloud billing projects link`, then imported into `shared/projects.tf` and each env's `modules/environment/projects.tf` instance. Terraform owns them from here on.
2. The state bucket itself (`gs://prepify-tfstate`, in `prepify-infra`) was created by hand and is **not** managed by this config — a bucket can't manage the state file that describes itself.
3. The Neon API key's *value* — Terraform manages the Secret Manager container (`google_secret_manager_secret.neon_api_key` in [shared/secrets.tf](shared/secrets.tf)), but can't populate its own bootstrap credential. Set/rotate it with:
   ```bash
   read -s -p "Neon API key: " NEON_KEY && printf '%s' "$NEON_KEY" | gcloud secrets versions add neon-api-key --project=prepify-infra --data-file=-
   ```

## Usage

Run each root separately — `shared` first if it's your very first apply (dev/prod's CI identity grants depend on `terraform-ci` existing), otherwise order doesn't matter day-to-day:

```bash
cd terraform/shared        # or terraform/envs/dev, terraform/envs/prod
export TF_VAR_neon_api_key=$(gcloud secrets versions access latest --secret=neon-api-key --project=prepify-infra)  # dev/prod only, shared doesn't need it
terraform init
terraform plan
terraform apply
```

Requires `gcloud auth application-default login` (or a service account key via `GOOGLE_APPLICATION_CREDENTIALS`) with owner/editor access on the billing account, and `roles/secretmanager.secretAccessor` on `neon-api-key` (already covered by Owner).

CI (`.github/workflows/terraform.yml`) runs six jobs — plan+apply for each of `shared`/`dev`/`prod` — fetching the Neon key via its WIF identity where needed. There's no `NEON_API_KEY` GitHub secret and no local `.tfvars` file; the Secret Manager entry is the single source of truth for both. `apply-shared` and `apply-dev` run automatically on merge to `main`; `apply-prod` requires manual approval via the `prod` GitHub Environment's required-reviewer rule (repo Settings → Environments → prod).

## Neon (Postgres)

Two Neon projects (`prepify-dev`, `prepify-prod`), one per environment root, managed via the Neon Terraform provider (see `modules/environment/neon.tf`). Connection strings live in per-environment Secret Manager entries (`prepify-db-url`), readable only by that environment's Cloud Run runtime service account — never a plain Cloud Run env var. The Neon account-level API key (management-plane, not scoped to one database) is readable only by `terraform-ci`, deliberately not granted to the runtime service accounts.
