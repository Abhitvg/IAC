variable "aws_region" {
  type        = string
  description = "AWS deployment region. This deployment is pinned to ap-southeast-2."
  validation {
    condition     = var.aws_region == "ap-southeast-2"
    error_message = "CareerOps production is configured for ap-southeast-2. Change this only through an explicit architecture decision."
  }
}
variable "aws_account_id" {
  type        = string
  description = "12-digit AWS account ID expected for all account-scoped infrastructure dependencies."
  validation {
    condition     = can(regex("^[0-9]{12}$", var.aws_account_id))
    error_message = "aws_account_id must contain exactly 12 digits."
  }
}
variable "project" {
  type    = string
  default = "careerops"
  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,20}$", var.project))
    error_message = "project must be 3-21 lowercase letters, digits, or hyphens."
  }
}
variable "environment" {
  type    = string
  default = "production"
  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "environment must be staging or production."
  }
}
variable "api_allowed_origins" {
  type        = list(string)
  description = "Exact HTTPS browser origins allowed to call the API. Configure per environment; never use wildcard origins."
  default     = []
  validation {
    condition     = length(distinct(var.api_allowed_origins)) == length(var.api_allowed_origins) && alltrue([for origin in var.api_allowed_origins : can(regex("^https://[A-Za-z0-9.-]+(:[0-9]{1,5})?$", origin))])
    error_message = "api_allowed_origins must contain unique exact HTTPS origins without paths, trailing slashes, or wildcards."
  }
}
variable "vpc_id" { type = string }
variable "public_subnet_ids" {
  type = list(string)
  validation {
    condition     = length(var.public_subnet_ids) >= 2
    error_message = "At least two public subnets in separate availability zones are required."
  }
}
variable "private_subnet_ids" {
  type = list(string)
  validation {
    condition     = length(var.private_subnet_ids) >= 2
    error_message = "At least two private application subnets are required."
  }
}
variable "private_route_table_ids" {
  type        = list(string)
  description = "Existing private route table IDs, ordered to match private_subnet_ids."
  validation {
    condition     = length(var.private_route_table_ids) == 2 && length(distinct(var.private_route_table_ids)) == 2
    error_message = "Provide exactly two distinct existing private route table IDs, one for each private subnet."
  }
}
variable "database_subnet_ids" {
  type        = list(string)
  description = "Dedicated database subnet IDs. Must be distinct from application subnets and placed in separate AZs."
  validation {
    condition     = length(var.database_subnet_ids) >= 2 && length(distinct(var.database_subnet_ids)) == length(var.database_subnet_ids)
    error_message = "At least two distinct database subnet IDs are required."
  }
  validation {
    condition = length(setintersection(
      toset(var.database_subnet_ids),
      toset(var.private_subnet_ids)
    )) == 0
    error_message = "Database subnets must not overlap application private subnets. Use dedicated database subnets with isolated route tables."
  }
}
variable "enable_https" {
  type        = bool
  description = "Enable the ALB HTTPS listener. Production must keep this true; staging may disable it for temporary HTTP-only smoke tests."
  default     = true
  validation {
    condition     = var.environment != "production" || var.enable_https
    error_message = "Production deployments must enable HTTPS. HTTP-only mode is restricted to staging."
  }
}
variable "acm_certificate_arn" {
  type        = string
  description = "Optional ACM certificate ARN for HTTPS. Required when enable_https=true."
  default     = null
  nullable    = true
  validation {
    condition = var.acm_certificate_arn == null || can(regex(
      "^arn:aws:acm:ap-southeast-2:${var.aws_account_id}:certificate/[A-Za-z0-9-]+$",
      var.acm_certificate_arn
    ))
    error_message = "When supplied, acm_certificate_arn must be an ACM certificate ARN in ap-southeast-2 and the configured account."
  }
}
variable "kms_key_arn" {
  type        = string
  description = "Existing customer-managed KMS key ARN used by Secrets Manager to encrypt the application config secret; CareerOps code never calls KMS directly."
  validation {
    condition     = can(regex("^arn:aws:kms:ap-southeast-2:${var.aws_account_id}:key/[A-Za-z0-9-]+$", var.kms_key_arn))
    error_message = "kms_key_arn must be a customer-managed KMS key ARN in ap-southeast-2 and aws_account_id."
  }
}
variable "container_image" {
  type        = string
  description = "Full ECR image URI including tag or digest."
}
variable "app_secrets_arn" {
  type        = string
  description = "Secrets Manager ARN for the JSON application configuration secret."
  validation {
    condition     = can(regex("^arn:aws:secretsmanager:ap-southeast-2:${var.aws_account_id}:secret:.+$", var.app_secrets_arn))
    error_message = "app_secrets_arn must belong to aws_account_id in ap-southeast-2."
  }
}
variable "db_name" {
  type    = string
  default = "careerops"
}
variable "db_master_username" {
  type    = string
  default = "careerops_admin"
}
variable "db_instance_class" {
  type    = string
  default = "db.t4g.medium"
}
variable "db_allocated_storage" {
  type    = number
  default = 50
  validation {
    condition     = var.db_allocated_storage >= 20 && var.db_allocated_storage <= 200
    error_message = "For the initial balanced footprint, allocated storage must be between 20 and 200 GiB."
  }
}
variable "api_desired_count" {
  type    = number
  default = 2
  validation {
    condition     = var.api_desired_count >= 2 && var.api_desired_count <= 4
    error_message = "The 99.9% target requires at least two API tasks; the initial footprint is capped at four."
  }
}
variable "api_max_count" {
  type    = number
  default = 4
  validation {
    condition     = var.api_max_count >= var.api_desired_count && var.api_max_count <= 8
    error_message = "api_max_count must be at least api_desired_count and no more than eight for the initial footprint."
  }
}
variable "api_cpu" {
  type    = number
  default = 512
}
variable "api_memory" {
  type    = number
  default = 1024
}
variable "log_retention_days" {
  type    = number
  default = 30
}
variable "db_backup_retention_days" {
  type    = number
  default = 7
}
variable "deletion_protection" {
  type    = bool
  default = true
}
variable "allowed_ingress_cidrs" {
  type        = list(string)
  description = "Explicit client CIDRs permitted to reach the public ALB. Use your public IP with /32 for staging smoke tests."
  validation {
    condition     = length(var.allowed_ingress_cidrs) > 0 && alltrue([for cidr in var.allowed_ingress_cidrs : can(cidrhost(cidr, 0))])
    error_message = "Set at least one valid CIDR in allowed_ingress_cidrs. Prefer your public IP with /32 for staging."
  }
}
