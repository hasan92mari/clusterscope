
output "cluster_name" {
  description = "EKS cluster name."
  value       = aws_eks_cluster.this.name
}

output "node_group_name" {
  description = "EKS managed node group with two fixed t3.small instances."
  value       = aws_eks_node_group.this.node_group_name
}

output "argocd_server_url" {
  description = "Public URL of the managed Argo CD capability."
  value       = aws_eks_capability.argocd.configuration[0].argo_cd[0].server_url
}

output "update_kubeconfig_command" {
  description = "Run this command to add the EKS cluster credentials to your local kubeconfig."
  value       = "aws eks update-kubeconfig --region ${var.aws_region} --name ${aws_eks_cluster.this.name}"
}

output "node_egress_nat_public_ip" {
  description = "Static public IPv4 address used for outbound connections from the EKS node subnets."
  value       = aws_eip.node_egress_nat.public_ip
}
