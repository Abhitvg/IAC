variable "aws_region" { type = string }
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
variable "database_subnet_ids" {
  type = list(string)
  validation {
    condition     = length(var.database_subnet_ids) >= 2
    error_message = "At least two isolated database subnets are required."
  }
}
variable "acm_certificate_arn" { type = string }
variable "kms_key_arn" {
  type        = string
  description = "Existing customer-managed KMS key ARN used for CareerOps envelope encryption."
  validation {
    condition     = can(regex("^arn:(aws|aws-us-gov|aws-cn):kms:[a-z0-9-]+:[0-9]{12}:key/[A-Za-z0-9-]+$", var.kms_key_arn))
    error_message = "kms_key_arn must be a customer-managed KMS key ARN."
  }
}
variable "container_image" {
  type        = string
  description = "Full ECR image URI including tag or digest."
}
variable "app_secrets_arn" {
  type        = string
  description = "Secrets Manager ARN for the JSON application configuration secret."
}
variable "db_name" {
  type    = string
  default = "careerops"
}
variable "db_master_username" {
  type    = string
  default = "careerops_admin"
}
variable "db_master_password" {
  type      = string
  sensitive = true
}
variable "db_instance_class" {
  type    = string
  default = "db.t4g.medium"
}
variable "db_allocated_storage" {
  type    = number
  default = 100
}
variable "api_desired_count" {
  type    = number
  default = 2
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
  default = 90
}
variable "db_backup_retention_days" {
  type    = number
  default = 14
}
variable "deletion_protection" {
  type    = bool
  default = true
}
variable "allowed_ingress_cidrs" {
  type        = list(string)
  description = "Public client CIDRs permitted to reach the ALB. Prefer restricted corporate/client ranges where feasible."
  default     = ["0.0.0.0/0"]
}
