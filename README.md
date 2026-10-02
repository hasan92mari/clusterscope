# ClusterScope on Azure AKS

This README documents the `azure-aks` branch only. Terraform provisions the Azure infrastructure and AKS platform; Argo CD deploys the Kubernetes application from this branch.

## Architecture

```text
                              Internet
                                 |
                         HTTPS :443 / DNS
                                 |
                 Application Gateway for Containers
                      (Azure ALB controller)
                                 |
                    Gateway API Gateway + HTTPRoute
                                 |
                         Frontend Service
                                 |
                        Frontend Deployment
                         /              \
              Backend Service       Redis Service
                     |                    |
             Backend Deployment   Redis StatefulSet + PVC
                     |
           Azure Database for PostgreSQL
             Flexible Server (managed)

 AKS Key Vault CSI add-on ----> Azure Key Vault
              |                     |
              +---- mounts/syncs PostgreSQL connection settings
                     as a Kubernetes Secret for the backend
```

### Azure infrastructure

- Resource group: `aks`, in `northcentralus`.
- AKS cluster: `cluster1-aks`, Kubernetes `1.35.7`; one Linux system pool starts with two `Standard_D2als_v7` nodes and autoscaling is configured from 2 to 5. No Availability Zones are assigned because this region reports no supported AKS zones for this cluster configuration.
- AKS networking uses Azure CNI Overlay with Cilium dataplane and network policies. AKS provides one managed outbound IP; Terraform uses that address to restrict the PostgreSQL firewall rule.
- The AKS Azure Key Vault Secrets Store CSI add-on creates a user-assigned managed identity. Terraform grants that identity read access to the application Key Vault secrets.
- Azure Database for PostgreSQL Flexible Server runs in `northcentralus` using PostgreSQL 16 and the `B_Standard_B1ms` SKU. Terraform creates the `clusterscope` database and permits inbound PostgreSQL only from the AKS outbound IP.
- Azure Key Vault stores the PostgreSQL username, password, database name, host, and port. The backend mounts a `SecretProviderClass`; the CSI driver reads the Key Vault entries and synchronizes them to the `clusterscope-postgres` Kubernetes Secret.
- AKS enables Gateway API and Application Gateway for Containers. The `ApplicationLoadBalancer` associates the controller with the AKS-managed `aks-appgateway` subnet.
- Argo CD is installed as an AKS cluster extension. The Gateway API and application load-balancer resources route HTTPS traffic to the frontend.

The Azure resource group, AKS nodes, public IP, PostgreSQL server, Key Vault, and Application Gateway for Containers incur Azure charges. Review the Azure pricing for the selected region/SKUs before deploying. AKS capacity is not guaranteed: Azure may temporarily reject cluster creation in a region even when the VM SKU and Kubernetes version are listed as supported.

### Application placement and traffic

- The browser connects to the generated Application Gateway for Containers hostname over HTTPS on port 443. The Gateway terminates TLS using the `clusterscope-tls` Secret and forwards `/` through the HTTPRoute to the frontend Service.
- The current `clusterscope-tls` certificate is a local `mkcert` development certificate. Browsers that do not trust its issuing CA will warn. For a public deployment, use a hostname you control and a publicly trusted certificate.
- The frontend calls the backend through the Kubernetes Service DNS name and connects to the in-cluster Redis Service for session/preferences data.
- Redis remains a Kubernetes StatefulSet with a 1 GiB PVC. Its data is cluster storage; it is not an Azure managed cache and is not automatically migrated if the AKS cluster is replaced.
- The backend connects to the managed PostgreSQL Flexible Server. PostgreSQL credentials and connection details are not committed in the Argo manifests; they come from Key Vault through the AKS CSI identity.
- Argo CD watches the `azure-aks` branch. The ApplicationSet deploys component directories under `argo/` and excludes `argo/postgres/`; PostgreSQL is managed by Terraform in Azure, not by an in-cluster StatefulSet. Redis remains in the `argo/redis/` application.

## Requirements

Install Terraform 1.5 or later, Azure CLI, `kubectl`, and Docker with Buildx. Sign in with an Azure identity that can provision the resources in this stack. The subscription must allow AKS creation in `northcentralus`, PostgreSQL Flexible Server creation there, the selected node VM SKU, and the required resource providers.

Terraform stores state in the Azure Storage backend configured in `aks-terraform/providers.tf`. The state resource group, storage account, and container must already exist, and your Azure identity must have access to them. Terraform state contains sensitive PostgreSQL credentials; protect it with storage encryption and tightly scoped access.

The manifests reference GHCR images under `ghcr.io/hasan92mari/`. Ensure the AKS nodes can pull those packages. If the packages are private, configure an image pull Secret.

## Provision with Terraform

From the repository root, sign in and select the intended subscription:

```sh
az login
az account set --subscription 4a63a39d-cb27-48c4-88f2-0c33a4b9dfdb
az account show
```

Initialize and review the infrastructure plan:

```sh
terraform -chdir=aks-terraform init
terraform -chdir=aks-terraform validate
terraform -chdir=aks-terraform plan
```

Review the full plan before applying. In particular, confirm the resource group and AKS region are `northcentralus`, and that PostgreSQL or Key Vault are not being destroyed unexpectedly. If Azure reports `AKSCapacityHeavyUsage`, the region is temporarily unable to accept a new AKS cluster; do not repeatedly apply an unchanged plan. Wait for capacity or choose another region and move all regional resources together.

Apply the infrastructure only after the plan is understood:

```sh
terraform -chdir=aks-terraform apply
```

The root stack creates AKS, PostgreSQL, its database and firewall rule, Key Vault secrets, the AKS CSI identity access, and the Argo CD extension. The Flexible Server and AKS are separate Azure resources even though they share a region and resource group.

## Connect to AKS and bootstrap Argo CD

Retrieve credentials and confirm the cluster is ready:

```sh
az aks get-credentials --resource-group aks --name cluster1-aks --overwrite-existing
kubectl get nodes -o wide
kubectl get pods -n argocd
```

The Terraform outputs provide the initial Argo CD password command and the Key Vault values used by the manifests:

```sh
terraform -chdir=aks-terraform output -raw argocd_admin_password_command
terraform -chdir=aks-terraform output -raw postgres_key_vault_name
terraform -chdir=aks-terraform output -raw key_vault_csi_addon_identity_client_id
terraform -chdir=aks-terraform output -raw azure_tenant_id
```

`argo/backend/secretproviderclass.yaml` and `argo/frontend/applicationLoadBalancer.yaml` contain the active Key Vault identity/name and Application Gateway subnet resource ID. Keep them consistent with the outputs and the current AKS node resource group when recreating the cluster.

Apply the AppProject and ApplicationSet bootstrap from the `azure-aks` branch:

```sh
kubectl apply -f argo/appset+project.yaml
```

Argo CD creates the frontend, backend, and Redis applications and syncs the manifests from this branch. PostgreSQL is excluded from the generated applications because Terraform owns the managed service.

## Build and deploy application images

The current Deployments reference the `latest` tag. Build and push the images from the repository root:

```sh
docker login ghcr.io -u hasan92mari

docker buildx build --platform linux/amd64 \
  --tag ghcr.io/hasan92mari/clusterscope-frontend:latest \
  --push ./frontend

docker buildx build --platform linux/amd64 \
  --tag ghcr.io/hasan92mari/clusterscope-backend:latest \
  --push ./backend
```

Use a GitHub token with package write access when Docker prompts for credentials. After pushing changes to `azure-aks`, Argo CD reconciles the application manifests. Monitor the workloads:

```sh
kubectl get applications -n argocd
kubectl get pods -A
kubectl rollout status deployment/clusterscope-frontend -n clusterscope-frontend
kubectl rollout status deployment/clusterscope-backend -n clusterscope-backend
```

## Access the application

Wait for the ApplicationLoadBalancer and Gateway to report ready/programmed:

```sh
kubectl get applicationloadbalancer -n clusterscope-frontend
kubectl get gateway clusterscope-gateway -n clusterscope-frontend --watch
```

Get the current hostname and use HTTPS explicitly. The Gateway listens on 443; `curl` without a scheme defaults to HTTP port 80, which is not configured here.

```sh
GATEWAY_HOST=$(kubectl get gateway clusterscope-gateway -n clusterscope-frontend \
  -o jsonpath='{.status.addresses[0].value}')
printf 'https://%s\n' "$GATEWAY_HOST"
curl -kI "https://${GATEWAY_HOST}"
```

`-k` skips certificate trust validation for this development certificate only. Do not use it as a production certificate workaround.

To open the Argo CD UI locally, forward its service and keep the command running:

```sh
kubectl -n argocd port-forward svc/argocd-server 8080:443
```

Browse to `https://localhost:8080`, sign in as `admin`, and use the password from the Terraform output command.

## Troubleshooting

```sh
kubectl get gateway,httproute -A
kubectl describe applicationloadbalancer clusterscope-alb -n clusterscope-frontend
kubectl get secretproviderclass -n clusterscope-backend
kubectl get pods -n clusterscope-backend -o wide
kubectl describe pod -n clusterscope-backend <pod-name>
kubectl logs deployment/clusterscope-backend -n clusterscope-backend
kubectl logs deployment/clusterscope-frontend -n clusterscope-frontend
```

For PostgreSQL connection problems, confirm the backend Secret was synchronized by CSI without printing its values:

```sh
kubectl get secret clusterscope-postgres -n clusterscope-backend -o json | jq -r '.data | keys[]'
```

Expected keys are `username`, `password`, `database`, `host`, and `port`. Also confirm the PostgreSQL firewall permits the AKS managed outbound IP and that Terraform is reading the IP from the newly created cluster.

## Teardown and data safety

Deleting AKS also deletes the in-cluster Redis StatefulSet and its PVC data. PostgreSQL is a separate managed service; deleting it can permanently remove application data. Back up data before any destructive operation.

Review the destroy plan and only continue when you intend to remove all listed resources:

```sh
terraform -chdir=aks-terraform plan -destroy
terraform -chdir=aks-terraform destroy
```

The Terraform state storage account/container are configured as a separate backend and are not created by this root. Protect the state and do not delete it as a substitute for destroying or recovering infrastructure.
