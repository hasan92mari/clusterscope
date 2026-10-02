resource "random_password" "postgres" {
  length  = 32
  special = false
}

resource "random_password" "redis" {
  length  = 32
  special = false
}

resource "aws_security_group" "managed_data" {
  name        = "${var.cluster_name}-managed-data"
  description = "Private ingress to ClusterScope managed PostgreSQL and Redis from EKS nodes."
  vpc_id      = var.vpc_id

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(var.tags, {
    Name = "${var.cluster_name}-managed-data"
  })
}

resource "aws_vpc_security_group_ingress_rule" "postgres_from_eks" {
  security_group_id            = aws_security_group.managed_data.id
  referenced_security_group_id = aws_eks_cluster.this.vpc_config[0].cluster_security_group_id
  description                  = "PostgreSQL from EKS cluster and managed nodes."
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
}

resource "aws_vpc_security_group_ingress_rule" "redis_from_eks" {
  security_group_id            = aws_security_group.managed_data.id
  referenced_security_group_id = aws_eks_cluster.this.vpc_config[0].cluster_security_group_id
  description                  = "Redis from EKS cluster and managed nodes."
  ip_protocol                  = "tcp"
  from_port                    = 6379
  to_port                      = 6379
}

resource "aws_db_subnet_group" "managed_data" {
  name        = "${var.cluster_name}-managed-data"
  description = "Private subnets for the ClusterScope managed databases."
  subnet_ids  = var.subnet_ids

  tags = merge(var.tags, {
    Name = "${var.cluster_name}-managed-data"
  })
}

resource "aws_elasticache_subnet_group" "managed_data" {
  name        = "${var.cluster_name}-managed-data"
  description = "Private subnets for the ClusterScope managed Redis cache."
  subnet_ids  = var.subnet_ids
}

resource "aws_db_instance" "postgres" {
  identifier                      = "${var.cluster_name}-postgres"
  engine                          = "postgres"
  engine_version                  = "17.11"
  instance_class                  = "db.t4g.micro"
  allocated_storage               = 20
  max_allocated_storage           = 100
  storage_type                    = "gp3"
  storage_encrypted               = true
  db_name                         = "clusterscope"
  username                        = "clusterscope"
  password                        = random_password.postgres.result
  db_subnet_group_name            = aws_db_subnet_group.managed_data.name
  vpc_security_group_ids          = [aws_security_group.managed_data.id]
  publicly_accessible             = false
  multi_az                        = false
  backup_retention_period         = 1
  auto_minor_version_upgrade      = true
  deletion_protection             = false
  skip_final_snapshot             = true
  apply_immediately               = true
  enabled_cloudwatch_logs_exports = ["postgresql"]

  tags = merge(var.tags, {
    Name = "${var.cluster_name}-postgres"
  })
}

resource "aws_elasticache_replication_group" "redis" {
  replication_group_id       = "${var.cluster_name}-redis"
  description                = "Managed Redis cache for ClusterScope."
  engine                     = "redis"
  engine_version             = "7.1"
  node_type                  = "cache.t4g.micro"
  num_cache_clusters         = 1
  port                       = 6379
  parameter_group_name       = "default.redis7"
  subnet_group_name          = aws_elasticache_subnet_group.managed_data.name
  security_group_ids         = [aws_security_group.managed_data.id]
  auth_token                 = random_password.redis.result
  transit_encryption_enabled = true
  at_rest_encryption_enabled = true
  automatic_failover_enabled = false
  multi_az_enabled           = false
  auto_minor_version_upgrade = true
  apply_immediately          = true
  snapshot_retention_limit   = 0
}

resource "aws_secretsmanager_secret" "postgres" {
  name                    = "${var.cluster_name}/clusterscope/postgres"
  description             = "Connection details for ClusterScope RDS PostgreSQL."
  recovery_window_in_days = 0
  tags                    = var.tags
}

resource "aws_secretsmanager_secret_version" "postgres" {
  secret_id = aws_secretsmanager_secret.postgres.id
  secret_string = jsonencode({
    username = "clusterscope"
    password = random_password.postgres.result
    database = "clusterscope"
    host     = aws_db_instance.postgres.address
    port     = tostring(aws_db_instance.postgres.port)
  })
}

resource "aws_secretsmanager_secret" "redis" {
  name                    = "${var.cluster_name}/clusterscope/redis"
  description             = "Connection details for ClusterScope ElastiCache Redis."
  recovery_window_in_days = 0
  tags                    = var.tags
}

resource "aws_secretsmanager_secret_version" "redis" {
  secret_id = aws_secretsmanager_secret.redis.id
  secret_string = jsonencode({
    password = random_password.redis.result
    host     = aws_elasticache_replication_group.redis.primary_endpoint_address
    port     = tostring(aws_elasticache_replication_group.redis.port)
  })
}