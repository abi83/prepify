# Prepify infra (Terraform)

Provisions the infra decided in the wiki's ADR-Hosting-and-Backend page (Cloud Run + Neon + GCS), for `dev` and `prod`.

## Layout

Three independent root configs, each with its own state — a change to dev never puts prod in the same plan/apply, and vice versa:

- **`shared/`** — the `prepify-infra` project: Artifact Registry, the GitHub Actions Workload Identity Federation pool, and the two CI service accounts (`github-deploy`, `terraform-ci`). Changes rarely; auto-applies on merge.
- **`envs/dev/`**, **`envs/prod/`** — thin roots that call `modules/environment` with per-environment values (project ID, environment name). All the actual per-environment resources (Cloud Run, storage, Neon project, DB secret) live in the module, so dev and prod can never drift out of sync in shape — only in the values passed in.
- **`modules/environment/`** — not a standalone root; has no backend of its own, just resource definitions reused by both env roots.

State for all three lives in the same `gs://prepify-tfstate` bucket, under different prefixes (`terraform/state/{shared,dev,prod}`).

## One-time manual bootstrap

1. GCP projects: `gcloud projects create` + `gcloud billing projects link`, then imported.
2. State bucket `gs://prepify-tfstate`: created by hand.
3. Secret values with no `_secret_version` resource need setting by hand:
   ```bash
   read -s -p "Neon API key: " NEON_KEY && printf '%s' "$NEON_KEY" | gcloud secrets versions add neon-api-key --project=prepify-infra --data-file=-
   ```
   Google OAuth client — create by hand in Google Cloud Console first (APIs & Services → Credentials → OAuth client ID → Web application, redirect URI `https://<cloud-run-url>/api/auth/callback/google`), then per environment:
   ```bash
   read -s -p "Google OAuth client ID: " GOOGLE_ID && printf '%s' "$GOOGLE_ID" | gcloud secrets versions add auth-google-client-id --project=<env-project> --data-file=-
   read -s -p "Google OAuth client secret: " GOOGLE_SECRET && printf '%s' "$GOOGLE_SECRET" | gcloud secrets versions add auth-google-client-secret --project=<env-project> --data-file=-
   ```
   Personal dev-only Neon API key — mint project-scoped to dev in the Neon Console or `neon api-keys create --project-id <id>` (needs org Admin), then:
   ```bash
   read -s -p "Neon dev-scoped API key: " NEON_KEY && printf '%s' "$NEON_KEY" | gcloud secrets versions add neon-dev-api-key --project=prepify-dev-vk --data-file=-
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

Two Neon projects (`prepify-dev`, `prepify-prod`), one per environment root, managed via the Neon Terraform provider (see `modules/environment/neon.tf`). Connection strings live in per-environment Secret Manager entries (`database-url-direct` / `database-url-pooling`), readable only by that environment's Cloud Run runtime service account — never a plain Cloud Run env var. The Neon account-level API key (management-plane, not scoped to one database) is readable only by `terraform-ci`, deliberately not granted to the runtime service accounts.
