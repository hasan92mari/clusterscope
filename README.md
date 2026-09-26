# ClusterScope — Azure AKS

This branch, `azure-aks`, contains the cloud deployment configuration for ClusterScope on Azure Kubernetes Service (AKS). It focuses on the cluster infrastructure and the steps needed to deploy and access it; application internals are documented separately.

## Cluster design

Terraform provisions the AKS cluster and its Azure integrations:

- One Linux `agentpool`, starting with 2 nodes and autoscaling from 2 to 5.
- Azure CNI in Overlay mode, with Cilium as the dataplane and network policy engine.
- AKS Gateway API support and the Application Gateway for Containers integration with its ALB controller enabled.
- The Microsoft Argo CD cluster extension. Terraform creates the cluster first, then creates the extension using the cluster resource ID.

Argo CD uses `argo/appset+project.yaml` to create the project and ApplicationSet. The ApplicationSet tracks the `azure-aks` branch. Push this branch to the configured Git repository before applying that manifest.

## Requirements and Azure login

Install Terraform, Azure CLI, and `kubectl`. Sign in with the same Azure account that has access to the subscription and AKS resources:

```bash
az login
az account set --subscription 4a63a39d-cb27-48c4-88f2-0c33a4b9dfdb
```

Terraform state uses the Azure Storage backend configured in `aks-terraform/providers.tf`; the state resource group, storage account, and container must exist and be accessible.

## Provision the cluster and Argo CD

Run Terraform from the `aks-terraform` root. The Argo CD extension is a module in this root, so Terraform creates it after the AKS cluster:

```bash
cd aks-terraform
terraform init
terraform plan
terraform apply
```

Terraform prints these command outputs after a successful apply. To print them again:

```bash
terraform output -raw aks_get_credentials_command
terraform output -raw argocd_admin_password_command
```

## Connect to AKS locally

Make sure Azure CLI is signed in to the same account and subscription used to provision the cluster. Retrieve the cluster credentials:

```bash
az aks get-credentials --resource-group aks --name cluster1-aks --overwrite-existing
kubectl get nodes
```

## Access the Argo CD UI

Run the password command from Terraform output after the extension is ready. It reads and decodes the initial admin password from the Kubernetes Secret:

```bash
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d
```

In a second terminal, forward the Argo CD server service to localhost:

```bash
kubectl -n argocd port-forward svc/argocd-server 8080:443
```

Open <https://localhost:8080> and sign in as `admin` with the password from the previous command. Keep the port-forward process running while using the UI.

## Deploy the Argo CD project and ApplicationSet

After connecting to the cluster and confirming the Argo CD extension is ready, apply the project and ApplicationSet:

```bash
kubectl apply -f argo/appset+project.yaml
```

The ApplicationSet discovers the component directories under `argo/` and creates an Argo CD Application for each one. The source revision is `azure-aks`.

## Find the Application Gateway address

The Gateway address appears after the frontend application is synced and Azure provisions the Application Gateway for Containers load balancer. Provisioning can take several minutes. Watch the Gateway status:

```bash
kubectl get gateway -n clusterscope-frontend clusterscope-gateway --watch
```

Print its assigned address or hostname with:

```bash
kubectl get gateway -n clusterscope-frontend clusterscope-gateway \
  -o jsonpath='{.status.addresses[0].value}{"\n"}'
```

You can also open the `clusterscope-frontend` Application in the Argo CD UI and follow the external redirect/link shown for the frontend Deployment after it becomes ready. `kubectl get gatewayclasses.gateway.networking.k8s.io` shows GatewayClass information; use `kubectl get gateway` to see the assigned address.

## Destroy the Azure deployment

From `aks-terraform`, destroy the Terraform-managed deployment:

```bash
terraform destroy
```

This removes the AKS cluster and deletes the `aks` resource group, including any other resources placed in that group. It is destructive and can remove workload data. Review the plan before confirming.
