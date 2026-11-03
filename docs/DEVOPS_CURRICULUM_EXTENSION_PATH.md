# DevOps & Cloud Infrastructure Curriculum Extension Path

## Architectural Context & Scope Separation

Phase 1 intentionally limits its baseline catalog to **37 core software engineering topics** across four subject areas:
1. Data Structures (9 topics)
2. Algorithms (12 topics)
3. Computer Science Fundamentals (10 topics)
4. Software Engineering & Architecture (6 topics)

While foundational concepts such as Linux namespaces, cgroups, distributed trace propagation, and basic reliability metrics are mapped as general CS or baseline principles, **full DevOps and Cloud Infrastructure competencies are NOT claimed to be fully covered by Phase 1**.

This document defines the formal extension roadmap for **optional, versioned curriculum modules** that can be loaded alongside or layered on top of the Phase 1 core catalog without disrupting its strict Directed Acyclic Graph (DAG) invariants or bloating general CS interview evaluations.

---

## 1. Modular Architecture & Packaging Model

DevOps extensions will be packaged as modular, versioned curriculum packs (`curriculum-pack-devops`):

```typescript
export interface CurriculumModulePack {
  id: string; // e.g., 'devops_cloud_v1'
  name: string; // 'Cloud Infrastructure & SRE Extension'
  version: string; // '1.0.0'
  targetRoles: string[]; // ['DevOps Engineer', 'SRE', 'Cloud Architect', 'Platform Engineer']
  optional: boolean; // true - only enabled when requested or role-triggered
  dependencies: string[]; // Phase 1 prerequisite topics (e.g., 'cs_operating_systems', 'cs_networking')
  topics: CurriculumTopic[];
}
```

---

## 2. Planned Module Specifications

### Module 1: Linux Administration and Shell Scripting (`devops_linux_admin`)
- **Version:** `1.0.0`
- **Prerequisites:** `cs_operating_systems`
- **Core Competencies:**
  - File permissions (POSIX octal, ACLs, sticky bits, umask).
  - Shell scripting (Bash/Zsh POSIX compliance, parameter expansion, signal trapping, exit code propagation).
  - Systemd service units, timer targets, cgroup slice configuration, and journalctl analysis.
  - Network troubleshooting utilities (`ip`, `ss`, `tcpdump`, `dig`, `curl -Iv`).
  - Storage administration (LVM, block devices, ext4/xfs mounting, inode exhaustion).

### Module 2: Docker and Container Orchestration (`devops_containers`)
- **Version:** `1.0.0`
- **Prerequisites:** `cs_operating_systems`, `devops_linux_admin`
- **Core Competencies:**
  - OCI container image specification and runtime specification (runc).
  - Multi-stage Docker builds, layer caching strategies, and non-root security contexts.
  - Container networking modes (bridge, host, overlay, macvlan) and veth pair routing.
  - Container storage (volumes, bind mounts, tmpfs) and rootfs copy-on-write (overlayfs).
  - Vulnerability scanning (Trivy, Grype) and minimal base images (Distroless, Alpine).

### Module 3: Kubernetes Architecture and Operations (`devops_kubernetes`)
- **Version:** `1.0.0`
- **Prerequisites:** `devops_containers`, `cs_distributed_systems`
- **Core Competencies:**
  - Control plane internals: API Server aggregation, etcd Raft consensus, Controller Manager loops, Kubelet reconciliation.
  - Workload primitives: Deployments, StatefulSets, DaemonSets, Jobs/CronJobs, and HPA (Horizontal Pod Autoscaler).
  - Networking: CNI plugins, ClusterIP vs NodePort vs LoadBalancer, Ingress controllers, and Service Mesh (Envoy/Istio).
  - Storage: StorageClasses, PersistentVolumeClaims, CSI drivers, and stateful volume migration.
  - Security & Governance: RBAC, NetworkPolicies, Pod Security Standards (PSS), and admission webhooks (OPA/Kyverno).

### Module 4: CI/CD and Deployment Strategies (`devops_cicd`)
- **Version:** `1.0.0`
- **Prerequisites:** `cs_testing_debugging`
- **Core Competencies:**
  - Declarative pipeline definitions (GitHub Actions, GitLab CI, Argo Workflows).
  - GitOps operational models (ArgoCD, Flux) and declarative desired-state reconciliation.
  - Advanced deployment patterns: Canary analysis with automated rollback, Blue/Green traffic switching, Shadow testing.
  - Supply chain security: SLSA framework, artifact signing (Cosign/Sigstore), and Software Bill of Materials (SBOM).

### Module 5: Infrastructure as Code (`devops_iac`)
- **Version:** `1.0.0`
- **Prerequisites:** `se_scalability`
- **Core Competencies:**
  - Declarative infrastructure state machines (Terraform, OpenTofu, Pulumi).
  - State locking, remote backend state storage (S3/DynamoDB, GCS), and state drift detection.
  - Modular module composition, variable validation, and immutable infrastructure patterns.
  - Static analysis: Policy as Code (Open Policy Agent/Rego, Checkov, tfsec).

### Module 6: Cloud Platform Services (`devops_cloud_platforms`)
- **Version:** `1.0.0`
- **Prerequisites:** `cs_networking`, `cs_databases`
- **Core Competencies:**
  - AWS/GCP/Azure Identity and Access Management (IAM): Least privilege, role assumption, STS, workload identity federation.
  - VPC Architecture: Subnets, Route Tables, NAT Gateways, VPC Peering, Transit Gateways, and PrivateLink.
  - Managed Data Stores: Relational vs DynamoDB/Bigtable capacity modes, read replicas, and failover topologies.
  - Serverless & Edge execution: Event-driven Lambda/Cloud Functions, cold start mitigation, and API Gateway integration.

### Module 7: Monitoring and Observability (`devops_observability`)
- **Version:** `1.0.0`
- **Prerequisites:** `cs_testing_debugging`, `se_scalability`
- **Core Competencies:**
  - Metrics pipelines: Prometheus pull model vs OpenTelemetry push model, PromQL aggregation, high cardinality risks.
  - Distributed tracing: OpenTelemetry Collectors, sampling strategies (head-based vs tail-based), trace context injection.
  - Structured logging: JSON log pipelines, log aggregation (Loki, Elasticsearch), correlation IDs.
  - Alert engineering: Multi-window multi-burn-rate alerts based on SLO error budgets, pager fatigue mitigation.

---

## 3. Integration Lifecycle & Role Activation

1. **Role-Aware Dynamic Loading:**
   When a user conducts an interview for a Software Engineer (Backend/Frontend), only the Phase 1 37 core topics are loaded. When the target role is identified as **DevOps Engineer**, **SRE**, or **Cloud Architect**, the engine dynamically activates the `curriculum-pack-devops` module pack.
2. **Backward Compatibility:**
   Phase 1 topics will remain the root of the dependency graph. No core topic will depend on a DevOps extension topic; rather, DevOps topics will declare dependencies pointing into Phase 1 topics (`cs_operating_systems`, `cs_networking`, `cs_testing_debugging`, `se_scalability`).
