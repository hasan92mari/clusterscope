# EKS cluster with a fixed managed node group

This Terraform configuration manages `cluster1-eks` in `eu-north-1` with Kubernetes `1.36`, IPv4 networking, public and private API endpoints, and the selected EKS add-ons. EKS Auto Mode is disabled. Terraform creates an EKS managed node group with exactly two on-demand `t3.small` instances.

## Requirements before applying

- Terraform 1.5 or newer and AWS credentials with permission to manage EKS add-ons and clusters.
- The VPC, both node subnets, and the NAT public subnet must already exist in `eu-north-1`. The NAT subnet must share the VPC and have a default route to an Internet Gateway; Terraform checks these conditions.
- The existing cluster, EBS CSI, and VPC CNI IAM roles must exist. The cluster role needs `AmazonEKSClusterPolicy`; the Pod Identity roles must trust `pods.eks.amazonaws.com` and have the add-on policies.
- The managed node group role is created by Terraform with `AmazonEKSWorkerNodePolicy` and `AmazonEC2ContainerRegistryPullOnly`.
- Terraform creates an IAM policy and Pod Identity role for AWS Load Balancer Controller, associates that role with the `kube-system/aws-load-balancer-controller` service account, tags the two existing public subnets for internet-facing ALB discovery, and installs chart `1.14.0` (controller `v2.14.1`) with the ALB Gateway API feature enabled using the local Helm CLI. The public subnet IDs must be in at least two Availability Zones and have a route to an Internet Gateway.
- Standard managed node groups need the `eks-pod-identity-agent` add-on for the EBS CSI and VPC CNI Pod Identity associations. Terraform installs this add-on and lets EKS choose a version compatible with the cluster Kubernetes version; Auto Mode had supplied the agent automatically.
- The configured node subnets are isolated. Terraform creates one public NAT Gateway in `nat_public_subnet_id` and routes the node subnets' route tables through it, allowing nodes to pull images from public registries. The current default NAT subnet is `subnet-092f108598671044e` in `eu-north-1a`; the single NAT is shared by nodes in both Availability Zones. The existing S3 gateway endpoint remains associated with the node subnets' route tables.
- NAT Gateways incur hourly, public IPv4, and data processing charges; traffic from another Availability Zone can also incur cross-AZ charges. This configuration uses one NAT Gateway to limit fixed costs, so egress depends on its Availability Zone. Terraform also creates interface endpoints for ECR API, ECR Docker, EC2, and EKS Auth; those endpoints incur hourly and data processing charges. Review all of these resources in `terraform plan` before applying. The existing S3 gateway endpoint is not managed by this configuration.
- IAM Identity Center must be configured in `eu-north-1` with instance ARN `arn:aws:sso:::instance/ssoins-650814de20560fdb` for the Argo CD capability's sign-in integration.
- The IAM role `AmazonEKSCapabilityArgoCDRole` selected in the console must already exist and trust `capabilities.eks.amazonaws.com` with `sts:AssumeRole` and `sts:TagSession`. Terraform attaches AWS's `AWSSecretsManagerClientReadOnlyAccess` managed policy, matching the console selection. This grants read access to Secrets Manager values across the account; use a scoped custom policy if Argo CD will only read specific repository credentials.
- The managed Argo CD capability is configured in namespace `argocd` with a public endpoint. Terraform looks up the IAM Identity Center user `argocd-admin` by username and maps it to `ADMIN`; add `EDITOR` or `VIEWER` mappings for additional users or groups. The Terraform identity needs permission to read the Identity Center instance and user, and `argocd-admin` must finish the invitation/password setup before signing in.
- Changing an existing cluster from Auto Mode to standard EKS compute is destructive to Auto Mode managed instances and Auto Mode load balancers. Review the plan before applying. The managed node group is fixed at two nodes (`min_size`, `desired_size`, and `max_size` are all 2); it will not scale automatically.

## AWS authentication

Terraform uses the AWS provider's default credential chain. Authenticate the AWS CLI using your chosen method, then verify the active account:

```sh
aws sts get-caller-identity
```

Confirm that `get-caller-identity` reports account `992189742733` (or change the account-specific role and network defaults for the account you intend to use), then run `terraform plan`. Terraform uses the AWS CLI's default credential chain; if you use a named CLI profile, set `AWS_PROFILE` to that profile in the same terminal. Do not put access keys in Terraform files or commit them to the repository.

The `No valid credential sources found` error means Terraform did not receive usable AWS credentials. If `aws` is installed outside `PATH`, use its full path or add its containing directory to `PATH`. If you use IAM Identity Center, sign in again when its session expires. If `aws sts get-caller-identity` fails, resolve the AWS CLI login issue before running Terraform again.

The account, role ARNs, VPC, subnet IDs, add-on versions, and API allowlist are inputs so they can be adjusted for another environment. The default public API allowlist is `0.0.0.0/0` to match the supplied console settings; set `public_access_cidrs` to trusted CIDR blocks before applying in a real environment.

## Use

Before applying Terraform for the first time, make sure the AWS CLI and `kubectl` are installed, configure `kubectl` for this cluster, and install the standard Gateway API CRDs and the matching AWS Load Balancer Controller Gateway CRDs. Terraform manages the controller with the Helm provider and its custom resources with the Kubernetes provider, so these CRDs must already exist:

```sh
aws eks update-kubeconfig --region eu-north-1 --name cluster1-eks
kubectl apply -f https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.2.0/standard-install.yaml
kubectl apply -f https://raw.githubusercontent.com/kubernetes-sigs/aws-load-balancer-controller/v2.14.1/config/crd/gateway/gateway-crds.yaml
```

Terraform creates the `clusterscope-frontend` namespace before applying the controller's namespaced configuration, and intentionally leaves the namespace in place on `terraform destroy` to avoid deleting application workloads and data.

Review or override the defaults in a local `terraform.tfvars` file (Terraform ignores this file in Git). `aws_cli_path` defaults to the AWS CLI binary path found on this Mac (`/Users/hasanmariam/.local/share/aws-cli/aws`); change it if you run Terraform on another machine. Then run:

```sh
terraform init
terraform plan
terraform apply
```

The configuration manages the cluster, the managed node group and its node IAM role, the NAT Gateway and node routes, add-ons, the AWS Load Balancer Controller role and Helm release, its GatewayClass and ALB configuration, the ACM demo certificate, and the Argo CD capability. It does not create the VPC, subnets, Internet Gateway, cluster IAM role, EBS/VPC CNI Pod Identity roles, or the pre-existing Argo CD capability role. Terraform adds the ALB role and cluster-discovery tags to the existing public subnets; destroying this stack removes those tags. The `vpc_id` and subnet IDs shown in the request are account-specific and can only work if those resources are present in the AWS account and region selected.

The frontend Gateway is configured as an internet-facing ALB with IP targets and HTTPS on port 443, without a hostname restriction. Terraform generates a self-signed certificate and imports it into ACM, then configures the ALB GatewayClass to use it. Use `https://<alb-hostname>/` to connect. Because the certificate is self-signed and has no SAN matching the AWS-generated hostname, browsers will show a certificate warning; `curl -k https://<alb-hostname>/` can be used to demonstrate that the TLS endpoint responds. Terraform stores the generated private key in its state, so protect that state and use this certificate only for a demo. A trusted HTTPS endpoint requires a hostname and a publicly trusted certificate. The AWS Load Balancer Controller's Gateway API support currently has documented conformance/support gaps and is not recommended by its maintainers for production workloads yet; review this limitation before relying on it for production.

After Terraform and Argo CD sync, verify with:

```sh
kubectl -n kube-system get deployment aws-load-balancer-controller
kubectl get gatewayclass aws-alb
kubectl -n clusterscope-frontend get gateway clusterscope-gateway -o wide
kubectl -n clusterscope-frontend describe gateway clusterscope-gateway
```

The EC2 Free Tier or account credits may cover eligible `t3.small` instance usage depending on account age and plan, but they do not make EKS itself free. EKS standard support is billed at $0.10 per cluster-hour, with EBS, public IPv4, and network charges billed separately where applicable. Check AWS Billing for the account's actual credits and usage.

EKS capabilities are billed separately while active; check [EKS capabilities pricing](https://aws.amazon.com/eks/pricing/) before applying.
