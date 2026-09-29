locals {
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

  bootstrap_addons = {
    for name, addon in local.addons : name => addon
    if contains(["vpc-cni", "kube-proxy", "eks-pod-identity-agent"], name)
  }

  post_node_addons = {
    for name, addon in local.addons : name => addon
    if !contains(["vpc-cni", "kube-proxy", "eks-pod-identity-agent"], name)
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
    aws_route.node_default_egress,
    aws_eks_addon.bootstrap,
  ]
}

resource "aws_eks_addon" "bootstrap" {
  for_each = local.bootstrap_addons

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
}

resource "aws_eks_addon" "post_node" {
  for_each = local.post_node_addons

  cluster_name                = aws_eks_cluster.this.name
  addon_name                  = each.key
  addon_version               = each.value.version
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

  depends_on = [aws_eks_node_group.this]
}

resource "aws_iam_policy" "load_balancer_controller" {
  name        = "${var.cluster_name}-aws-load-balancer-controller"
  description = "Permissions for AWS Load Balancer Controller ${var.cluster_name}"
  policy      = file("${path.module}/aws-load-balancer-controller-iam-policy.json")
  tags        = var.tags
}

resource "aws_iam_role" "load_balancer_controller" {
  name = "${var.cluster_name}-aws-load-balancer-controller"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Service = "pods.eks.amazonaws.com"
      }
      Action = ["sts:AssumeRole", "sts:TagSession"]
    }]
  })

  tags = var.tags
}

resource "aws_iam_role_policy_attachment" "load_balancer_controller" {
  role       = aws_iam_role.load_balancer_controller.name
  policy_arn = aws_iam_policy.load_balancer_controller.arn
}

resource "aws_eks_pod_identity_association" "load_balancer_controller" {
  cluster_name    = aws_eks_cluster.this.name
  namespace       = "kube-system"
  service_account = "aws-load-balancer-controller"
  role_arn        = aws_iam_role.load_balancer_controller.arn

  depends_on = [aws_eks_addon.bootstrap["eks-pod-identity-agent"]]
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

}

# This demo lets Argo CD deploy future applications without Terraform needing
# to know their namespaces or resource types. AppProject policies in Git remain
# the deployment guardrail for applications submitted through Argo CD.
resource "aws_eks_access_policy_association" "argocd_cluster_admin" {
  cluster_name  = aws_eks_cluster.this.name
  principal_arn = data.aws_iam_role.argocd_capability.arn
  policy_arn    = "arn:aws:eks::aws:cluster-access-policy/AmazonEKSClusterAdminPolicy"

  access_scope {
    type = "cluster"
  }

  depends_on = [aws_eks_capability.argocd]
}

# Install shared API schemas after EKS and its worker nodes are ready. These
# CRDs are cluster configuration, not billable AWS resources. Terraform tracks
# the bootstrap trigger; the Kubernetes/Helm add-on resources remain tracked in
# the separate addons state where their schemas are available during planning.
resource "terraform_data" "gateway_api_crds" {
  input = {
    aws_cli_path = var.aws_cli_path
    aws_region   = var.aws_region
    cluster_name = var.cluster_name
  }

  triggers_replace = [
    aws_eks_cluster.this.id,
    "v1.6.0",
    "v2.14.1",
  ]

  provisioner "local-exec" {
    interpreter = ["/bin/bash", "-c"]
    command     = <<-EOT
      set -euo pipefail

      "${self.input.aws_cli_path}" eks update-kubeconfig \
        --region "${self.input.aws_region}" \
        --name "${self.input.cluster_name}"

      kubectl wait --for=condition=Ready nodes --all --timeout=15m

      kubectl apply --server-side=true \
        -f "https://github.com/kubernetes-sigs/gateway-api/releases/download/$${GATEWAY_API_VERSION}/standard-install.yaml"
      kubectl wait --for=condition=Established --timeout=120s \
        crd/gatewayclasses.gateway.networking.k8s.io \
        crd/gateways.gateway.networking.k8s.io \
        crd/httproutes.gateway.networking.k8s.io

      kubectl apply \
        -f "https://raw.githubusercontent.com/kubernetes-sigs/aws-load-balancer-controller/$${AWS_LBC_VERSION}/config/crd/gateway/gateway-crds.yaml"
      kubectl wait --for=condition=Established --timeout=120s \
        crd/loadbalancerconfigurations.gateway.k8s.aws \
        crd/targetgroupconfigurations.gateway.k8s.aws \
        crd/listenerruleconfigurations.gateway.k8s.aws
    EOT

    environment = {
      GATEWAY_API_VERSION = "v1.6.0"
      AWS_LBC_VERSION     = "v2.14.1"
    }
  }

  depends_on = [
    aws_eks_node_group.this,
    aws_eks_addon.post_node,
  ]
}
