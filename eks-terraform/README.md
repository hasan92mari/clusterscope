# EKS platform with tracked Kubernetes add-ons

Terraform uses two root configurations because the EKS API endpoint and Kubernetes schemas must exist before the Kubernetes and Helm providers can plan against them:

1. `eks-terraform/` provisions AWS infrastructure, EKS, the managed node group and add-ons, Argo CD, the controller IAM/Pod Identity role, subnet tags, and a demo TLS certificate.
2. `eks-terraform/addons/` reads the active cluster and directly manages its Kubernetes resources. Helm tracks the AWS Load Balancer Controller release; the Kubernetes provider tracks the shared `GatewayClass`.

Application namespaces, Gateways, routes, and load balancer configuration remain in `argo/` and are deployed through Argo CD. The root Terraform apply uses `local-exec` after the node group is ready to install the Gateway API and AWS controller Gateway CRDs. They are cluster configuration, have no AWS resource charge, and are intentionally not represented as tracked Kubernetes resources. The add-ons root then plans and tracks the controller chart and `GatewayClass` against those installed schemas.

## Requirements

- Terraform 1.5+, AWS CLI, `kubectl`, and AWS credentials for account `992189742733`.
- Existing VPC `vpc-01010c2a85706f9c6`, private node subnets, public load balancer subnets, Internet Gateway, EKS cluster role, and EBS/VPC CNI Pod Identity roles.
- IAM Identity Center in `eu-north-1`, user `argocd-admin`, and IAM role `AmazonEKSCapabilityArgoCDRole`.
- The private subnet route tables must not already have a default route managed outside this stack; Terraform routes them through one NAT Gateway.

Review `variables.tf` before applying. Set a tighter `public_access_cidrs` allowlist if possible; the default `0.0.0.0/0` matches the existing cluster configuration. The node group uses on-demand `t3.small` instances. RDS PostgreSQL and ElastiCache Redis are private, single-AZ managed services in the existing private subnets; both, along with EKS, NAT Gateway, public IPv4, and other resources, incur charges. Generated database credentials are stored in Secrets Manager and also exist in Terraform state, so use encrypted, access-controlled state storage.

## Stage 1: Create AWS infrastructure

From this directory:

```sh
aws sts get-caller-identity
terraform init
terraform plan
terraform apply
```

Wait for the cluster and nodes to become active. Terraform associates `AmazonEKSClusterAdminPolicy` with the Argo CD capability role at cluster scope so Argo can discover CRDs and deploy apps in namespaces Terraform does not know about. This is full cluster-admin access and is intended for this demo/development cluster. The AppProject in `../argo/appset+project.yaml` filters resources submitted through applications, but does not narrow the role's underlying permissions.

## Stage 2: Install tracked Kubernetes add-ons

The root apply has already installed the shared CRDs and created the managed databases and their Secrets Manager entries. Print and run the generated commands to review and apply the tracked add-ons:

```sh
terraform output -raw addons_setup_commands
```

These initialize `addons/` and show its plan. Review and approve that plan. Helm and Kubernetes providers connect to an existing cluster; the AWS Load Balancer Controller, External Secrets Operator, and `aws-alb` GatewayClass are tracked in the add-ons state. External Secrets uses the EKS Pod Identity association created by the root stack to read only the two application secrets.

If the AWS CLI path differs on this machine, set `aws_cli_path` in `addons/terraform.tfvars`. Keep `aws_region`, `cluster_name`, and `vpc_id` consistent with the root variables.

## Deploy applications through Argo CD

Push the Argo changes, then sync the backend and frontend applications. They read RDS and Redis connection details from Secrets Manager through External Secrets. The ApplicationSet no longer deploys the in-cluster PostgreSQL and Redis StatefulSets. Existing PostgreSQL data is not migrated by this change; export and restore it before pruning the old PostgreSQL workload if it must be preserved. The AppSet's `CreateNamespace=true` option creates destination namespaces. The frontend Gateway and its AWS-specific load balancer settings live in `argo/frontend/`.

For the HTTPS demo, apply the Terraform changes, then copy `terraform output -raw cluster_demo_tls_certificate_arn` into `../argo/frontend/loadbalancerconfiguration.yaml`, commit that value, and sync the app. The self-signed certificate uses the reserved sample name `clusterscope.example.com`, so browsers will warn about trust and the hostname will not match the ALB DNS name. For production HTTPS, use a domain you control with a publicly trusted ACM certificate and point that domain to the ALB.

## Destroy

Delete or prune Argo-managed applications first, while the controller is still running, so Gateway resources can be cleaned up. Then destroy the two states in reverse order:

```sh
terraform -chdir=addons destroy
terraform destroy
```

The VPC and subnets are existing resources and are not destroyed by Terraform.
The `local-exec` bootstrap does not run uninstall commands on destroy. Its CRDs disappear when the EKS cluster is deleted.
