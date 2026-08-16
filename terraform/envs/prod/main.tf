module "env" {
  source = "../../modules/environment"

  environment        = "prod"
  project_id         = "prepify-prod"
  billing_account_id = "01391C-52E7D4-1CC4C8"
}
