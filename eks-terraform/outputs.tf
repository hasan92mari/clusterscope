
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
  value       = "${var.aws_cli_path} eks update-kubeconfig --region ${var.aws_region} --name ${aws_eks_cluster.this.name}"
}

output "aws_load_balancer_controller_role_arn" {
  description = "Pod Identity role used by the cluster-wide AWS Load Balancer Controller."
  value       = aws_iam_role.load_balancer_controller.arn
}

output "cluster_demo_tls_certificate_arn" {
  description = "ACM ARN of the self-signed demo certificate, if a GitOps Gateway needs HTTPS without a public hostname."
  value       = aws_acm_certificate.alb_demo.arn
}

output "addons_setup_commands" {
  description = "Commands to plan and apply the tracked Kubernetes/Helm add-ons after the root apply installs the shared CRDs."
  value       = <<-EOT
    terraform -chdir=addons init
    terraform -chdir=addons plan
    terraform -chdir=addons apply
  EOT
}
