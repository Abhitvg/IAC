locals {
  name = "${var.project}-${var.environment}"
  tags = {
    Application = var.project
    Environment = var.environment
    ManagedBy   = "Terraform"
  }
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
  description = "Public HTTPS ingress to CareerOps API"
  vpc_id      = var.vpc_id
  ingress {
    description = "HTTPS"
    from_port = 443
    to_port = 443
    protocol = "tcp"
    cidr_blocks = var.allowed_ingress_cidrs
  }
  ingress {
    description = "HTTP redirect only"
    from_port = 80
    to_port = 80
    protocol = "tcp"
    cidr_blocks = var.allowed_ingress_cidrs
  }
  egress {
    from_port = 0
    to_port = 0
    protocol = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
  tags = local.tags
}

resource "aws_security_group" "api" {
  name        = "${local.name}-api"
  description = "Only the ALB can reach CareerOps tasks"
  vpc_id      = var.vpc_id
  ingress {
    from_port = 3000
    to_port = 3000
    protocol = "tcp"
    security_groups = [aws_security_group.alb.id]
  }
  egress {
    from_port = 0
    to_port = 0
    protocol = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
  tags = local.tags
}

resource "aws_security_group" "database" {
  name        = "${local.name}-database"
  description = "PostgreSQL is reachable only from CareerOps tasks"
  vpc_id      = var.vpc_id
  ingress {
    from_port = 5432
    to_port = 5432
    protocol = "tcp"
    security_groups = [aws_security_group.api.id]
  }
  tags = local.tags
}

resource "aws_db_subnet_group" "database" {
  name       = "${local.name}-db"
  subnet_ids = var.database_subnet_ids
  tags       = local.tags
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
  identifier                 = local.name
  engine                     = "postgres"
  instance_class             = var.db_instance_class
  allocated_storage          = var.db_allocated_storage
  storage_type               = "gp3"
  storage_encrypted          = true
  db_name                    = var.db_name
  username                   = var.db_master_username
  password                   = var.db_master_password
  port                       = 5432
  db_subnet_group_name       = aws_db_subnet_group.database.name
  parameter_group_name       = aws_db_parameter_group.database.name
  vpc_security_group_ids     = [aws_security_group.database.id]
  publicly_accessible        = false
  multi_az                   = true
  backup_retention_period    = var.db_backup_retention_days
  auto_minor_version_upgrade = true
  deletion_protection        = var.deletion_protection
  skip_final_snapshot        = false
  final_snapshot_identifier  = "${local.name}-final"
  copy_tags_to_snapshot      = true
  apply_immediately          = false
  tags                       = local.tags
}

resource "aws_lb" "api" {
  name               = substr("${local.name}-api", 0, 32)
  load_balancer_type = "application"
  internal           = false
  security_groups    = [aws_security_group.alb.id]
  subnets            = var.public_subnet_ids
  drop_invalid_header_fields = true
  enable_deletion_protection = var.deletion_protection
  tags = local.tags
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
    type = "redirect"
    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.api.arn
  port              = 443
  protocol          = "HTTPS"
  certificate_arn   = var.acm_certificate_arn
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
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

data "aws_iam_policy_document" "read_app_secret" {
  statement {
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [var.app_secrets_arn]
  }
}

resource "aws_iam_role_policy" "read_app_secret" {
  name   = "${local.name}-read-app-secret"
  role   = aws_iam_role.execution.id
  policy = data.aws_iam_policy_document.read_app_secret.json
}

resource "aws_iam_role" "task" {
  name               = "${local.name}-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
  tags               = local.tags
}

data "aws_iam_policy_document" "kms_data_key" {
  statement {
    actions   = ["kms:GenerateDataKey", "kms:Decrypt"]
    resources = [var.kms_key_arn]
    condition {
      test     = "StringEquals"
      variable = "kms:EncryptionContext:careerops:application"
      values   = ["careerops"]
    }
  }
}

resource "aws_iam_role_policy" "kms_data_key" {
  name   = "${local.name}-kms-envelope-encryption"
  role   = aws_iam_role.task.id
  policy = data.aws_iam_policy_document.kms_data_key.json
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
    name      = "careerops-api"
    image     = var.container_image
    essential = true
    portMappings = [{ containerPort = 3000, hostPort = 3000, protocol = "tcp" }]
    environment = [
      { name = "NODE_ENV", value = "production" },
      { name = "PORT", value = "3000" },
      { name = "HOST", value = "0.0.0.0" },
      { name = "AWS_REGION", value = var.aws_region },
      { name = "CAREEROPS_KMS_KEY_ARN", value = var.kms_key_arn }
    ]
    secrets = [
      { name = "CAREEROPS_DATABASE_URL", valueFrom = "${var.app_secrets_arn}:CAREEROPS_DATABASE_URL::" },
      { name = "CAREEROPS_JWT_ISSUER", valueFrom = "${var.app_secrets_arn}:CAREEROPS_JWT_ISSUER::" },
      { name = "CAREEROPS_JWT_AUDIENCE", valueFrom = "${var.app_secrets_arn}:CAREEROPS_JWT_AUDIENCE::" },
      { name = "CAREEROPS_JWKS_URL", valueFrom = "${var.app_secrets_arn}:CAREEROPS_JWKS_URL::" },
      { name = "CAREEROPS_CONSENT_SIGNING_SECRET", valueFrom = "${var.app_secrets_arn}:CAREEROPS_CONSENT_SIGNING_SECRET::" },
      { name = "CAREEROPS_RATE_LIMIT_HASH_SECRET", valueFrom = "${var.app_secrets_arn}:CAREEROPS_RATE_LIMIT_HASH_SECRET::" },
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
  name            = "${local.name}-api"
  cluster         = aws_ecs_cluster.api.id
  task_definition = aws_ecs_task_definition.api.arn
  desired_count   = var.api_desired_count
  launch_type     = "FARGATE"
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
  depends_on = [aws_lb_listener.https, aws_iam_role_policy_attachment.execution_managed, aws_iam_role_policy.read_app_secret, aws_iam_role_policy.kms_data_key]
  tags = local.tags
}

resource "aws_appautoscaling_target" "api" {
  max_capacity       = 8
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
