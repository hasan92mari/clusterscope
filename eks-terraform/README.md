# EKS cluster with a fixed managed node group

This Terraform configuration manages `cluster1-eks` in `eu-north-1` with Kubernetes `1.36`, IPv4 networking, public and private API endpoints, and the selected EKS add-ons. EKS Auto Mode is disabled. Terraform creates an EKS managed node group with exactly two on-demand `t3.small` instances.

## Requirements before applying

- Terraform 1.5 or newer and AWS credentials with permission to manage EKS add-ons and clusters.
- The VPC and both subnets from `terraform.tfvars` must already exist in `eu-north-1`. The configuration checks that the selected subnets belong to the configured VPC.
- The existing cluster, EBS CSI, and VPC CNI IAM roles must exist. The cluster role needs `AmazonEKSClusterPolicy`; the Pod Identity roles must trust `pods.eks.amazonaws.com` and have the add-on policies.
- The managed node group role is created by Terraform with `AmazonEKSWorkerNodePolicy` and `AmazonEC2ContainerRegistryPullOnly`.
- Standard managed node groups need the `eks-pod-identity-agent` add-on for the EBS CSI and VPC CNI Pod Identity associations. Terraform installs this add-on and lets EKS choose a version compatible with the cluster Kubernetes version; Auto Mode had supplied the agent automatically.
- The configured node subnets are isolated and have no NAT route. Terraform therefore creates interface VPC endpoints for ECR API, ECR Docker, EC2, and EKS Auth in both subnets, with private DNS enabled. The existing S3 gateway endpoint must remain associated with the node subnets' route tables. The cluster security group is attached to the interface endpoint ENIs so the nodes can reach them over HTTPS.
- Interface VPC endpoints incur hourly and data processing charges when applied. Review these additions in `terraform plan`; the S3 gateway endpoint is existing infrastructure and is not managed by this configuration.
- IAM Identity Center must be configured in `eu-north-1` with instance ARN `arn:aws:sso:::instance/ssoins-650814de20560fdb` for the Argo CD capability's sign-in integration.
- The IAM role `AmazonEKSCapabilityArgoCDRole` selected in the console must already exist and trust `capabilities.eks.amazonaws.com` with `sts:AssumeRole` and `sts:TagSession`. Terraform attaches AWS's `AWSSecretsManagerClientReadOnlyAccess` managed policy, matching the console selection. This grants read access to Secrets Manager values across the account; use a scoped custom policy if Argo CD will only read specific repository credentials.
- The managed Argo CD capability is configured in namespace `argocd` with a public endpoint. Terraform looks up the IAM Identity Center user `argocd-admin` by username and maps it to `ADMIN`; add `EDITOR` or `VIEWER` mappings for additional users or groups. The Terraform identity needs permission to read the Identity Center instance and user, and `argocd-admin` must finish the invitation/password setup before signing in.
- The existing subnets must provide the network access needed by EC2 nodes to join EKS and pull images. For the current isolated subnets, Terraform creates the required interface endpoints; the S3 gateway endpoint must already be associated with their route tables. Alternatively, use private subnets with NAT or public subnets configured to assign public IPv4 addresses.
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

Review or override the defaults in a local `terraform.tfvars` file (Terraform ignores this file in Git), then run:

```sh
terraform init
terraform plan
terraform apply
```

The configuration manages the cluster, the managed node group and its node IAM role, the add-ons, and the Argo CD capability. It does not create the VPC, subnets, cluster IAM role, Pod Identity roles/policies, or the pre-existing Argo CD capability role. The `vpc_id` and subnet IDs shown in the request are account-specific and can only work if those resources are present in the AWS account and region selected.

The EC2 Free Tier or account credits may cover eligible `t3.small` instance usage depending on account age and plan, but they do not make EKS itself free. EKS standard support is billed at $0.10 per cluster-hour, with EBS, public IPv4, and network charges billed separately where applicable. Check AWS Billing for the account's actual credits and usage.

EKS capabilities are billed separately while active; check [EKS capabilities pricing](https://aws.amazon.com/eks/pricing/) before applying.
