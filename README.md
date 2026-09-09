
# ClusterScope

ClusterScope is a Kubernetes learning project built around a realistic cloud-native application. It is designed to make deployment, networking, state, security, scaling, and recovery concepts easy to inspect in one place.

## Start here

### 1. Prepare the cluster

Before installing ClusterScope, make sure the cluster provides:

- Kubernetes and `kubectl` access.
- Helm 3.
- A default `StorageClass` for Redis and PostgreSQL persistent volumes.
- Gateway API CRDs and a Gateway controller, such as Envoy Gateway.
- A `GatewayClass` named `envoy-gateway-class`, or another class name supplied through Helm values.
- A TLS Secret named `clusterscope-tls` in the Gateway namespace.
- A LoadBalancer implementation such as MetalLB when using a local cluster and external access is required.

ClusterScope deploys the application resources; it does not install Gateway API CRDs, Envoy Gateway, MetalLB, or certificate infrastructure.

### 2. Install the application

From the repository root, install the included Helm chart:

```bash
helm install clusterscope ./helm/clusterscope
```

Check that the application is ready:

```bash
kubectl get pods -n clusterscope
kubectl get gateway,httproute -n clusterscope
```

To apply chart changes later:

```bash
helm upgrade clusterscope ./helm/clusterscope
```

The chart supports single-namespace and multi-namespace installations. See [helm/README.md](helm/README.md) for values, TLS setup, storage, scaling, validation, upgrades, and uninstall instructions.

### 3. Use the dashboard

| Dashboard section | Purpose |
|---|---|
| Frontend cards | Display the current frontend Pod's uptime, IP, namespace, application, node, and restart count. |
| Redis | Shows the frontend connection state to the shared Redis service used for session data. |
| Backend | Connects to the backend and displays its Pod details when it is available. |
| PostgreSQL user data | Lets a user save and retrieve a value through the backend; the value is persisted in PostgreSQL. |
| Language and theme | Provide English, German, and Arabic UI choices and a light/dark presentation mode. |

## Documentation guide

The sections below explain the design in more detail. Start with **Architecture**, then use **Helm** for deployment packaging and **Training Scenarios** for hands-on exercises.

> Argo CD and GitOps deployment documentation will be added in a future update.

## Overview

**ClusterScope** is a cloud-native application built as a **Kubernetes training and learning platform**.
The main goal of the project is to provide a realistic, hands-on environment for people who are learning Kubernetes and want to practice deploying, managing, securing, scaling, troubleshooting, and recovering a complete application running on Kubernetes.
The project is not intended to be a commercial production application. Instead, it uses a production-inspired architecture to demonstrate practical Kubernetes, cloud-native, and DevOps concepts.

---

## Architecture

ClusterScope is designed as a **microservices-based application** with a clear separation between stateless application workloads and stateful data services.

```text

                           Browser
                              |
                         HTTPS :443
                              |
                              v
                    +-------------------+
                    |   Envoy Gateway   |
                    |    Gateway API    |
                    +-------------------+
                              |
                         HTTPRoute
                              |
                              v
                    +-------------------+
                    |     Frontend      |
                    |   Stateless App   |
                    +-------------------+
                       |             |
                 API Requests    Cache / Sessions
                       |             |
                       v             v
                +-----------+    +---------+
                |  Backend  |    |  Redis  |
                | Stateless |    | Stateful|
                +-----------+    +---------+
                       |
                       | Database Access
                       v
                +-------------+
                | PostgreSQL  |
                |  Stateful   |
                +-------------+
                       |
                       v
                Persistent Storage

```

### Component Responsibilities

| Component | Responsibility |
|---|---|
| Frontend | User interface, API communication, cache and session management |
| Backend | Application API and business logic |
| Redis | Cache and session data for the Frontend |
| PostgreSQL | Persistent application data for the Backend |
| Envoy Gateway | HTTPS/TLS termination and external traffic routing |
| Kubernetes | Scheduling, networking, scaling, self-healing, and resource management |
| Helm | Application packaging and deployment management |
The Backend does **not** communicate with Redis.
The communication model is:

```text

Frontend
   |
   +----> Redis
   |       └── Cache / Sessions
   |
   +----> Backend
           └──> PostgreSQL

```

---

## Kubernetes Training Platform

ClusterScope was created primarily as a **practical Kubernetes training environment**.
Instead of learning Kubernetes only through isolated examples, learners can work with a complete application and practice real operational scenarios.
The project can be used to experiment with:
- Deployments
- StatefulSets
- Services
- ConfigMaps
- Secrets
- PersistentVolumes
- PersistentVolumeClaims
- Namespaces
- ServiceAccounts
- RBAC
- Liveness and readiness probes
- Resource requests and limits
- Replica scaling
- Gateway API
- HTTPS/TLS
- Kubernetes DNS
- Cross-namespace communication
- Helm
- Failure recovery
- Pod replacement
- Persistent data

---

## Stateless Architecture

The Frontend and Backend are designed as **stateless application workloads**.
Their application Pods do not depend on local container storage for persistent application state.
This makes them suitable for horizontal scaling:

```text

                 Frontend Service
                       |
             +---------+---------+
             |         |         |
             v         v         v
          Frontend  Frontend  Frontend
            Pod       Pod       Pod

```

The same principle applies to the Backend.
If a Pod fails, Kubernetes can create a replacement without requiring application data to be stored inside that Pod.

---

## Stateful Components

Stateful components are separated from the stateless application workloads.
ClusterScope uses:
- **Redis** for cache and session data.
- **PostgreSQL** for persistent application data.
Both are deployed using Kubernetes StatefulSets and persistent storage.

```text

Redis
  |
  v
PVC
  |
  v
Persistent Storage

```

```text

PostgreSQL
  |
  v
PVC
  |
  v
Persistent Storage

```

This demonstrates an important Kubernetes concept:

> Application Pods can be replaced independently from the persistent data they use.

---

## Persistent Storage

The stateful services use Kubernetes PersistentVolumes and PersistentVolumeClaims.

The general architecture is:

```text

+----------------+
| StatefulSet    |
+----------------+
        |
        v
+----------------+
| PVC            |
+----------------+
        |
        v
+----------------+
| PV             |
+----------------+
        |
        v
+----------------+
| Persistent     |
| Storage        |
+----------------+

```

This allows the data lifecycle to be separated from the Pod lifecycle.
For example, if a PostgreSQL Pod is deleted and recreated, the new Pod can mount the existing PVC and continue using the previously stored data.
The current project uses `ReadWriteOnce` storage for the local stateful workloads.

> The current storage implementation is intentionally designed for local development and training. Production environments should use a suitable distributed storage solution and production-grade StorageClasses.

---

## Scalability

The stateless application components can be horizontally scaled by increasing their replica counts.
Example:

```yaml

frontend:
  replicas: 3

backend:
  replicas: 3

```

This allows multiple Frontend and Backend Pods to run simultaneously.
Kubernetes Services provide a stable endpoint in front of these replicas and distribute traffic between available Pods.

---

## Self-Healing and Recovery

One of the key Kubernetes concepts demonstrated by ClusterScope is **self-healing**.
Kubernetes continuously monitors the desired state of the application.
If a Pod crashes or becomes unavailable, Kubernetes can recreate it automatically.
Health probes are used to help Kubernetes understand the state of the workloads:

### Liveness Probe

Determines whether the application is still functioning.
If the application fails the liveness check repeatedly, Kubernetes can restart the container.

### Readiness Probe

Determines whether the application is ready to receive traffic.
A Pod that is not ready is temporarily removed from Service traffic until it becomes healthy again.

---

## Security

Security is treated as an integral part of the Kubernetes architecture.
The project applies several security and management practices, including:
- Running containers as non-root users where possible
- Dropping unnecessary Linux capabilities
- Disabling privilege escalation
- Using `seccomp` with `RuntimeDefault`
- Using dedicated ServiceAccounts
- Applying least-privilege RBAC
- Storing credentials in Kubernetes Secrets
- Using resource requests and limits
- Using liveness and readiness probes
- Separating workloads using namespaces
- Using HTTPS/TLS for external traffic

The goal is to demonstrate that security controls should be integrated into the application and infrastructure design rather than added afterwards.

---

## Kubernetes Networking

ClusterScope uses Kubernetes Services for internal communication.
Pods are not accessed directly using their individual IP addresses.
Instead, applications communicate through stable Kubernetes Service DNS names.

```text

Frontend
    |
    v
Backend Service
    |
    v
Backend Pods
    |
    v
PostgreSQL Service
    |
    v
PostgreSQL Pod

```

Redis is accessed independently by the Frontend:

```text

Frontend
    |
    v
Redis Service
    |
    v
Redis Pod

```

This demonstrates Kubernetes service discovery and the abstraction provided by Services.

---

## Gateway API and HTTPS

External traffic enters the cluster through the Kubernetes Gateway API.
The request flow is:

```text

Browser
   |
   | HTTPS :443
   v
LoadBalancer
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
Frontend Service
   |
   v
Frontend Pod

```

TLS is terminated at the Gateway.
The HTTPRoute then forwards traffic to the Frontend Service.
This provides practical experience with:
- Gateway API
- Gateway resources
- HTTPRoute
- TLS termination
- HTTPS
- LoadBalancer Services
- Kubernetes traffic routing

---

## Namespace Isolation

ClusterScope supports two deployment models.

### Single Namespace

All components can be deployed into one namespace:

```text

clusterscope
├── Frontend
├── Backend
├── Redis
├── PostgreSQL
└── Gateway

```

### Multi Namespace

The components can also be separated into individual namespaces:

```text

clusterscope-frontend
clusterscope-backend
clusterscope-redis
clusterscope-postgres
clusterscope-gateway

```

The multi-namespace setup provides an additional training environment for learning:
- Namespace isolation
- Cross-namespace Service discovery
- Cross-namespace Gateway routing
- Resource organization
- Kubernetes security boundaries

---

## Helm

The complete Kubernetes deployment is packaged as a **Helm chart**.
Helm makes the application deployment reproducible and configurable without maintaining separate Kubernetes manifests for every environment.
The chart provides configurable values for:
- Namespaces
- Container images
- Image versions
- Replica counts
- Resource requests and limits
- Storage sizes
- Services
- Database configuration
- Redis configuration
- Gateway configuration
- TLS configuration

For example:

```yaml

frontend:
  replicas: 2

backend:
  replicas: 2

```

The same chart can therefore be used with different configurations for development, testing, or other environments.

---

## Infrastructure and Application Separation

The project separates **application-level resources** from **cluster-level infrastructure**.
The Helm chart manages application resources such as:

```text

Frontend
Backend
Redis
PostgreSQL
Services
ConfigMaps
Secrets
RBAC
Persistent Storage
Gateway
HTTPRoute

```

Cluster-level infrastructure such as the following is managed independently:

```text

Kubernetes
Gateway API CRDs
Envoy Gateway
GatewayClass
MetalLB
LoadBalancer infrastructure
Certificate infrastructure

```

This separation keeps the application deployment independent from the underlying Kubernetes platform.

---

## Production-Inspired Design

Although ClusterScope is primarily a training project, its architecture follows several production-inspired principles.

### Separation of Concerns

Application, cache/session, database, networking, and infrastructure responsibilities are separated.

### Stateless Application Workloads

Frontend and Backend Pods can be replicated and replaced independently.

### Stateful Data Services

Redis and PostgreSQL are separated from the application workloads and use persistent storage.

### Declarative Infrastructure

Kubernetes resources are defined declaratively and managed through Helm.

### Security

Workloads use Kubernetes security controls such as RBAC, non-root execution, restricted capabilities, and TLS.

### Scalability

Stateless workloads can be scaled horizontally using Kubernetes replicas.

### Recovery

Kubernetes can automatically restart and recreate failed application Pods.

### Persistence

Stateful workloads use persistent volumes so that data can survive Pod recreation.

---

## Training Scenarios

ClusterScope can be used to practice realistic Kubernetes scenarios.
Examples include:

### Scaling

Increase the Frontend or Backend replica count and observe how Kubernetes creates additional Pods.

### Failure Recovery

Delete a running Pod and observe Kubernetes automatically recreate it.

```bash
kubectl delete pod <pod-name>
```

### Configuration Changes

Modify ConfigMaps or Secrets and observe how application configuration is managed.

### Networking

Inspect Services and DNS names and test communication between namespaces.

### Storage

Delete and recreate a stateful Pod and verify that persistent data remains available.

### Troubleshooting

Intentionally introduce configuration or deployment problems and investigate:

```bash
kubectl get pods

kubectl describe pod <pod-name>

kubectl logs <pod-name>

kubectl get events
```

### Helm

Modify values and upgrade the application:

```bash
helm upgrade clusterscope ./helm/clusterscope
```

These scenarios turn the project into a practical Kubernetes playground rather than simply a static demonstration.

---

## Production Limitations

ClusterScope is **not intended to be a production-ready platform**.
Some components are intentionally simplified to keep the project suitable for local development and Kubernetes training.
A production deployment would require additional considerations, including:
- Highly available PostgreSQL
- Highly available Redis
- Distributed persistent storage
- Automated database backups
- Disaster recovery
- Production-grade secret management
- NetworkPolicies
- Monitoring and observability
- Centralized logging
- Autoscaling
- Production TLS certificate management
- Multi-node failure testing
- Backup and restore procedures
- Proper database replication

The current storage configuration, including `hostPath`, is intended for local development and learning rather than production use.

---

## Project Goal

The primary goal of ClusterScope is to provide a **realistic Kubernetes learning platform and practical training environment**.

It combines multiple Kubernetes concepts into a single application:

```text

                     ClusterScope
                          |
        +-----------------+-----------------+
        |                 |                 |
        v                 v                 v
    Frontend           Backend           Gateway
        |                 |
        |                 v
        |            PostgreSQL
        |
        v
      Redis
        |
        v
Persistent Storage

```

Learners can use the project to understand how:
- Stateless applications are deployed and scaled.
- Stateful services are managed.
- Persistent storage works.
- Kubernetes Services provide networking and discovery.
- Kubernetes automatically recovers failed workloads.
- Security controls are applied to workloads.
- Namespaces provide isolation.
- Gateway API manages external traffic.
- Helm packages and manages Kubernetes applications.
The project is ultimately designed as a **hands-on Kubernetes playground** where learners can deploy, inspect, modify, scale, troubleshoot, break, recover, and experiment with a complete cloud-native application.

'''
