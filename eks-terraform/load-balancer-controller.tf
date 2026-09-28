# A self-signed certificate is sufficient for a TLS learning/demo endpoint,
# but browsers and clients will warn because it is not publicly trusted.
resource "tls_private_key" "alb_demo" {
  algorithm = "RSA"
  rsa_bits  = 2048
}

resource "tls_self_signed_cert" "alb_demo" {
  private_key_pem       = tls_private_key.alb_demo.private_key_pem
  validity_period_hours = 8760
  dns_names             = ["clusterscope-demo.example.com"]
  allowed_uses = [
    "key_encipherment",
    "digital_signature",
    "server_auth",
  ]

  subject {
    common_name  = "clusterscope-demo.example.com"
    organization = "ClusterScope demo"
  }
}

resource "aws_acm_certificate" "alb_demo" {
  private_key      = tls_private_key.alb_demo.private_key_pem
  certificate_body = tls_self_signed_cert.alb_demo.cert_pem

  tags = merge(var.tags, {
    Name = "${var.cluster_name}-alb-demo-self-signed"
  })
}

locals {
  alb_target_group_configuration_yaml = yamlencode({
    apiVersion = "gateway.k8s.aws/v1beta1"
    kind       = "TargetGroupConfiguration"
    metadata = {
      name      = "clusterscope-frontend-targets"
      namespace = "clusterscope-frontend"
    }
    spec = {
      targetReference = {
        kind = "Service"
        name = "clusterscope-frontend"
      }
      defaultConfiguration = {
        targetType = "ip"
      }
    }
  })

  alb_load_balancer_configuration_yaml = yamlencode({
    apiVersion = "gateway.k8s.aws/v1beta1"
    kind       = "LoadBalancerConfiguration"
    metadata = {
      name      = "clusterscope-frontend-alb"
      namespace = "clusterscope-frontend"
    }
    spec = {
      scheme = "internet-facing"
      listenerConfigurations = [{
        protocolPort       = "HTTPS:443"
        defaultCertificate = aws_acm_certificate.alb_demo.arn
      }]
    }
  })

  alb_gatewayclass_yaml = yamlencode({
    apiVersion = "gateway.networking.k8s.io/v1"
    kind       = "GatewayClass"
    metadata = {
      name = "aws-alb"
    }
    spec = {
      controllerName = "gateway.k8s.aws/alb"
      parametersRef = {
        group     = "gateway.k8s.aws"
        kind      = "LoadBalancerConfiguration"
        name      = "clusterscope-frontend-alb"
        namespace = "clusterscope-frontend"
      }
    }
  })

  alb_controller_configuration_yaml = join("\n---\n", [
    local.alb_target_group_configuration_yaml,
    local.alb_load_balancer_configuration_yaml,
  ])

  alb_controller_helm_values_yaml = yamlencode({
    clusterName = var.cluster_name
    region      = var.aws_region
    vpcId       = var.vpc_id

    serviceAccount = {
      create = true
      name   = "aws-load-balancer-controller"
    }

    controllerConfig = {
      featureGates = {
        ALBGatewayAPI = true
      }
    }

    enableServiceMutatorWebhook = false
  })
}

resource "helm_release" "aws_load_balancer_controller" {
  name       = "aws-load-balancer-controller"
  repository = "https://aws.github.io/eks-charts"
  chart      = "aws-load-balancer-controller"
  version    = "1.14.0"
  namespace  = "kube-system"
  timeout    = 900
  wait       = true

  values = [local.alb_controller_helm_values_yaml]

  depends_on = [
    aws_eks_node_group.this,
    aws_eks_pod_identity_association.load_balancer_controller,
    aws_iam_role_policy_attachment.load_balancer_controller,
    aws_ec2_tag.alb_public_subnet_role,
    aws_ec2_tag.alb_public_subnet_cluster,
  ]
}

resource "terraform_data" "frontend_namespace" {
  input = {
    aws_cli_path = var.aws_cli_path
    aws_region   = var.aws_region
    cluster_name = var.cluster_name
    namespace    = "clusterscope-frontend"
  }

  triggers_replace = [
    var.aws_cli_path,
    var.aws_region,
    var.cluster_name,
    "clusterscope-frontend",
  ]

  provisioner "local-exec" {
    command = <<-EOT
      "${self.input.aws_cli_path}" eks update-kubeconfig --region "${self.input.aws_region}" --name "${self.input.cluster_name}"
      kubectl create namespace "${self.input.namespace}" --dry-run=client -o yaml | kubectl apply -f -
    EOT
  }
}

resource "kubernetes_manifest" "alb_target_group_configuration" {
  manifest = yamldecode(local.alb_target_group_configuration_yaml)

  depends_on = [
    helm_release.aws_load_balancer_controller,
    terraform_data.frontend_namespace,
  ]
}

resource "kubernetes_manifest" "alb_gateway_configuration" {
  manifest = yamldecode(local.alb_load_balancer_configuration_yaml)

  depends_on = [kubernetes_manifest.alb_target_group_configuration]
}

resource "kubernetes_manifest" "alb_gatewayclass" {
  manifest = yamldecode(local.alb_gatewayclass_yaml)

  depends_on = [kubernetes_manifest.alb_gateway_configuration]
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
  cluster_name    = var.cluster_name
  namespace       = "kube-system"
  service_account = "aws-load-balancer-controller"
  role_arn        = aws_iam_role.load_balancer_controller.arn

  depends_on = [aws_eks_addon.this["eks-pod-identity-agent"]]
}
data "aws_eks_cluster" "this" {
  name = var.cluster_name
}

provider "kubernetes" {
  host                   = data.aws_eks_cluster.this.endpoint
  cluster_ca_certificate = base64decode(data.aws_eks_cluster.this.certificate_authority[0].data)

  exec {
    api_version = "client.authentication.k8s.io/v1beta1"
    command     = var.aws_cli_path
    args = [
      "eks", "get-token",
      "--cluster-name", var.cluster_name,
      "--region", var.aws_region,
    ]
  }
}

provider "helm" {
  kubernetes = {
    host                   = data.aws_eks_cluster.this.endpoint
    cluster_ca_certificate = base64decode(data.aws_eks_cluster.this.certificate_authority[0].data)

    exec = {
      api_version = "client.authentication.k8s.io/v1beta1"
      command     = var.aws_cli_path
      args = [
        "eks", "get-token",
        "--cluster-name", var.cluster_name,
        "--region", var.aws_region,
      ]
    }
  }
}
