terraform {
  required_version = ">= 1.9.0"

  # Require an operator-supplied remote S3 backend config at terraform init.
  # No local-state fallback is intended for this deployment root.
  backend "s3" {}

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.90"
    }
  }
}

provider "aws" {
  region              = var.aws_region
  allowed_account_ids = [var.aws_account_id]
}
