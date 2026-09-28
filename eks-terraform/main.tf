locals {
  node_service_vpc_endpoints = toset([
    "ecr.api",
    "ecr.dkr",
    "ec2",
    "eks-auth",
  ])

  node_route_table_ids = toset([
    for route_table in data.aws_route_table.node_subnets : route_table.id
  ])

  addons = {
    "aws-ebs-csi-driver" = {
      version         = "v1.66.0-eksbuild.1"
      service_account = "ebs-csi-controller-sa"
      role_arn        = var.ebs_csi_pod_identity_role_arn
    }
    "aws-ec2-local-instance-store-csi-driver" = {
      version         = "v1.0.5-eksbuild.2"
      service_account = null
      role_arn        = null
    }
    coredns = {
      version         = "v1.14.3-eksbuild.23"
      service_account = null
      role_arn        = null
    }
    "eks-node-monitoring-agent" = {
      version         = "v1.7.2-eksbuild.1"
      service_account = null
      role_arn        = null
    }
    "eks-pod-identity-agent" = {
      # Auto Mode supplied this agent. Standard managed node groups need the add-on.
      # Let EKS choose the compatible version for the cluster's Kubernetes version.
      version         = null
      service_account = null
      role_arn        = null
    }
    "kube-proxy" = {
      version         = "v1.36.0-eksbuild.25"
      service_account = null
      role_arn        = null
    }
    "metrics-server" = {
      version         = "v0.9.0-eksbuild.11"
      service_account = null
      role_arn        = null
    }
    "vpc-cni" = {
      version         = "v1.22.4-eksbuild.3"
      service_account = "aws-node"
      role_arn        = var.vpc_cni_pod_identity_role_arn
    }
  }
}

data "aws_subnet" "selected" {
  for_each = toset(var.subnet_ids)
  id       = each.value
}

data "aws_subnet" "nat_public" {
  id = var.nat_public_subnet_id
}

data "aws_route_table" "nat_public" {
  subnet_id = var.nat_public_subnet_id
}

data "aws_route_table" "node_subnets" {
  for_each  = toset(var.subnet_ids)
  subnet_id = each.value
}

resource "aws_eks_cluster" "this" {
  name                          = var.cluster_name
  version                       = var.kubernetes_version
  role_arn                      = var.cluster_role_arn
  bootstrap_self_managed_addons = false

  access_config {
    authentication_mode                         = "API"
    bootstrap_cluster_creator_admin_permissions = true
  }

  vpc_config {
    subnet_ids              = var.subnet_ids
    endpoint_private_access = true
    endpoint_public_access  = true
    public_access_cidrs     = var.public_access_cidrs
  }

  kubernetes_network_config {
    ip_family         = "ipv4"
    service_ipv4_cidr = "10.100.0.0/16"
    elastic_load_balancing {
      enabled = false
    }
  }

  upgrade_policy {
    support_type = "STANDARD"
  }

  compute_config {
    enabled = false
  }

  storage_config {
    block_storage {
      enabled = false
    }
  }

  zonal_shift_config {
    enabled = false
  }

  enabled_cluster_log_types = []
  tags                      = var.tags

  lifecycle {
    precondition {
      condition = alltrue([
        for subnet in data.aws_subnet.selected : subnet.vpc_id == var.vpc_id
      ])
      error_message = "Every configured subnet must belong to var.vpc_id."
    }
  }

}

# The single NAT Gateway provides outbound internet access to nodes in the
# isolated subnets. It is placed in an existing public subnet and shared
# across Availability Zones to limit fixed NAT Gateway costs.
resource "aws_eip" "node_egress_nat" {
  domain = "vpc"

  tags = merge(var.tags, {
    Name = "${var.cluster_name}-node-egress-nat"
  })
}

resource "aws_nat_gateway" "node_egress" {
  allocation_id     = aws_eip.node_egress_nat.id
  subnet_id         = var.nat_public_subnet_id
  connectivity_type = "public"

  tags = merge(var.tags, {
    Name = "${var.cluster_name}-node-egress-nat"
  })

  lifecycle {
    precondition {
      condition = (
        data.aws_subnet.nat_public.vpc_id == var.vpc_id &&
        anytrue([
          for route in data.aws_route_table.nat_public.routes :
          route.cidr_block == "0.0.0.0/0" && try(startswith(route.gateway_id, "igw-"), false)
        ])
      )
      error_message = "nat_public_subnet_id must belong to var.vpc_id and have a 0.0.0.0/0 route to an Internet Gateway."
    }
  }
}

resource "aws_route" "node_default_egress" {
  for_each = local.node_route_table_ids

  route_table_id         = each.value
  destination_cidr_block = "0.0.0.0/0"
  nat_gateway_id         = aws_nat_gateway.node_egress.id
}

# ALB subnet auto-discovery uses this role tag for internet-facing load balancers.
# These are existing public subnets and are not otherwise managed by this stack.
resource "aws_ec2_tag" "alb_public_subnet_role" {
  for_each    = toset(var.alb_public_subnet_ids)
  resource_id = each.value
  key         = "kubernetes.io/role/elb"
  value       = "1"
}

resource "aws_ec2_tag" "alb_public_subnet_cluster" {
  for_each    = toset(var.alb_public_subnet_ids)
  resource_id = each.value
  key         = "kubernetes.io/cluster/${var.cluster_name}"
  value       = "shared"
}

# Interface endpoints keep AWS service traffic private; the S3 gateway
# endpoint remains associated with the node subnets' route tables.
resource "aws_vpc_endpoint" "node_services" {
  for_each = local.node_service_vpc_endpoints

  vpc_id              = var.vpc_id
  service_name        = "com.amazonaws.${var.aws_region}.${each.value}"
  vpc_endpoint_type   = "Interface"
  private_dns_enabled = true
  subnet_ids          = var.subnet_ids
  security_group_ids  = [aws_eks_cluster.this.vpc_config[0].cluster_security_group_id]

  tags = merge(var.tags, {
    Name = "${var.cluster_name}-${replace(each.value, ".", "-")}-endpoint"
  })
}

resource "aws_iam_role" "managed_node_group" {
  name = "${var.cluster_name}-managed-node-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Service = "ec2.amazonaws.com"
      }
      Action = "sts:AssumeRole"
    }]
  })

  tags = var.tags
}

resource "aws_iam_role_policy_attachment" "managed_node_group" {
  for_each = toset([
    "AmazonEKSWorkerNodePolicy",
    "AmazonEC2ContainerRegistryPullOnly",
  ])

  role       = aws_iam_role.managed_node_group.name
  policy_arn = "arn:aws:iam::aws:policy/${each.value}"
}

resource "aws_eks_node_group" "this" {
  cluster_name    = aws_eks_cluster.this.name
  node_group_name = "${var.cluster_name}-nodes"
  node_role_arn   = aws_iam_role.managed_node_group.arn
  subnet_ids      = var.subnet_ids
  instance_types  = ["t3.small"]
  capacity_type   = "ON_DEMAND"
  disk_size       = 20

  scaling_config {
    min_size     = 2
    desired_size = 2
    max_size     = 2
  }

  update_config {
    max_unavailable = 1
  }

  tags = var.tags

  depends_on = [
    aws_iam_role_policy_attachment.managed_node_group,
    aws_vpc_endpoint.node_services,
    aws_route.node_default_egress,
  ]
}

resource "aws_eks_addon" "this" {
  for_each = local.addons

  cluster_name                = aws_eks_cluster.this.name
  addon_name                  = each.key
  addon_version               = each.value.version
  configuration_values        = each.key == "vpc-cni" ? jsonencode({ enableNetworkPolicy = "true" }) : null
  resolve_conflicts_on_create = "OVERWRITE"
  resolve_conflicts_on_update = "PRESERVE"
  tags                        = var.tags

  dynamic "pod_identity_association" {
    for_each = each.value.role_arn == null ? [] : [each.value]
    content {
      service_account = pod_identity_association.value.service_account
      role_arn        = pod_identity_association.value.role_arn
    }
  }

  depends_on = [aws_vpc_endpoint.node_services]
}

data "aws_iam_role" "argocd_capability" {
  name = var.argocd_capability_role_name
}

data "aws_ssoadmin_instances" "argocd" {}

data "aws_identitystore_user" "argocd_admin" {
  identity_store_id = tolist(data.aws_ssoadmin_instances.argocd.identity_store_ids)[0]

  alternate_identifier {
    unique_attribute {
      attribute_path  = "UserName"
      attribute_value = "argocd-admin"
    }
  }
}

resource "aws_iam_role_policy_attachment" "argocd_secrets_readonly" {
  role       = data.aws_iam_role.argocd_capability.name
  policy_arn = "arn:aws:iam::aws:policy/AWSSecretsManagerClientReadOnlyAccess"
}

resource "aws_eks_capability" "argocd" {
  cluster_name              = aws_eks_cluster.this.name
  capability_name           = var.argocd_capability_name
  type                      = "ARGOCD"
  role_arn                  = data.aws_iam_role.argocd_capability.arn
  delete_propagation_policy = "RETAIN"
  tags                      = var.tags

  configuration {
    argo_cd {
      aws_idc {
        idc_instance_arn = var.argocd_identity_center_instance_arn
        idc_region       = var.aws_region
      }

      namespace = "argocd"

      rbac_role_mapping {
        role = "ADMIN"

        identity {
          id   = data.aws_identitystore_user.argocd_admin.user_id
          type = "SSO_USER"
        }
      }
    }
  }

  depends_on = [aws_iam_role_policy_attachment.argocd_secrets_readonly]
}
