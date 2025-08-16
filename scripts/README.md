## Production Deployment

### Remote Infrastructure (AWS EKS)

Shadow supports production deployment on AWS with Kata QEMU containers:

1. **Deploy EKS Cluster with Kata Containers:**
```bash
# Configure AWS SSO
aws configure sso --profile=ID

# Deploy infrastructure (25-35 minutes)
./scripts/deploy-remote-infrastructure.sh
```

2. **Deploy Shadow Application:**
```bash
# Deploy complete platform
./scripts/deploy-full-infrastructure.sh
```

### Infrastructure Components

- **EKS Cluster** - Amazon Linux 2023 nodes with Kata Containers support
- **Kata QEMU Runtime** - Hardware-level VM isolation
- **GitHub Container Registry** - Container image storage
- **ECS Backend** - Application Load Balancer with optional SSL
- **EFS Storage** - Persistent workspace storage

### Infrastructure Management

```bash
# Deploy only EKS cluster with Kata Containers
./scripts/deploy-remote-infrastructure.sh

# Deploy only ECS backend service
./scripts/deploy-backend-ecs.sh

# Deploy complete infrastructure (EKS + ECS)
./scripts/deploy-full-infrastructure.sh

# Clean up infrastructure
./scripts/cleanup-infrastructure.sh
```
