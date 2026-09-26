resource "azurerm_resource_group" "aks" {
  name     = "aks"
  location = "eastus2"
}

resource "azapi_resource" "res-0" {
  body = {
    kind = "Base"
    properties = {
      addonProfiles = {
        azureKeyvaultSecretsProvider = {
          config  = null
          enabled = false
        }
        azurepolicy = {
          config  = null
          enabled = false
        }
      }
      agentPoolProfiles = [{
        availabilityZones   = ["2", "3"]
        count               = 2
        enableAutoScaling   = true
        enableFIPS          = false
        enableNodePublicIP  = false
        kubeletDiskType     = "OS"
        maxCount            = 5
        maxPods             = 110
        minCount            = 2
        mode                = "System"
        name                = "agentpool"
        orchestratorVersion = "1.35.8"
        osDiskSizeGB        = 128
        osDiskType          = "Managed"
        osSKU               = "Ubuntu"
        osType              = "Linux"
        powerState = {
          code = "Running"
        }
        scaleDownMode = "Delete"
        securityProfile = {
          enableSecureBoot = false
          enableVTPM       = false
          sshAccess        = "LocalUser"
        }
        type = "VirtualMachineScaleSets"
        upgradeSettings = {
          maxSurge       = "10%"
          maxUnavailable = "0"
        }
        upgradeStrategy = "Rolling"
        vmSize          = "Standard_D2als_v7"
      }]
      apiServerAccessProfile = {
        enablePrivateCluster = false
      }
      autoScalerProfile = {
        balance-similar-node-groups           = "false"
        daemonset-eviction-for-empty-nodes    = false
        daemonset-eviction-for-occupied-nodes = true
        expander                              = "random"
        ignore-daemonsets-utilization         = false
        max-empty-bulk-delete                 = "10"
        max-graceful-termination-sec          = "600"
        max-node-provision-time               = "15m"
        max-total-unready-percentage          = "45"
        new-pod-scale-up-delay                = "0s"
        ok-total-unready-count                = "3"
        scale-down-delay-after-add            = "10m"
        scale-down-delay-after-delete         = "10s"
        scale-down-delay-after-failure        = "3m"
        scale-down-unneeded-time              = "10m"
        scale-down-unready-time               = "20m"
        scale-down-utilization-threshold      = "0.5"
        scan-interval                         = "10s"
        skip-nodes-with-local-storage         = "false"
        skip-nodes-with-system-pods           = "true"
      }
      autoUpgradeProfile = {
        nodeOSUpgradeChannel = "NodeImage"
        upgradeChannel       = "none"
      }
      bootstrapProfile = {
        artifactSource = "Direct"
      }
      disableLocalAccounts = false
      dnsPrefix            = "cluster1-aks-dns"
      enableRBAC           = true
      hostedSystemProfile = {
        enabled = false
      }
      ingressProfile = {
        applicationLoadBalancer = {
          enabled = true
        }
        gatewayAPI = {
          installation = "Standard"
        }
      }
      kubernetesVersion = "1.35.8"
      metricsProfile = {
        costAnalysis = {
          enabled = false
        }
      }
      networkProfile = {
        advancedNetworking = {
          enabled = false
          observability = {
            enabled = false
          }
          performance = {
            accelerationMode = "None"
          }
          security = {
            advancedNetworkPolicies = "None"
            enabled                 = false
          }
        }
        dnsServiceIP    = "10.0.0.10"
        ipFamilies      = ["IPv4"]
        kubeProxyConfig = {}
        loadBalancerProfile = {
          backendPoolType = "nodeIPConfiguration"
          managedOutboundIPs = {
            count = 1
          }
        }
        loadBalancerSku    = "standard"
        networkDataplane   = "cilium"
        networkPlugin      = "azure"
        networkPluginMode  = "overlay"
        networkPolicy      = "cilium"
        outboundType       = "loadBalancer"
        podCidr            = "10.244.0.0/16"
        podCidrs           = ["10.244.0.0/16"]
        podLinkLocalAccess = "IMDS"
        serviceCidr        = "10.0.0.0/16"
        serviceCidrs       = ["10.0.0.0/16"]
      }
      nodeProvisioningProfile = {
        mode = "Manual"
      }
      nodeResourceGroup = "MC_aks_cluster1-aks_eastus"
      oidcIssuerProfile = {
        enabled = true
      }
      securityProfile = {
        imageCleaner = {
          enabled       = true
          intervalHours = 168
        }
        workloadIdentity = {
          enabled = true
        }
      }
      servicePrincipalProfile = {
        clientId = "msi"
      }
      storageProfile = {
        diskCSIDriver = {
          enabled = true
        }
        fileCSIDriver = {
          enabled = true
        }
        snapshotController = {
          enabled = true
        }
      }
      supportPlan               = "KubernetesOfficial"
      workloadAutoScalerProfile = {}
    }
    sku = {
      name = "Base"
      tier = "Free"
    }
  }
  location  = "eastus2"
  name      = "cluster1-aks"
  parent_id = azurerm_resource_group.aks.id
  type      = "Microsoft.ContainerService/managedclusters@2025-10-02-preview"
  identity {
    identity_ids = []
    type         = "SystemAssigned"
  }
}

module "argocd_extension" {
  source = "./argocd-extension"

  cluster_id = azapi_resource.res-0.id
}

output "aks_get_credentials_command" {
  description = "Run this command to merge AKS credentials into your kubeconfig."
  value       = "az aks get-credentials --resource-group ${azurerm_resource_group.aks.name} --name ${azapi_resource.res-0.name} --overwrite-existing"
}

output "argocd_admin_password_command" {
  description = "Run this command after retrieving AKS credentials to read the initial Argo CD admin password."
  value       = "kubectl get secret argocd-initial-admin-secret -n argocd --template='{{index .data \"password\" | base64decode}}'"
  depends_on  = [module.argocd_extension]
}
