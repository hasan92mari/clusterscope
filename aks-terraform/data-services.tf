data "azurerm_client_config" "current" {}

locals {
  aks_outbound_ip_resource_id = data.azapi_resource.aks.output.properties.networkProfile.loadBalancerProfile.effectiveOutboundIPs[0].id
  aks_outbound_ip_name        = element(split("/", local.aks_outbound_ip_resource_id), 8)
  aks_node_resource_group     = element(split("/", local.aks_outbound_ip_resource_id), 4)

  key_vault_csi_identity_resource_id = data.azapi_resource.aks.output.properties.addonProfiles.azureKeyvaultSecretsProvider.identity.resourceId
  key_vault_csi_identity_name        = element(split("/", local.key_vault_csi_identity_resource_id), 8)
  key_vault_csi_resource_group       = element(split("/", local.key_vault_csi_identity_resource_id), 4)
}

data "azapi_resource" "aks" {
  type        = "Microsoft.ContainerService/managedClusters@2025-10-02-preview"
  resource_id = azapi_resource.cluster1-aks.id

  response_export_values = [
    "properties.networkProfile.loadBalancerProfile.effectiveOutboundIPs",
    "properties.addonProfiles.azureKeyvaultSecretsProvider.identity",
  ]
}

data "azurerm_public_ip" "aks_outbound" {
  name                = local.aks_outbound_ip_name
  resource_group_name = local.aks_node_resource_group
}

data "azurerm_user_assigned_identity" "key_vault_csi" {
  name                = local.key_vault_csi_identity_name
  resource_group_name = local.key_vault_csi_resource_group
}

resource "random_password" "postgres_admin" {
  length  = 32
  special = false
}

resource "random_string" "key_vault_suffix" {
  length  = 8
  lower   = true
  upper   = false
  numeric = true
  special = false

  keepers = {
    location = local.location
  }
}

resource "azurerm_postgresql_flexible_server" "clusterscope" {
  name                          = "clusterscope-pg-${random_string.key_vault_suffix.result}"
  resource_group_name           = azurerm_resource_group.aks.name
  location                      = local.location
  version                       = "16"
  administrator_login           = "clusterscopeadmin"
  administrator_password        = random_password.postgres_admin.result
  sku_name                      = "B_Standard_B1ms"
  storage_mb                    = 32768
  backup_retention_days         = 7
  auto_grow_enabled             = true
  public_network_access_enabled = true

  tags = {
    application = "clusterscope"
    environment = "aks"
  }
}

resource "azurerm_postgresql_flexible_server_database" "clusterscope" {
  name      = "clusterscope"
  server_id = azurerm_postgresql_flexible_server.clusterscope.id
  collation = "en_US.utf8"
  charset   = "UTF8"
}

resource "azurerm_postgresql_flexible_server_firewall_rule" "aks_egress" {
  name             = "aks-managed-egress"
  server_id        = azurerm_postgresql_flexible_server.clusterscope.id
  start_ip_address = data.azurerm_public_ip.aks_outbound.ip_address
  end_ip_address   = data.azurerm_public_ip.aks_outbound.ip_address
}

resource "azurerm_key_vault" "clusterscope" {
  name                       = "clusterscope-${random_string.key_vault_suffix.result}"
  location                   = local.location
  resource_group_name        = azurerm_resource_group.aks.name
  tenant_id                  = data.azurerm_client_config.current.tenant_id
  sku_name                   = "standard"
  rbac_authorization_enabled = false
  soft_delete_retention_days = 7
  purge_protection_enabled   = true

  access_policy {
    tenant_id = data.azurerm_client_config.current.tenant_id
    object_id = data.azurerm_client_config.current.object_id

    secret_permissions = ["Get", "List", "Set", "Delete", "Recover", "Backup", "Restore"]
  }

  access_policy {
    tenant_id = data.azurerm_client_config.current.tenant_id
    object_id = data.azurerm_user_assigned_identity.key_vault_csi.principal_id

    secret_permissions = ["Get", "List"]
  }

  tags = {
    application = "clusterscope"
    environment = "aks"
  }
}

resource "azurerm_key_vault_secret" "postgres_username" {
  name         = "postgres-username"
  value        = azurerm_postgresql_flexible_server.clusterscope.administrator_login
  key_vault_id = azurerm_key_vault.clusterscope.id

  depends_on = [azurerm_key_vault.clusterscope]
}

resource "azurerm_key_vault_secret" "postgres_password" {
  name         = "postgres-password"
  value        = random_password.postgres_admin.result
  key_vault_id = azurerm_key_vault.clusterscope.id

  depends_on = [azurerm_key_vault.clusterscope]
}

resource "azurerm_key_vault_secret" "postgres_database" {
  name         = "postgres-database"
  value        = azurerm_postgresql_flexible_server_database.clusterscope.name
  key_vault_id = azurerm_key_vault.clusterscope.id

  depends_on = [azurerm_key_vault.clusterscope]
}

resource "azurerm_key_vault_secret" "postgres_host" {
  name         = "postgres-host"
  value        = azurerm_postgresql_flexible_server.clusterscope.fqdn
  key_vault_id = azurerm_key_vault.clusterscope.id

  depends_on = [azurerm_key_vault.clusterscope]
}

resource "azurerm_key_vault_secret" "postgres_port" {
  name         = "postgres-port"
  value        = "5432"
  key_vault_id = azurerm_key_vault.clusterscope.id

  depends_on = [azurerm_key_vault.clusterscope]
}

output "postgres_fqdn" {
  description = "Azure Database for PostgreSQL Flexible Server host name."
  value       = azurerm_postgresql_flexible_server.clusterscope.fqdn
}

output "postgres_key_vault_name" {
  description = "Key Vault containing the PostgreSQL application credentials and connection settings."
  value       = azurerm_key_vault.clusterscope.name
}

output "key_vault_csi_addon_identity_client_id" {
  description = "Client ID for the AKS Key Vault CSI add-on identity; set it in the Argo SecretProviderClass."
  value       = data.azurerm_user_assigned_identity.key_vault_csi.client_id
}

output "azure_tenant_id" {
  description = "Azure tenant ID required by the Key Vault CSI provider configuration."
  value       = data.azurerm_client_config.current.tenant_id
}