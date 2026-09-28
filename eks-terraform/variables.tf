variable "aws_region" {
  description = "AWS region for the EKS cluster."
  type        = string
  default     = "eu-north-1"
}

variable "cluster_name" {
  description = "EKS cluster name."
  type        = string
  default     = "cluster1-eks"
}

variable "kubernetes_version" {
  description = "Kubernetes version for the EKS control plane."
  type        = string
  default     = "1.36"
}

variable "vpc_id" {
  description = "Existing VPC in which to place the EKS control plane and managed nodes."
  type        = string
  default     = "vpc-01010c2a85706f9c6"
}

variable "subnet_ids" {
  description = "Existing subnets in the VPC, preferably spanning at least two Availability Zones."
  type        = list(string)
  default     = ["subnet-0f1c8ea31b57a6708", "subnet-033fd9a9e10e896b4"]
}

variable "nat_public_subnet_id" {
  description = "Existing public subnet for the single outbound NAT Gateway. It must have a default route to an Internet Gateway."
  type        = string
  default     = "subnet-092f108598671044e"
}

variable "cluster_role_arn" {
  description = "Existing EKS Auto Mode cluster IAM role ARN. The role must have the required Auto Mode policies attached."
  type        = string
  default     = "arn:aws:iam::992189742733:role/AmazonEKSClusterRole"
}

variable "ebs_csi_pod_identity_role_arn" {
  description = "Existing Pod Identity role for the EBS CSI driver."
  type        = string
  default     = "arn:aws:iam::992189742733:role/AmazonEKSPodIdentityAmazonEBSCSIDriverRole"
}

variable "vpc_cni_pod_identity_role_arn" {
  description = "Existing Pod Identity role for the VPC CNI add-on."
  type        = string
  default     = "arn:aws:iam::992189742733:role/AmazonEKSPodIdentityAmazonVPCCNIRole"
}

variable "argocd_capability_name" {
  description = "Unique name for the managed EKS Argo CD capability."
  type        = string
  default     = "cluster1-eks-argocd"
}

variable "argocd_identity_center_instance_arn" {
  description = "IAM Identity Center instance used for Argo CD sign-in."
  type        = string
  default     = "arn:aws:sso:::instance/ssoins-650814de20560fdb"
}

variable "argocd_capability_role_name" {
  description = "Existing IAM capability role selected for EKS Argo CD."
  type        = string
  default     = "AmazonEKSCapabilityArgoCDRole"
}

variable "public_access_cidrs" {
  description = "CIDR blocks allowed to reach the public Kubernetes API endpoint. Replace 0.0.0.0/0 with trusted addresses for real deployments."
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

variable "tags" {
  description = "Tags applied to the EKS cluster and managed add-ons."
  type        = map(string)
  default     = {}
}
