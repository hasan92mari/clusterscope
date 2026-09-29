locals {
  controller_chart_version = "1.14.0"

  controller_values = {
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
  }
}

resource "helm_release" "aws_load_balancer_controller" {
  name       = "aws-load-balancer-controller"
  repository = "https://aws.github.io/eks-charts"
  chart      = "aws-load-balancer-controller"
  version    = local.controller_chart_version
  namespace  = "kube-system"
  timeout    = 900
  wait       = true

  values = [yamlencode(local.controller_values)]
}

resource "kubernetes_manifest" "alb_gatewayclass" {
  manifest = {
    apiVersion = "gateway.networking.k8s.io/v1"
    kind       = "GatewayClass"
    metadata = {
      name = "aws-alb"
    }
    spec = {
      controllerName = "gateway.k8s.aws/alb"
    }
  }

  depends_on = [helm_release.aws_load_balancer_controller]
}
