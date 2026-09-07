# ClusterScope Helm Chart

Helm chart for deploying the ClusterScope application on Kubernetes.

The chart supports two deployment modes:

- **Single namespace** — all application components run in one namespace.
- **Multi namespace** — frontend, backend, Redis, PostgreSQL, and Gateway run in separate namespaces.

The chart is designed for local development, Kubernetes learning, and portfolio demonstration.

## Architecture

```text
                         Browser
                            |
                            | HTTPS :443
                            v
                    +------------------+
                    |  Envoy Gateway   |
                    | Gateway API/TLS  |
                    +------------------+
                            |
                       HTTPRoute
                            |
                            v
                    +------------------+
                    |    Frontend      |
                    +------------------+
                       |            |
                  API calls     Cache/Session
                       |            |
                       v            v
                +-----------+   +---------+
                |  Backend  |   |  Redis  |
                +-----------+   +---------+
                       |
                       v
                +-------------+
                | PostgreSQL  |
                +-------------+
```

## Components

| Component | Kubernetes Resources |
|---|---|
| Frontend | Deployment + Service |
| Backend | Deployment + Service |
| Redis | StatefulSet + Service + PVC |
| PostgreSQL | StatefulSet + Service + PVC |
| Frontend RBAC | ServiceAccount + Role + RoleBinding |
| Gateway | Gateway |
| Routing | HTTPRoute |
| Configuration | ConfigMaps |
| Credentials | Secrets |
| Storage | PersistentVolumes + PVCs |
| Namespaces | Namespace resources |

## Requirements

Before installing the chart, make sure the Kubernetes cluster has:

- Kubernetes cluster
- Helm 3
- Gateway API CRDs
- An installed Gateway API implementation such as Envoy Gateway
- An existing `GatewayClass`
- MetalLB or another LoadBalancer implementation if using a local cluster
- An existing TLS Secret for HTTPS

The chart **does not install or manage**:

- Gateway API CRDs
- Envoy Gateway
- GatewayClass
- MetalLB
- MetalLB IP pools
- TLS certificate infrastructure

These are considered cluster-level infrastructure.

---

## GatewayClass

The chart expects an existing GatewayClass.

The default value is:

```yaml
gateway:
  gatewayClassName: envoy-gateway-class
```

For example:

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: GatewayClass
metadata:
  name: envoy-gateway-class
spec:
  controllerName: gateway.envoyproxy.io/gatewayclass-controller
```

Check available GatewayClasses:

```bash
kubectl get gatewayclass
```

If your cluster uses a different GatewayClass, override it during installation:

```bash
helm install clusterscope ./helm/clusterscope \
  --set gateway.gatewayClassName=<your-gateway-class>
```

---

## TLS / HTTPS

The Gateway is configured for HTTPS only.

Default hostname:

```text
clusterscope.com
```

Default TLS Secret:

```text
clusterscope-tls
```

The Secret must exist in the same namespace as the Gateway.

For local development, `mkcert` can be used to create a locally trusted certificate.

Example:

```bash
mkcert clusterscope.com
```

This generates:

```text
clusterscope.com.pem
clusterscope.com-key.pem
```

Create the Kubernetes Secret:

```bash
kubectl create secret tls clusterscope-tls \
  --cert=clusterscope.com.pem \
  --key=clusterscope.com-key.pem \
  -n clusterscope
```

For multi-namespace mode, create the Secret in the Gateway namespace:

```bash
kubectl create secret tls clusterscope-tls \
  --cert=clusterscope.com.pem \
  --key=clusterscope.com-key.pem \
  -n clusterscope-gateway
```

The chart only references the existing Secret. It does not store or generate the certificate.

> **Important:** Never expose or commit the `mkcert` CA private key (`rootCA-key.pem`).

---

## Local DNS

For local development, add the LoadBalancer IP to `/etc/hosts`.

Example:

```text
192.168.64.240 clusterscope.com
```

Then access:

```text
https://clusterscope.com
```

The IP address depends on the LoadBalancer configuration of your cluster.

---

## Installation

### Default Installation

The default configuration uses a single namespace:

```yaml
namespaceMode: single
```

Install:

```bash
helm install clusterscope ./helm/clusterscope
```

This creates:

```text
clusterscope
```

and deploys all application components inside it.

Check the installation:

```bash
kubectl get all -n clusterscope
```

Check the Gateway:

```bash
kubectl get gateway -n clusterscope
```

Check the HTTPRoute:

```bash
kubectl get httproute -n clusterscope
```

---

## Multi Namespace Installation

The chart can deploy every major component into its own namespace.

Use:

```bash
helm install clusterscope ./helm/clusterscope \
  --set namespaceMode=multi
```

The default namespaces are:

```text
clusterscope-frontend
clusterscope-backend
clusterscope-redis
clusterscope-postgres
clusterscope-gateway
```

Check them:

```bash
kubectl get namespaces
```

Check application resources:

```bash
kubectl get all -n clusterscope-frontend
kubectl get all -n clusterscope-backend
kubectl get all -n clusterscope-redis
kubectl get all -n clusterscope-postgres
kubectl get all -n clusterscope-gateway
```

---

## Custom Namespaces

Namespaces can be changed through `values.yaml`.

Example:

```yaml
namespaceMode: multi

namespaces:
  frontend: app-frontend
  backend: app-backend
  redis: app-redis
  postgres: app-postgres
  gateway: app-gateway
```

The chart automatically generates the required Kubernetes DNS names.

For example:

```text
clusterscope-backend.app-backend.svc.cluster.local
```

and:

```text
clusterscope-postgres.app-postgres.svc.cluster.local
```

---

## Scaling

Frontend and backend replica counts are configurable.

### Frontend

```yaml
frontend:
  replicas: 2
```

### Backend

```yaml
backend:
  replicas: 2
```

Or override them from the command line:

```bash
helm upgrade clusterscope ./helm/clusterscope \
  --set frontend.replicas=3 \
  --set backend.replicas=3
```

Check the Deployments:

```bash
kubectl get deployments -A
```

Redis and PostgreSQL also expose configurable replica values, but the current chart is intended for single-instance local development:

```yaml
redis:
  replicas: 1

postgres:
  replicas: 1
```

Running multiple Redis or PostgreSQL replicas does not automatically provide a production HA setup.

---

## Container Images

The images are configurable through `values.yaml`.

### Frontend

```yaml
frontend:
  image:
    repository: ghcr.io/hasan92mari/clusterscope-frontend
    tag: latest
    pullPolicy: Always
```

### Backend

```yaml
backend:
  image:
    repository: ghcr.io/hasan92mari/clusterscope-backend
    tag: latest
    pullPolicy: Always
```

### Redis

```yaml
redis:
  image:
    repository: redis
    tag: 7-alpine
```

### PostgreSQL

```yaml
postgres:
  image:
    repository: postgres
    tag: 17-alpine
```

You can deploy a specific application image version:

```bash
helm upgrade clusterscope ./helm/clusterscope \
  --set frontend.image.tag=latest-143-f8e91ab
```

---

## Configuration

### Frontend

The frontend receives:

```text
BACKEND_URL
REDIS_HOST
REDIS_PORT
REDIS_PASSWORD
```

The backend and Redis hosts are automatically generated according to the selected namespace mode.

For example, in single namespace mode:

```text
clusterscope-backend.clusterscope.svc.cluster.local
clusterscope-redis.clusterscope.svc.cluster.local
```

In multi namespace mode:

```text
clusterscope-backend.clusterscope-backend.svc.cluster.local
clusterscope-redis.clusterscope-redis.svc.cluster.local
```

### Backend

The backend receives:

```text
POSTGRES_USER
POSTGRES_PASSWORD
POSTGRES_DB
POSTGRES_HOST
POSTGRES_PORT
```

The PostgreSQL hostname is also automatically generated according to the namespace mode.

---

## Secrets

The chart creates application Secrets from values for local development.

Example PostgreSQL configuration:

```yaml
postgres:
  username: clusterscope
  password: clusterscope
  database: clusterscope
```

Redis:

```yaml
redis:
  password: clusterscope-dev-password
```

These credentials are intended for local development only.

For production environments, use a proper secret-management solution such as:

- External Secrets Operator
- HashiCorp Vault
- Cloud provider secret management
- Sealed Secrets
- Kubernetes Secrets managed outside Git

Do not commit real production credentials to Git.

---

## Redis Storage

Redis is deployed as a StatefulSet with persistent storage.

Example:

```yaml
redis:
  storage:
    size: 1Gi
    hostPath: /tmp/clusterscope-redis-data
```

Redis uses:

```text
/data
```

as its persistent data directory.

The StatefulSet creates a PVC from the configured storage size.

---

## PostgreSQL Storage

PostgreSQL is also deployed as a StatefulSet.

Example:

```yaml
postgres:
  storage:
    size: 1Gi
    hostPath: /data/clusterscope-postgres

  storageClassName: manual
```

PostgreSQL stores its data under:

```text
/var/lib/postgresql/data
```

The chart uses:

```text
ReadWriteOnce
```

for the database volume.

`ReadWriteOnce` means that the volume can be mounted read/write by workloads on a single node at a time. It is not permanently tied to one Pod.

The PostgreSQL PersistentVolume uses:

```yaml
persistentVolumeReclaimPolicy: Retain
```

so the underlying data is retained when the associated PVC/PV lifecycle changes.

---

## Important: hostPath Storage

The chart uses `hostPath` because it is intended primarily for local Kubernetes development.

For example:

```yaml
hostPath:
  path: /data/clusterscope-postgres
```

This means the data physically exists on a Kubernetes node.

If a Pod moves to another node, the new node may not contain the same data directory.

Therefore, `hostPath` is **not recommended for production**.

For production Kubernetes environments, use a proper StorageClass and dynamic persistent volumes.

---

## Health Checks

The frontend exposes:

```text
/healthz
/readyz
```

on port:

```text
8080
```

The backend exposes:

```text
/healthz
/readyz
```

on port:

```text
8000
```

Kubernetes uses:

- **Liveness probes** to determine whether the container should be restarted.
- **Readiness probes** to determine whether the Pod should receive traffic.

---

## Resource Management

CPU and memory requests/limits are configurable.

Example frontend:

```yaml
frontend:
  resources:
    requests:
      cpu: 100m
      memory: 64Mi
    limits:
      cpu: 200m
      memory: 128Mi
```

Example backend:

```yaml
backend:
  resources:
    requests:
      cpu: 100m
      memory: 64Mi
    limits:
      cpu: 200m
      memory: 128Mi
```

This makes the chart suitable for small local clusters while still demonstrating Kubernetes resource management.

---

## RBAC

The frontend runs with a dedicated ServiceAccount:

```text
clusterscope-frontend
```

It has a Role allowing:

```text
get pods
```

inside its own namespace.

The chart creates:

```text
ServiceAccount
Role
RoleBinding
```

This follows the principle of granting only the permissions required by the application.

---

## Gateway API

The chart creates:

```text
Gateway
HTTPRoute
```

The Gateway listens on:

```text
HTTPS :443
```

with:

```text
clusterscope.com
```

The HTTPRoute sends traffic to:

```text
clusterscope-frontend:80
```

The frontend Service then forwards traffic to the frontend container:

```text
Service :80
      |
      v
Pod :8080
```

The complete request path is:

```text
Browser
  |
  | HTTPS :443
  v
MetalLB LoadBalancer IP
  |
  v
Envoy Gateway
  |
  v
Gateway
  |
  v
HTTPRoute
  |
  v
Frontend Service :80
  |
  v
Frontend Pod :8080
```

---

## Cross-Namespace Routing

In single namespace mode, the Gateway and HTTPRoute are in the same namespace.

The Gateway uses:

```yaml
allowedRoutes:
  namespaces:
    from: Same
```

In multi namespace mode, the Gateway is separated from the frontend.

Therefore, the Gateway allows routes from other namespaces:

```yaml
allowedRoutes:
  namespaces:
    from: All
```

The HTTPRoute references the Gateway namespace explicitly.

This allows:

```text
clusterscope-gateway
        |
        v
clusterscope-frontend
```

to work across namespaces.

---

## MetalLB

MetalLB is not installed or configured by this Helm chart.

For a local bare-metal or VM-based Kubernetes cluster, a LoadBalancer implementation is required.

For example, MetalLB can provide:

```text
192.168.64.240
```

to the Envoy Gateway Service.

Check the Gateway Service:

```bash
kubectl get svc -A
```

The expected flow is:

```text
192.168.64.240:443
        |
        v
Envoy Gateway LoadBalancer
```

MetalLB configuration should be managed separately from this application chart because it is cluster-level infrastructure.

---

## Values Files

The chart can be used with environment-specific values files.

Recommended structure:

```text
helm/
└── clusterscope/
    ├── Chart.yaml
    ├── values.yaml
    ├── values-dev.yaml
    ├── values-prod.yaml
    └── templates/
```

The base `values.yaml` contains the default configuration.

Environment-specific files override only the values that need to change.

For example:

```bash
helm upgrade --install clusterscope ./helm/clusterscope \
  -f ./helm/clusterscope/values-dev.yaml
```

Production:

```bash
helm upgrade --install clusterscope ./helm/clusterscope \
  -f ./helm/clusterscope/values-prod.yaml
```

---

## Helm Validation

Before installing the chart, run:

```bash
helm lint ./helm/clusterscope
```

Render the templates without installing:

```bash
helm template clusterscope ./helm/clusterscope
```

Render the multi-namespace configuration:

```bash
helm template clusterscope ./helm/clusterscope \
  --set namespaceMode=multi
```

You can also save the rendered manifests:

```bash
helm template clusterscope ./helm/clusterscope \
  > rendered.yaml
```

---

## Installation Examples

### Development

```bash
helm upgrade --install clusterscope ./helm/clusterscope \
  -f ./helm/clusterscope/values-dev.yaml
```

### Production

```bash
helm upgrade --install clusterscope ./helm/clusterscope \
  -f ./helm/clusterscope/values-prod.yaml
```

### Multi Namespace

```bash
helm upgrade --install clusterscope ./helm/clusterscope \
  --set namespaceMode=multi
```

### Custom Replica Counts

```bash
helm upgrade --install clusterscope ./helm/clusterscope \
  --set frontend.replicas=2 \
  --set backend.replicas=2
```

---

## Upgrade

After changing the chart or values:

```bash
helm upgrade clusterscope ./helm/clusterscope
```

Check the release:

```bash
helm list
```

Check the release status:

```bash
helm status clusterscope
```

---

## Uninstall

Remove the Helm release:

```bash
helm uninstall clusterscope
```

> Persistent data may remain because persistent storage uses a `Retain` policy and/or underlying hostPath storage.

If you want to completely remove local development data, remove the corresponding directories from the Kubernetes node manually.

---

## Chart Structure

```text
helm/
└── clusterscope/
    ├── Chart.yaml
    ├── values.yaml
    ├── values-dev.yaml
    ├── values-prod.yaml
    └── templates/
        ├── _helpers.tpl
        ├── namespaces.yaml
        │
        ├── frontend-configmap.yaml
        ├── frontend-serviceaccount.yaml
        ├── frontend-role.yaml
        ├── frontend-rolebinding.yaml
        ├── frontend-secret.yaml
        ├── frontend-deployment.yaml
        ├── frontend-service.yaml
        │
        ├── backend-configmap.yaml
        ├── backend-secret.yaml
        ├── backend-deployment.yaml
        ├── backend-service.yaml
        │
        ├── redis-secret.yaml
        ├── redis-pv.yaml
        ├── redis-statefulset.yaml
        ├── redis-service.yaml
        │
        ├── postgres-secret.yaml
        ├── postgres-pv.yaml
        ├── postgres-statefulset.yaml
        ├── postgres-service.yaml
        │
        ├── gateway.yaml
        └── httproute.yaml
```

---

## What This Chart Manages

The chart manages application-level Kubernetes resources:

```text
Namespaces
Frontend
Backend
Redis
PostgreSQL
Gateway
HTTPRoute
ConfigMaps
Secrets
RBAC
PersistentVolumes
PersistentVolumeClaims
```

## What This Chart Does Not Manage

The following are intentionally managed outside the chart:

```text
Gateway API CRDs
Envoy Gateway
GatewayClass
MetalLB
MetalLB IPAddressPool
MetalLB L2Advertisement
TLS certificate authority
TLS certificate generation
Production secret management
```

This separation keeps the application chart independent from cluster-level infrastructure.

---

## Design Goals

The chart is intentionally designed to demonstrate:

- Helm templating
- Kubernetes Deployments
- Kubernetes StatefulSets
- Services
- ConfigMaps
- Secrets
- RBAC
- Persistent storage
- Health probes
- Resource requests and limits
- Kubernetes namespaces
- Cross-namespace service discovery
- Gateway API
- HTTPS/TLS termination
- Environment-specific configuration
- Configurable replica counts
- Containerized cloud-native applications

The goal is to keep the deployment architecture understandable while demonstrating realistic Kubernetes and DevOps concepts.

---

## Summary

ClusterScope can be deployed with a simple single-namespace setup:

```text
clusterscope
├── frontend
├── backend
├── redis
├── postgres
└── gateway
```

or a separated multi-namespace setup:

```text
clusterscope-frontend
clusterscope-backend
clusterscope-redis
clusterscope-postgres
clusterscope-gateway
```

The same Helm chart supports both models through:

```yaml
namespaceMode: single
```

or:

```yaml
namespaceMode: multi
```

This allows the same application chart to be used for simple local development as well as a more isolated Kubernetes deployment model.