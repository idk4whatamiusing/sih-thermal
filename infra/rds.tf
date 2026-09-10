# RDS PostGIS for the world 1yr+ hot store (issue #20).
#
# DISABLED BY DEFAULT (enable_rds = false -> count 0 -> zero cost, zero diff).
# Enable only when the backfill is green-lit:
#   terraform apply -var enable_rds=true
# then point compose.prod.yaml DATABASE_URL at the endpoint output and run the
# RANGE-partition cutover (firms_points monthly partitions) during a quiet window.
#
# Sizing: 1yr world all-sensors ~= 22-40M rows, ~40-65GB with indexes.
# db.t3.small (2vCPU/2GB) + 100GB gp3 + Multi-AZ (2a+2b) gives headroom for the
# training join (thermal_clusters x label_events x firms_points) without
# starving the EC2 box, which stays stateless (api/ai/realtime/Caddy only).

variable "enable_rds" {
  description = "Create the RDS PostGIS instance (costs money the moment it is true)."
  type        = bool
  default     = false
}

variable "rds_instance_class" {
  default = "db.t3.small"
}

variable "rds_allocated_gb" {
  default = 100
}

variable "rds_password" {
  description = "Master password for the RDS instance (pass via -var, never commit)."
  type        = string
  sensitive   = true
  default     = ""
}

data "aws_vpc" "default" {
  count   = var.enable_rds ? 1 : 0
  default = true
}

data "aws_subnets" "default" {
  count = var.enable_rds ? 1 : 0
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default[0].id]
  }
}

resource "aws_db_subnet_group" "sih" {
  count      = var.enable_rds ? 1 : 0
  name       = "sih-thermal-dbsubnet"
  subnet_ids = data.aws_subnets.default[0].ids
  tags       = { Name = "sih-thermal-dbsubnet", Project = "sih-thermal" }
}

resource "aws_security_group" "rds" {
  count       = var.enable_rds ? 1 : 0
  name        = "sih-thermal-rds"
  description = "Postgres 5432 from the app host only"
  vpc_id      = data.aws_vpc.default[0].id

  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.app.id]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
  tags = { Name = "sih-thermal-rds", Project = "sih-thermal" }
}

resource "aws_db_instance" "sih" {
  count                        = var.enable_rds ? 1 : 0
  identifier                   = "sih-thermal-postgis"
  engine                       = "postgres"
  engine_version               = "16"
  instance_class               = var.rds_instance_class
  allocated_storage            = var.rds_allocated_gb
  storage_type                 = "gp3"
  db_name                      = "app"
  username                     = "app"
  password                     = var.rds_password
  db_subnet_group_name         = aws_db_subnet_group.sih[0].name
  vpc_security_group_ids       = [aws_security_group.rds[0].id]
  multi_az                     = true
  backup_retention_period      = 7
  deletion_protection          = true
  skip_final_snapshot          = false
  final_snapshot_identifier    = "sih-thermal-final"
  performance_insights_enabled = false
  tags                         = { Name = "sih-thermal-postgis", Project = "sih-thermal", Env = "prod" }
}

output "rds_endpoint" {
  value = var.enable_rds ? aws_db_instance.sih[0].endpoint : "disabled (apply with -var enable_rds=true)"
}

output "rds_next_steps" {
  value = <<-EOT
    1. terraform apply -var enable_rds=true -var rds_password='...'
    2. CREATE EXTENSION postgis; CREATE EXTENSION vector; on the new endpoint
    3. pg_dump from EC2 postgres, pg_restore to RDS
    4. Cut firms_points to monthly RANGE partitions on acq_date (exclusive lock window)
    5. Set DATABASE_URL=postgres://app:...@<endpoint>:5432/app in .env, redeploy
    6. Retention: keep 1yr+ hot, archive older months to R2 Parquet
  EOT
}
