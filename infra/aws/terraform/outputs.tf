output "api_url" {
  value = "https://${aws_lb.api.dns_name}"
}
output "ecr_repository_url" {
  value = aws_ecr_repository.api.repository_url
}
output "ecs_cluster_name" {
  value = aws_ecs_cluster.api.name
}
output "ecs_service_name" {
  value = aws_ecs_service.api.name
}
output "ecs_task_family" {
  value = aws_ecs_task_definition.api.family
}
output "database_address" {
  value = aws_db_instance.database.address
}
