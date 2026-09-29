# Kubernetes add-ons Terraform root

This is the second Terraform root. Run it only after the parent stack has created an active EKS cluster and the Gateway API CRDs have been installed. It directly tracks the AWS Load Balancer Controller Helm release and Kubernetes `GatewayClass`.
