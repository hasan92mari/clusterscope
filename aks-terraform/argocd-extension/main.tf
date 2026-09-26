terraform {
  required_providers {
    azapi = {
      source  = "Azure/azapi"
      version = "~> 2.10"
    }
  }
}

variable "cluster_id" {
  description = "ARM resource ID of the AKS cluster, passed from the root module."
  type        = string
}

resource "azapi_resource" "argocd_extension" {
  type      = "Microsoft.KubernetesConfiguration/extensions@2023-05-01"
  name      = "argocd"
  parent_id = var.cluster_id

  body = {
    properties = {
      extensionType           = "Microsoft.ArgoCD"
      autoUpgradeMinorVersion = true
      configurationSettings = {
        "redis-ha.enabled"                        = "false"
        "configs.params.application\\.namespaces" = "argocd"
      }
    }
  }
}
