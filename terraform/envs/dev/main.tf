module "env" {
  source = "../../modules/environment"

  environment        = "dev"
  project_id         = "prepify-dev-vk"
  billing_account_id = "01391C-52E7D4-1CC4C8"
  auth_url           = "https://prepify-2bnxvcrxkq-uc.a.run.app"
}
