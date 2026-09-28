module "env" {
  source = "../../modules/environment"

  environment        = "dev"
  project_id         = "prepify-dev-vk"
  billing_account_id = "01391C-52E7D4-1CC4C8"
  auth_url           = "https://prepify-529277275400.us-central1.run.app"
  local_dev_email    = "vkromm@gmail.com"
}

# The binding already existed in GCP (created by hand before this was
# codified — see #251); this brings it under Terraform without a diff.
# Safe to delete once applied.
import {
  to = module.env.google_service_account_iam_member.local_dev_act_as_runtime[0]
  id = "projects/prepify-dev-vk/serviceAccounts/prepify-run-runtime@prepify-dev-vk.iam.gserviceaccount.com roles/iam.serviceAccountTokenCreator user:vkromm@gmail.com"
}
