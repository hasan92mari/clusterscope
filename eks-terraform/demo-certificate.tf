# Optional self-signed demo certificate for a GitOps-managed HTTPS Gateway.
# It is not referenced by the cluster or add-ons Terraform resources.
resource "tls_private_key" "alb_demo" {
  algorithm = "RSA"
  rsa_bits  = 2048
}

resource "tls_self_signed_cert" "alb_demo" {
  private_key_pem       = tls_private_key.alb_demo.private_key_pem
  validity_period_hours = 8760
  dns_names             = ["clusterscope.example.com"]
  allowed_uses = [
    "key_encipherment",
    "digital_signature",
    "server_auth",
  ]

  subject {
    common_name  = "clusterscope.example.com"
    organization = "EKS demo"
  }
}

resource "aws_acm_certificate" "alb_demo" {
  private_key      = tls_private_key.alb_demo.private_key_pem
  certificate_body = tls_self_signed_cert.alb_demo.cert_pem

  tags = merge(var.tags, {
    Name = "${var.cluster_name}-demo-self-signed"
  })
}
