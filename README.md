# ClusterScope: AWS EKS

This branch provisions the ClusterScope demo platform on AWS EKS and deploys its application through Argo CD. Terraform manages AWS infrastructure and cluster add-ons; Argo CD manages the Kubernetes application manifests in `argo/`.

## Architecture

```text
Internet
  |
  | HTTPS :443 (ACM demo certificate)
  v
Internet-facing ALB
  |
  | AWS Load Balancer Controller + Gateway API
  v
Gateway -> HTTPRoute -> Frontend Deployment
                         |             |
                         |             +--> ElastiCache Redis (TLS, auth)
                         v
                   Backend Deployment
                         |
                         +--> RDS PostgreSQL

EKS nodes in private subnets -- outbound internet --> NAT Gateway --> Internet Gateway
```

### AWS resources

- An EKS control plane running the Kubernetes version configured in `eks-terraform/variables.tf`.
- An on-demand managed node group using `t3.small` instances across the configured private subnets. Its current min, desired, and max sizes are defined in `eks-terraform/main.tf`.
- A NAT Gateway and Elastic IP for node egress. The existing VPC, subnets, route tables, and Internet Gateway are inputs and are not created by this stack.
- EKS add-ons for VPC CNI, CoreDNS, kube-proxy, Pod Identity, EBS CSI, metrics, and node monitoring.
- RDS PostgreSQL and ElastiCache Redis in private subnets. Both are single-AZ demo configurations. PostgreSQL uses encrypted `gp3` storage; Redis uses authentication and in-transit and at-rest encryption.
- AWS Secrets Manager entries containing generated database credentials and connection endpoints. External Secrets Operator reads them using EKS Pod Identity and creates Kubernetes Secrets for the workloads.
- An internet-facing ALB managed by AWS Load Balancer Controller from the Gateway API resources. The demo ACM certificate is self-signed; browsers will warn, and its sample DNS name does not match the ALB hostname.
- EKS-managed Argo CD, AWS Load Balancer Controller, External Secrets Operator, and the `aws-alb` GatewayClass.

RDS and ElastiCache add ongoing AWS charges. The managed database resources and credentials are also recorded in Terraform state; store state encrypted and restrict access. This setup creates new managed databases: it does not migrate data from the former in-cluster PostgreSQL or Redis StatefulSets.

## Application flow

- The browser connects to the ALB over HTTPS on port 443. The Gateway and HTTPRoute send requests to the frontend Service.
- The frontend serves the UI, calls the backend Service, and uses Redis for session/preferences data. Its Redis connection uses TLS.
- The backend connects to RDS PostgreSQL for persistent application data.
- Network security groups allow PostgreSQL port 5432 and Redis port 6379 from the EKS cluster security group. The data services are not publicly accessible.
- Argo CD watches the `aws-eks` branch. The ApplicationSet creates applications from component directories under `argo/`, excluding the bootstrap manifests and the old `argo/postgres/` and `argo/redis/` workloads.

## Requirements

- Terraform 1.5 or later, AWS CLI, `kubectl`, Docker with Buildx, and AWS credentials with permissions for the resources in this stack.
- The existing VPC, private EKS subnets in at least two Availability Zones, public ALB subnets, Internet Gateway, EKS cluster role, and the IAM roles/Identity Center settings configured by the Terraform variables.
- Access to the GitHub Container Registry packages `ghcr.io/hasan92mari/clusterscope-frontend` and `ghcr.io/hasan92mari/clusterscope-backend`.

Review `eks-terraform/variables.tf` and any local `terraform.tfvars` before provisioning. The defaults are specific to the current AWS environment; update them for another account or VPC. Restrict `public_access_cidrs` to trusted addresses for a real environment.

## Provision AWS and EKS

Run from the repository root:

```sh
aws sts get-caller-identity
terraform -chdir=eks-terraform init
terraform -chdir=eks-terraform plan
```

Review the complete plan before applying. It must use the correct state for the existing EKS environment. If Terraform proposes creating an EKS cluster, NAT Gateway, or other infrastructure that already exists, stop and select or reconcile the intended state before continuing; do not apply a plan that would duplicate resources.

After the plan is understood and approved:

```sh
terraform -chdir=eks-terraform apply
terraform -chdir=eks-terraform output -raw update_kubeconfig_command
```

Run the printed kubeconfig command, then check the cluster:

```sh
kubectl get nodes -L topology.kubernetes.io/zone
```

The root stack also bootstraps the shared Gateway API/controller CRDs required by the add-ons stack.

## Install cluster add-ons

The second Terraform root manages Helm and Kubernetes resources that need an active cluster and installed CRDs:

```sh
terraform -chdir=eks-terraform/addons init
terraform -chdir=eks-terraform/addons plan
terraform -chdir=eks-terraform/addons apply
```

Review this plan too. It installs the AWS Load Balancer Controller, External Secrets Operator, and the `aws-alb` GatewayClass. Keep `aws_region`, `cluster_name`, `vpc_id`, and `aws_cli_path` consistent with the root configuration; set a local `eks-terraform/addons/terraform.tfvars` if the AWS CLI executable path differs.

## Build and publish application images

The Argo Deployments use the `eks` tag. Build for the x86-64 architecture used by the configured `t3` nodes, then push both images to GHCR:

```sh
docker login ghcr.io -u hasan92mari

docker buildx build --platform linux/amd64 \
  --tag ghcr.io/hasan92mari/clusterscope-frontend:eks \
  --push ./frontend

docker buildx build --platform linux/amd64 \
  --tag ghcr.io/hasan92mari/clusterscope-backend:eks \
  --push ./backend
```

When `docker login` prompts for a password, use a GitHub token with package write permission. Make sure the packages are readable by EKS; configure an image pull Secret if they are private.

## Deploy with Argo CD

Push the desired Argo manifest changes to the `aws-eks` branch. Argo CD automatically reconciles the application directories. For a manual refresh/sync, use the Argo CD UI or CLI for the frontend and backend applications.

The backend and frontend ExternalSecrets obtain their connection details from Secrets Manager. Check the resulting resources without printing secret values:

```sh
kubectl get externalsecret,secretstore -n clusterscope-backend
kubectl get secret clusterscope-postgres -n clusterscope-backend -o json | jq -r '.data | keys[]'
kubectl get externalsecret -n clusterscope-frontend
kubectl get secret clusterscope-frontend-redis -n clusterscope-frontend -o json | jq -r '.data | keys[]'
```

After syncing a new image, wait for rollout:

```sh
kubectl rollout status deployment/clusterscope-frontend -n clusterscope-frontend
kubectl rollout status deployment/clusterscope-backend -n clusterscope-backend
```

## Access and troubleshooting

Get the public address and test the HTTPS listener. `-k` bypasses certificate trust validation for this self-signed demo only:

```sh
kubectl get gateway clusterscope-gateway -n clusterscope-frontend
curl -kI https://<gateway-address>
```

Useful checks:

```sh
kubectl get pods -A
kubectl get gateway,httproute -A
kubectl describe externalsecret clusterscope-postgres -n clusterscope-backend
kubectl logs deployment/clusterscope-backend -n clusterscope-backend
kubectl logs deployment/clusterscope-frontend -n clusterscope-frontend
```

The Gateway listener is HTTPS on port 443; use `https://` in the browser or `curl`. An ALB address with no scheme or with `http://` attempts port 80, which this Gateway does not configure.

## Teardown

Back up any RDS data that must be retained. Deleting the Terraform-managed database or its state can permanently remove data; the demo configuration skips a final RDS snapshot. Remove/prune the Argo applications while their controllers are available, then review and run:

```sh
terraform -chdir=eks-terraform/addons destroy
terraform -chdir=eks-terraform destroy
```

The existing VPC and subnets are not destroyed by Terraform. Review the plans carefully; do not destroy shared resources that are used by other workloads.