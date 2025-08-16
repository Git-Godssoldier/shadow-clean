# Shadow Deployment Guide

## Quick Deployment (Recommended)

### Automated Railway + Vercel Deployment

Shadow includes a fully automated deployment script that handles the complete deployment pipeline:

```bash
./auto-deploy.sh
```

**What it does:**
- ✅ Verifies database migrations non-interactively
- ✅ Deploys backend to Railway with PostgreSQL
- ✅ Deploys frontend to Vercel
- ✅ Sets all environment variables automatically
- ✅ Runs database migrations on production

### Prerequisites for Quick Deployment

1. **Install CLI tools:**
```bash
# Install Railway CLI
npm install -g @railway/cli

# Install Vercel CLI  
npm install -g vercel
```

2. **Authenticate with services:**
```bash
# Login to Railway
railway login

# Login to Vercel
vercel login
```

3. **Local database setup for migration verification:**
```bash
# Create local PostgreSQL database
psql -U postgres -c "CREATE DATABASE shadow;"

# Set DATABASE_URL in packages/db/.env
DATABASE_URL="postgresql://postgres:@localhost:5432/shadow?schema=public"
```

### Environment Variables

The deployment script automatically sets these variables on Railway:
- `NODE_ENV=production`
- `AGENT_MODE=local`
- `PORT=4000`
- `DATABASE_URL` (auto-configured from PostgreSQL service)
- GitHub OAuth credentials
- Workspace and sidecar configurations

## Alternative: AWS Remote Deployment

### Required Tools
- AWS CLI configured with credentials
- Docker Desktop installed and running
- kubectl CLI tool
- eksctl for EKS cluster management
- Helm package manager
- Node.js 18+ and npm

### AWS Requirements
- AWS account with appropriate permissions
- AWS profile configured (default name: `ID`)
- Sufficient quota for c5.metal instances (bare metal for KVM)

## Step 1: Configure Environment Variables

Edit `.env.production.initial` with your actual values:

```bash
# Required configurations:
DATABASE_URL="postgresql://user:pass@your-db-host:5432/shadow_prod"
BETTER_AUTH_SECRET="generate-32-char-random-string-here"
GITHUB_CLIENT_ID="your-github-oauth-app-client-id"
GITHUB_CLIENT_SECRET="your-github-oauth-app-secret"
GITHUB_PERSONAL_ACCESS_TOKEN="ghp_your_token_here"
```

### GitHub OAuth App Setup
1. Go to GitHub Settings > Developer settings > OAuth Apps
2. Create new OAuth App with:
   - Homepage URL: `https://your-domain.com`
   - Authorization callback URL: `https://your-domain.com/api/auth/callback/github`

### Database Setup Options

#### Option A: AWS RDS PostgreSQL
```bash
DATABASE_URL="postgresql://username:password@your-rds-endpoint.amazonaws.com:5432/shadow"
DIRECT_URL="postgresql://username:password@your-rds-endpoint.amazonaws.com:5432/shadow"
```

#### Option B: Supabase
```bash
DATABASE_URL="postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres"
```

## Step 2: Deploy Infrastructure

### Deploy EKS Cluster with Kata Containers

```bash
# Set AWS profile if not using default
export AWS_PROFILE=ID
export AWS_REGION=us-east-1

# Deploy the infrastructure (20-30 minutes)
./scripts/deploy-remote-infrastructure.sh
```

This creates:
- EKS cluster with bare metal nodes (c5.metal)
- Kata Containers runtime for VM isolation
- Kubernetes namespace and RBAC
- Service account tokens

### Verify Deployment
```bash
# Check cluster nodes
kubectl get nodes

# Verify Kata runtime
kubectl get runtimeclass kata-qemu
```

## Step 3: Build and Deploy Application

### Deploy Backend to ECS

```bash
# Deploy backend service to AWS ECS
./scripts/deploy-backend-ecs.sh
```

This will:
- Create ECR repository
- Build and push Docker image
- Deploy ECS service with auto-scaling
- Configure load balancer

### Build Frontend

```bash
# Build the frontend application
npm run build --filter=frontend
```

### Deploy Frontend (Vercel Recommended)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy frontend
cd apps/frontend
vercel --prod
```

## Step 4: Database Migration

```bash
# Run production migrations
npm run db:prod:migrate

# Verify migration status
npm run db:prod:migrate:status
```

## Step 5: Post-Deployment Configuration

### Update DNS Records
Point your domain to the ALB created by ECS deployment:
```bash
aws elbv2 describe-load-balancers --query "LoadBalancers[?contains(LoadBalancerName, 'shadow')].DNSName"
```

### SSL Certificate
For HTTPS, create an ACM certificate:
```bash
aws acm request-certificate \
  --domain-name your-domain.com \
  --validation-method DNS \
  --region us-east-1
```

Then set in environment:
```bash
export SSL_CERTIFICATE_ARN="arn:aws:acm:us-east-1:..."
```

## Monitoring and Maintenance

### View Application Logs
```bash
# Backend logs
aws logs tail /ecs/shadow-server-task --follow

# Kubernetes pods
kubectl logs -f -n shadow-agents -l app=shadow
```

### Scale Resources
```bash
# Scale EKS nodes
eksctl scale nodegroup --cluster=shadow-remote --name=remote-nodes --nodes=3

# Scale ECS tasks
aws ecs update-service --cluster shadow-ecs-cluster --service shadow-backend-service --desired-count 3
```

### Cost Optimization

#### Estimated Monthly Costs:
- EKS Cluster: ~$73/month (control plane)
- c5.metal instance: ~$1,600/month per node
- ECS Backend: ~$29-435/month (auto-scaling)
- RDS Database: ~$15-100/month
- Data Transfer: Variable

#### Cost-Saving Tips:
1. Use spot instances for non-critical workloads
2. Scale down during off-hours
3. Use reserved instances for predictable workloads
4. Monitor with AWS Cost Explorer

## Troubleshooting

### Common Issues

#### 1. Kata Containers Not Working
```bash
# Check node labels
kubectl get nodes --show-labels | grep kvm

# Verify KVM is enabled
kubectl debug node/[node-name] -it --image=busybox -- ls -la /dev/kvm
```

#### 2. Database Connection Issues
```bash
# Test connection from within cluster
kubectl run psql-test --rm -it --image=postgres:15 -- psql "$DATABASE_URL" -c "SELECT 1"
```

#### 3. WebSocket Connection Failed
- Check CORS settings in server config
- Verify security group allows WebSocket traffic (port 4000)
- Check ALB sticky sessions are enabled

## Security Best Practices

1. **API Keys**: Store in AWS Secrets Manager
2. **Network**: Use VPC endpoints for AWS services
3. **RBAC**: Implement least-privilege access
4. **Encryption**: Enable encryption at rest and in transit
5. **Monitoring**: Set up CloudWatch alarms
6. **Backups**: Configure automated database backups

## Cleanup

To remove all deployed resources:
```bash
./scripts/cleanup-infrastructure.sh
```

This removes:
- EKS cluster and nodes
- ECS services and tasks
- Load balancers
- VPC and networking resources

## Support

For issues or questions:
- Check logs in CloudWatch
- Review GitHub issues
- Consult the CLAUDE.md development guide