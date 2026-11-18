locals {
  name = "${var.project}-${var.environment}"
  tags = {
    Application = var.project
    Environment = var.environment
    ManagedBy   = "Terraform"
  }
}

# Read-only lookups let Terraform fail before resource creation if supplied
# subnet IDs do not match the two-AZ network contract.
data "aws_subnet" "public" {
  for_each = toset(var.public_subnet_ids)
  id       = each.value
}

data "aws_route_table" "public" {
  for_each  = toset(var.public_subnet_ids)
  subnet_id = each.value
}

data "aws_subnet" "application" {
  for_each = toset(var.private_subnet_ids)
  id       = each.value
}

data "aws_subnet" "database" {
  for_each = toset(var.database_subnet_ids)
  id       = each.value
}

data "aws_route_table" "application" {
  for_each  = toset(var.private_subnet_ids)
  subnet_id = each.value
}

data "aws_route_table" "database" {
  for_each  = toset(var.database_subnet_ids)
  subnet_id = each.value
}

# Reuse the existing public/private subnets and route tables. No VPC, subnet,
# Internet Gateway, or S3 endpoint resources are created or modified here.
# Staging uses one NAT Gateway; production uses one NAT Gateway per AZ.
resource "aws_eip" "nat" {
  count  = var.environment == "production" ? 2 : 1
  domain = "vpc"
  tags   = merge(local.tags, { Name = "${local.name}-nat-${count.index + 1}" })
}

resource "aws_nat_gateway" "egress" {
  count         = var.environment == "production" ? 2 : 1
  allocation_id = aws_eip.nat[count.index].id
  subnet_id     = var.public_subnet_ids[count.index]
  depends_on    = [aws_eip.nat]
  tags          = merge(local.tags, { Name = "${local.name}-nat-${count.index + 1}" })
}

resource "aws_route" "private_egress" {
  count                  = 2
  route_table_id         = var.private_route_table_ids[count.index]
  destination_cidr_block = "0.0.0.0/0"
  nat_gateway_id         = aws_nat_gateway.egress[var.environment == "production" ? count.index : 0].id
}

resource "aws_ecr_repository" "api" {
  name                 = local.name
  image_tag_mutability = "IMMUTABLE"
  image_scanning_configuration { scan_on_push = true }
  encryption_configuration { encryption_type = "AES256" }
  tags = local.tags
}

resource "aws_ecr_lifecycle_policy" "api" {
  repository = aws_ecr_repository.api.name
  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Retain the latest 30 release images"
      selection = {
        tagStatus     = "tagged"
        tagPrefixList = ["release-"]
        countType     = "imageCountMoreThan"
        countNumber   = 30
      }
      action = { type = "expire" }
    }]
  })
}

resource "aws_cloudwatch_log_group" "api" {
  name              = "/ecs/${local.name}/api"
  retention_in_days = var.log_retention_days
  tags              = local.tags
}

resource "aws_security_group" "alb" {
  name        = "${local.name}-alb"
  description = "Public ingress to CareerOps API; HTTPS is used when enabled"
  vpc_id      = var.vpc_id
  dynamic "ingress" {
    for_each = var.enable_https ? [1] : []
    content {
      description = "HTTPS"
      from_port   = 443
      to_port     = 443
      protocol    = "tcp"
      cidr_blocks = var.allowed_ingress_cidrs
    }
  }
  ingress {
    description = var.enable_https ? "HTTP to HTTPS redirect" : "Staging HTTP ingress; no sensitive or production traffic"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = var.allowed_ingress_cidrs
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
  tags = local.tags
}

resource "aws_security_group" "api" {
  name        = "${local.name}-api"
  description = "Only the ALB can reach CareerOps tasks"
  vpc_id      = var.vpc_id
  ingress {
    from_port       = 3000
    to_port         = 3000
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
  tags = local.tags
}

resource "aws_security_group" "database" {
  name        = "${local.name}-database"
  description = "PostgreSQL is reachable only from CareerOps tasks"
  vpc_id      = var.vpc_id
  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.api.id]
  }
  tags = local.tags
}

resource "aws_db_subnet_group" "database" {
  name       = "${local.name}-db"
  subnet_ids = var.database_subnet_ids
  tags       = local.tags

  lifecycle {
    precondition {
      condition = alltrue([
        for subnet in values(data.aws_subnet.database) :
        subnet.vpc_id == var.vpc_id
      ])
      error_message = "All database subnets must belong to the configured VPC."
    }

    precondition {
      condition = length(distinct([
        for subnet in values(data.aws_subnet.database) :
        subnet.availability_zone
      ])) >= 2
      error_message = "Database subnets must span at least two availability zones."
    }

    precondition {
      condition = alltrue([
        for route_table in values(data.aws_route_table.database) : alltrue([
          for route in route_table.routes : !(
            route.cidr_block == "0.0.0.0/0" && (
              try(startswith(route.gateway_id, "igw-"), false) ||
              try(startswith(route.nat_gateway_id, "nat-"), false)
            )
          )
        ])
      ])
      error_message = "Database subnet route tables must not have an IPv4 default route to an Internet Gateway or NAT Gateway."
    }
  }
}

resource "aws_db_parameter_group" "database" {
  name   = "${local.name}-postgres16"
  family = "postgres16"
  parameter {
    name         = "rds.force_ssl"
    value        = "1"
    apply_method = "immediate"
  }
  tags = local.tags
}

resource "aws_db_instance" "database" {
  identifier = local.name
  engine     = "postgres"
  # Keep the RDS engine major aligned with the postgres16 parameter group and CI image.
  engine_version              = "16"
  instance_class              = var.db_instance_class
  allocated_storage           = var.db_allocated_storage
  storage_type                = "gp3"
  storage_encrypted           = true
  db_name                     = var.db_name
  username                    = var.db_master_username
  manage_master_user_password = true
  port                        = 5432
  db_subnet_group_name        = aws_db_subnet_group.database.name
  parameter_group_name        = aws_db_parameter_group.database.name
  vpc_security_group_ids      = [aws_security_group.database.id]
  publicly_accessible         = false
  multi_az                    = true
  backup_retention_period     = var.db_backup_retention_days
  auto_minor_version_upgrade  = true
  deletion_protection         = var.deletion_protection
  skip_final_snapshot         = false
  final_snapshot_identifier   = "${local.name}-final"
  copy_tags_to_snapshot       = true
  apply_immediately           = false
  tags                        = local.tags
}

resource "aws_lb" "api" {
  name                       = substr("${local.name}-api", 0, 32)
  load_balancer_type         = "application"
  internal                   = false
  security_groups            = [aws_security_group.alb.id]
  subnets                    = var.public_subnet_ids
  drop_invalid_header_fields = true
  enable_deletion_protection = var.deletion_protection
  # The API trusts only the rightmost client IP appended by this load balancer.
  xff_header_processing_mode = "append"
  enable_xff_client_port     = false
  tags                       = local.tags

  lifecycle {
    precondition {
      condition = alltrue([
        for subnet in values(data.aws_subnet.public) :
        subnet.vpc_id == var.vpc_id
      ])
      error_message = "All public ALB subnets must belong to the configured VPC."
    }

    precondition {
      condition = length(distinct([
        for subnet in values(data.aws_subnet.public) :
        subnet.availability_zone
      ])) == 2
      error_message = "Public ALB subnets must occupy two different availability zones."
    }

    precondition {
      condition = alltrue([
        for route_table in values(data.aws_route_table.public) : anytrue([
          for route in route_table.routes :
          route.cidr_block == "0.0.0.0/0" &&
          try(startswith(route.gateway_id, "igw-"), false)
        ])
      ])
      error_message = "Each public ALB subnet must be associated with a route table that has an IPv4 default route to an Internet Gateway."
    }
  }
}

resource "aws_lb_target_group" "api" {
  name        = substr("${local.name}-tg", 0, 32)
  port        = 3000
  protocol    = "HTTP"
  target_type = "ip"
  vpc_id      = var.vpc_id
  health_check {
    enabled             = true
    path                = "/health/ready"
    matcher             = "200"
    interval            = 30
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }
  tags = local.tags
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.api.arn
  port              = 80
  protocol          = "HTTP"
  default_action {
    type             = var.enable_https ? "redirect" : "forward"
    target_group_arn = var.enable_https ? null : aws_lb_target_group.api.arn
    dynamic "redirect" {
      for_each = var.enable_https ? [1] : []
      content {
        port        = "443"
        protocol    = "HTTPS"
        status_code = "HTTP_301"
      }
    }
  }
}

resource "aws_lb_listener" "https" {
  count             = var.enable_https ? 1 : 0
  load_balancer_arn = aws_lb.api.arn
  port              = 443
  protocol          = "HTTPS"
  certificate_arn   = var.acm_certificate_arn
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }
  lifecycle {
    precondition {
      condition     = var.acm_certificate_arn != null
      error_message = "HTTPS requires a valid ACM certificate ARN. Use staging with enable_https=false only for non-sensitive testing."
    }
  }
}

data "aws_iam_policy_document" "ecs_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "execution" {
  name               = "${local.name}-execution"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
  tags               = local.tags
}

resource "aws_iam_role_policy_attachment" "execution_managed" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

data "aws_secretsmanager_secret" "app_config" {
  arn = var.app_secrets_arn
}

data "aws_iam_policy_document" "read_app_secret" {
  statement {
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [data.aws_secretsmanager_secret.app_config.arn]
  }

  # Secrets Manager decrypts the config secret using the CMK on behalf of
  # the ECS execution role. The application task role receives no KMS access.
  statement {
    actions   = ["kms:Decrypt"]
    resources = [var.kms_key_arn]

    condition {
      test     = "StringEquals"
      variable = "kms:ViaService"
      values   = ["secretsmanager.${var.aws_region}.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "kms:EncryptionContext:SecretARN"
      values   = [data.aws_secretsmanager_secret.app_config.arn]
    }
  }
}

resource "aws_iam_role_policy" "read_app_secret" {
  name   = "${local.name}-read-app-secret"
  role   = aws_iam_role.execution.id
  policy = data.aws_iam_policy_document.read_app_secret.json

  lifecycle {
    precondition {
      condition     = data.aws_secretsmanager_secret.app_config.kms_key_id == var.kms_key_arn
      error_message = "The application Secrets Manager secret must be encrypted with kms_key_arn; configure that key on the secret before planning."
    }
  }
}

resource "aws_iam_role" "task" {
  name               = "${local.name}-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
  tags               = local.tags
}

resource "aws_ecs_cluster" "api" {
  name = local.name
  setting {
    name  = "containerInsights"
    value = "enabled"
  }
  tags = local.tags
}

resource "aws_ecs_task_definition" "api" {
  family                   = "${local.name}-api"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.api_cpu
  memory                   = var.api_memory
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn
  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "ARM64"
  }
  container_definitions = jsonencode([{
    name         = "careerops-api"
    image        = var.container_image
    essential    = true
    portMappings = [{ containerPort = 3000, hostPort = 3000, protocol = "tcp" }]
    environment = [
      { name = "NODE_ENV", value = "production" },
      { name = "PORT", value = "3000" },
      { name = "HOST", value = "0.0.0.0" },
      { name = "CAREEROPS_TRUST_PROXY", value = "true" },
      { name = "CAREEROPS_CORS_ALLOWED_ORIGINS", value = join(",", var.api_allowed_origins) }
    ]
    secrets = [
      { name = "CAREEROPS_DATABASE_URL", valueFrom = "${var.app_secrets_arn}:CAREEROPS_DATABASE_URL::" },
      { name = "CAREEROPS_JWT_ISSUER", valueFrom = "${var.app_secrets_arn}:CAREEROPS_JWT_ISSUER::" },
      { name = "CAREEROPS_JWT_AUDIENCE", valueFrom = "${var.app_secrets_arn}:CAREEROPS_JWT_AUDIENCE::" },
      { name = "CAREEROPS_JWKS_URL", valueFrom = "${var.app_secrets_arn}:CAREEROPS_JWKS_URL::" },
      { name = "CAREEROPS_CONSENT_SIGNING_SECRET", valueFrom = "${var.app_secrets_arn}:CAREEROPS_CONSENT_SIGNING_SECRET::" },
      { name = "CAREEROPS_RATE_LIMIT_HASH_SECRET", valueFrom = "${var.app_secrets_arn}:CAREEROPS_RATE_LIMIT_HASH_SECRET::" },
      { name = "CAREEROPS_ENVELOPE_MASTER_KEYS", valueFrom = "${var.app_secrets_arn}:CAREEROPS_ENVELOPE_MASTER_KEYS::" },
      { name = "CAREEROPS_ENVELOPE_CURRENT_KEY_VERSION", valueFrom = "${var.app_secrets_arn}:CAREEROPS_ENVELOPE_CURRENT_KEY_VERSION::" },
      { name = "LINKEDIN_CLIENT_ID", valueFrom = "${var.app_secrets_arn}:LINKEDIN_CLIENT_ID::" },
      { name = "LINKEDIN_CLIENT_SECRET", valueFrom = "${var.app_secrets_arn}:LINKEDIN_CLIENT_SECRET::" },
      { name = "LINKEDIN_REDIRECT_URI", valueFrom = "${var.app_secrets_arn}:LINKEDIN_REDIRECT_URI::" }
    ]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.api.name
        awslogs-region        = var.aws_region
        awslogs-stream-prefix = "api"
      }
    }
  }])
  tags = local.tags
}

resource "aws_ecs_service" "api" {
  name             = "${local.name}-api"
  cluster          = aws_ecs_cluster.api.id
  task_definition  = aws_ecs_task_definition.api.arn
  desired_count    = var.api_desired_count
  launch_type      = "FARGATE"
  platform_version = "LATEST"
  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }
  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = [aws_security_group.api.id]
    assign_public_ip = false
  }
  load_balancer {
    target_group_arn = aws_lb_target_group.api.arn
    container_name   = "careerops-api"
    container_port   = 3000
  }
  depends_on = [aws_lb_listener.http, aws_iam_role_policy_attachment.execution_managed, aws_iam_role_policy.read_app_secret, aws_route.private_egress]
  tags       = local.tags

  lifecycle {
    precondition {
      condition = alltrue([
        for subnet in values(data.aws_subnet.application) :
        subnet.vpc_id == var.vpc_id
      ])
      error_message = "All application private subnets must belong to the configured VPC."
    }

    precondition {
      condition = length(distinct([
        for subnet in values(data.aws_subnet.application) :
        subnet.availability_zone
      ])) == 2
      error_message = "Application private subnets must occupy two different availability zones."
    }

    precondition {
      condition = alltrue([
        for index, subnet_id in var.private_subnet_ids :
        data.aws_route_table.application[subnet_id].id == var.private_route_table_ids[index]
      ])
      error_message = "Each application private subnet must be associated with its corresponding configured route table."
    }
  }
}

resource "aws_appautoscaling_target" "api" {
  max_capacity       = var.api_max_count
  min_capacity       = var.api_desired_count
  resource_id        = "service/${aws_ecs_cluster.api.name}/${aws_ecs_service.api.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_appautoscaling_policy" "api_cpu" {
  name               = "${local.name}-api-cpu"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.api.resource_id
  scalable_dimension = aws_appautoscaling_target.api.scalable_dimension
  service_namespace  = aws_appautoscaling_target.api.service_namespace
  target_tracking_scaling_policy_configuration {
    target_value = 65
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
  }
}

resource "aws_sns_topic" "operations_alerts" {
  name              = "${local.name}-operations-alerts"
  kms_master_key_id = "alias/aws/sns"
  tags              = local.tags
}

resource "aws_cloudwatch_metric_alarm" "api_running_tasks" {
  alarm_name          = "${local.name}-api-running-tasks-low"
  alarm_description   = "Fewer than two CareerOps API tasks are running."
  namespace           = "ECS/ContainerInsights"
  metric_name         = "RunningTaskCount"
  statistic           = "Average"
  period              = 60
  evaluation_periods  = 2
  threshold           = 2
  comparison_operator = "LessThanThreshold"
  treat_missing_data  = "breaching"
  dimensions = {
    ClusterName = aws_ecs_cluster.api.name
    ServiceName = aws_ecs_service.api.name
  }
  alarm_actions = [aws_sns_topic.operations_alerts.arn]
  ok_actions    = [aws_sns_topic.operations_alerts.arn]
  tags          = local.tags
}

resource "aws_cloudwatch_metric_alarm" "alb_5xx" {
  alarm_name          = "${local.name}-alb-5xx"
  alarm_description   = "ALB generated five or more 5xx responses in a one-minute period."
  namespace           = "AWS/ApplicationELB"
  metric_name         = "HTTPCode_ELB_5XX_Count"
  statistic           = "Sum"
  period              = 60
  evaluation_periods  = 2
  threshold           = 5
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  dimensions = {
    LoadBalancer = aws_lb.api.arn_suffix
  }
  alarm_actions = [aws_sns_topic.operations_alerts.arn]
  tags          = local.tags
}

resource "aws_cloudwatch_metric_alarm" "api_target_5xx" {
  alarm_name          = "${local.name}-api-target-5xx"
  alarm_description   = "CareerOps API targets returned five or more 5xx responses in a one-minute period."
  namespace           = "AWS/ApplicationELB"
  metric_name         = "HTTPCode_Target_5XX_Count"
  statistic           = "Sum"
  period              = 60
  evaluation_periods  = 2
  threshold           = 5
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  dimensions = {
    LoadBalancer = aws_lb.api.arn_suffix
    TargetGroup  = aws_lb_target_group.api.arn_suffix
  }
  alarm_actions = [aws_sns_topic.operations_alerts.arn]
  tags          = local.tags
}

resource "aws_cloudwatch_metric_alarm" "unhealthy_targets" {
  alarm_name          = "${local.name}-unhealthy-targets"
  alarm_description   = "At least one unhealthy CareerOps API target is registered."
  namespace           = "AWS/ApplicationELB"
  metric_name         = "UnHealthyHostCount"
  statistic           = "Maximum"
  period              = 60
  evaluation_periods  = 2
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "breaching"
  dimensions = {
    LoadBalancer = aws_lb.api.arn_suffix
    TargetGroup  = aws_lb_target_group.api.arn_suffix
  }
  alarm_actions = [aws_sns_topic.operations_alerts.arn]
  ok_actions    = [aws_sns_topic.operations_alerts.arn]
  tags          = local.tags
}

resource "aws_cloudwatch_metric_alarm" "database_cpu" {
  alarm_name          = "${local.name}-database-cpu-high"
  alarm_description   = "RDS CPU remains above 80 percent."
  namespace           = "AWS/RDS"
  metric_name         = "CPUUtilization"
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 3
  threshold           = 80
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  dimensions = {
    DBInstanceIdentifier = aws_db_instance.database.id
  }
  alarm_actions = [aws_sns_topic.operations_alerts.arn]
  tags          = local.tags
}

resource "aws_cloudwatch_metric_alarm" "database_storage" {
  alarm_name          = "${local.name}-database-free-storage-low"
  alarm_description   = "RDS free storage is below 10 GiB."
  namespace           = "AWS/RDS"
  metric_name         = "FreeStorageSpace"
  statistic           = "Minimum"
  period              = 300
  evaluation_periods  = 2
  threshold           = 10737418240
  comparison_operator = "LessThanThreshold"
  treat_missing_data  = "breaching"
  dimensions = {
    DBInstanceIdentifier = aws_db_instance.database.id
  }
  alarm_actions = [aws_sns_topic.operations_alerts.arn]
  tags          = local.tags
}
