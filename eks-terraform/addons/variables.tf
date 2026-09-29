variable "aws_region" {
  description = "AWS region containing the existing EKS cluster."
  type        = string
  default     = "eu-north-1"
}

variable "cluster_name" {
  description = "Existing EKS cluster to receive the tracked platform add-ons."
  type        = string
  default     = "cluster1-eks"
}

variable "vpc_id" {
  description = "VPC ID used for AWS Load Balancer Controller subnet discovery."
  type        = string
  default     = "vpc-01010c2a85706f9c6"
}

variable "aws_cli_path" {
  description = "AWS CLI binary used by provider exec authentication."
  type        = string
  default     = "/Users/hasanmariam/.local/share/aws-cli/aws"
}
