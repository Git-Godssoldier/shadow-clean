#!/bin/bash

# Shadow Backend ECS Deployment Script
# Deploys the Node.js backend server to AWS ECS in the same VPC as remote execution K8s cluster

set -euo pipefail

# Disable AWS CLI pager to prevent hanging on interactive commands
export AWS_PAGER=""

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Create logs directory
LOGS_DIR="$SCRIPT_DIR/logs"
mkdir -p "$LOGS_DIR"
LOG_FILE="$LOGS_DIR/ecs-deploy-$(date +%Y%m%d-%H%M%S).log"

# Configuration
CLUSTER_NAME="${EKS_CLUSTER_NAME:-shadow-remote}"
ECS_CLUSTER_NAME="${ECS_CLUSTER_NAME:-shadow-ecs-cluster}"
ECR_REPO_NAME="${ECR_REPO_NAME:-shadow-server}"
AWS_REGION="${AWS_REGION:-us-east-1}"
AWS_PROFILE="${AWS_PROFILE:-ID}"
SERVICE_NAME="${SERVICE_NAME:-shadow-backend-service}"
TASK_FAMILY="${TASK_FAMILY:-shadow-server-task}"
DESIRED_COUNT="${DESIRED_COUNT:-1}"

# SSL Configuration
SSL_CERTIFICATE_ARN="${SSL_CERTIFICATE_ARN:-}"  # Required for HTTPS support

# Resource Configuration
TASK_CPU="${TASK_CPU:-1024}"
TASK_MEMORY="${TASK_MEMORY:-2048}"
CONTAINER_PORT="${CONTAINER_PORT:-4000}"

# Autoscaling Configuration
# Scales to match K8s Shadow task capacity (~80 tasks per c5.metal node)
# Each backend task handles ~20-30 concurrent WebSocket connections
# Cost: ~$29/month (1 task) to ~$435/month (15 tasks max)
ENABLE_AUTOSCALING="${ENABLE_AUTOSCALING:-true}"
MIN_CAPACITY="${MIN_CAPACITY:-1}"
MAX_CAPACITY="${MAX_CAPACITY:-15}"
TARGET_CPU_UTILIZATION="${TARGET_CPU_UTILIZATION:-65}"
TARGET_MEMORY_UTILIZATION="${TARGET_MEMORY_UTILIZATION:-75}"
SCALE_OUT_COOLDOWN="${SCALE_OUT_COOLDOWN:-180}"  # 3 minutes
SCALE_IN_COOLDOWN="${SCALE_IN_COOLDOWN:-300}"    # 5 minutes

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log() {
    echo -e "${GREEN}[ECS-DEPLOY]${NC} $1"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
}

warn() {
    echo -e "${YELLOW}[ECS-DEPLOY]${NC} $1"
}

error() {
    echo -e "${RED}[ECS-DEPLOY]${NC} $1"
    exit 1
}

info() {
    echo -e "${BLUE}[ECS-DEPLOY]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    log "Checking prerequisites..."
    
    # Check AWS CLI
    if ! command -v aws &> /dev/null; then
        error "AWS CLI is required but not installed"
    fi
    
    # Check Docker
    if ! command -v docker &> /dev/null; then
        error "Docker is required but not installed"
    fi
    
    # Check AWS credentials
    if ! aws sts get-caller-identity --profile "$AWS_PROFILE" &> /dev/null; then
        error "AWS credentials not configured for profile '$AWS_PROFILE'"
    fi
    
    # Check if EKS cluster exists
    if ! aws eks describe-cluster --name "$CLUSTER_NAME" --region "$AWS_REGION" --profile "$AWS_PROFILE" &> /dev/null; then
        error "EKS cluster '$CLUSTER_NAME' not found. Run deploy-remote-infrastructure.sh first"
    fi
    
    # Validate SSL certificate ARN if provided
    if [[ -n "$SSL_CERTIFICATE_ARN" ]]; then
        log "Validating SSL certificate ARN..."
        if ! aws acm describe-certificate --certificate-arn "$SSL_CERTIFICATE_ARN" --region "$AWS_REGION" --profile "$AWS_PROFILE" &> /dev/null; then
            error "SSL certificate ARN '$SSL_CERTIFICATE_ARN' not found or invalid"
        fi
        log "SSL certificate validated: $SSL_CERTIFICATE_ARN"
    else
        warn "No SSL certificate provided - deployment will use HTTP only"
        warn "For production use, set SSL_CERTIFICATE_ARN environment variable"
    fi
    
    log "Prerequisites check passed"
}

# Get VPC information from existing EKS cluster
get_vpc_info() {
    log "Getting VPC information from EKS cluster..."
    
    # Get VPC ID
    VPC_ID=$(aws eks describe-cluster --name "$CLUSTER_NAME" --region "$AWS_REGION" --profile "$AWS_PROFILE" --query 'cluster.resourcesVpcConfig.vpcId' --output text)
    
    # Get all subnet IDs from EKS cluster
    ALL_SUBNET_IDS=$(aws eks describe-cluster --name "$CLUSTER_NAME" --region "$AWS_REGION" --profile "$AWS_PROFILE" --query 'cluster.resourcesVpcConfig.subnetIds' --output text)
    
    # Filter subnets to get one per unique Availability Zone for ALB
    log "Filtering subnets to unique Availability Zones for Load Balancer..."
    UNIQUE_SUBNETS=""
    SEEN_AZS=""
    
    for subnet_id in $ALL_SUBNET_IDS; do
        # Get AZ for this subnet
        AZ=$(aws ec2 describe-subnets --subnet-ids "$subnet_id" --region "$AWS_REGION" --profile "$AWS_PROFILE" --query 'Subnets[0].AvailabilityZone' --output text)
        
        # Check if we've seen this AZ before
        if [[ ! " $SEEN_AZS " =~ " $AZ " ]]; then
            SEEN_AZS="$SEEN_AZS $AZ"
            if [[ -n "$UNIQUE_SUBNETS" ]]; then
                UNIQUE_SUBNETS="$UNIQUE_SUBNETS,$subnet_id"
            else
                UNIQUE_SUBNETS="$subnet_id"
            fi
        fi
    done
    
    SUBNET_IDS="$UNIQUE_SUBNETS"
    
    # Get cluster security group
    CLUSTER_SG=$(aws eks describe-cluster --name "$CLUSTER_NAME" --region "$AWS_REGION" --profile "$AWS_PROFILE" --query 'cluster.resourcesVpcConfig.clusterSecurityGroupId' --output text)
    
    # Get account ID
    ACCOUNT_ID=$(aws sts get-caller-identity --profile "$AWS_PROFILE" --query 'Account' --output text)
    
    log "VPC ID: $VPC_ID"
    log "Subnets: $SUBNET_IDS"
    log "Cluster SG: $CLUSTER_SG"
    log "Account ID: $ACCOUNT_ID"
}

# Create ECR repository
create_ecr_repository() {
    log "Creating ECR repository..."
    
    # Check if repository exists
    if aws ecr describe-repositories --repository-names "$ECR_REPO_NAME" --region "$AWS_REGION" --profile "$AWS_PROFILE" &> /dev/null; then
        warn "ECR repository '$ECR_REPO_NAME' already exists"
        return 0
    fi
    
    # Create repository
    aws ecr create-repository \
        --repository-name "$ECR_REPO_NAME" \
        --region "$AWS_REGION" \
        --profile "$AWS_PROFILE" \
        --image-scanning-configuration scanOnPush=true \
        --encryption-configuration encryptionType=AES256
    
    log "ECR repository created successfully"
}

# Build and push Docker image
build_and_push_image() {
    log "Building and pushing Docker image..."
    
    # Get ECR login token
    aws ecr get-login-password --region "$AWS_REGION" --profile "$AWS_PROFILE" | \
        docker login --username AWS --password-stdin "$ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com"
    
    # Build image for amd64 architecture using buildx (required for ECS Fargate on Apple Silicon)
    log "Building Docker image for amd64 architecture using buildx..."
    cd "$PROJECT_ROOT"
    
    # Ensure buildx builder exists and is active
    docker buildx create --use --name shadow-builder 2>/dev/null || docker buildx use shadow-builder 2>/dev/null || true
    
    # Build with buildx for true cross-platform support
    docker buildx build --platform linux/amd64 -f apps/server/Dockerfile -t "$ECR_REPO_NAME:latest" . --load
    
    # Tag image for ECR
    docker tag "$ECR_REPO_NAME:latest" "$ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPO_NAME:latest"
    
    # Push image
    log "Pushing image to ECR..."
    docker push "$ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPO_NAME:latest"
    
    log "Docker image pushed successfully"
}

# Create security group for ECS
create_security_group() {
    log "Creating security group for ECS..."
    
    # Check if security group exists
    if aws ec2 describe-security-groups --filters "Name=group-name,Values=shadow-ecs-sg" "Name=vpc-id,Values=$VPC_ID" --region "$AWS_REGION" --profile "$AWS_PROFILE" --query 'SecurityGroups[0].GroupId' --output text 2>/dev/null | grep -q "sg-"; then
        ECS_SG=$(aws ec2 describe-security-groups --filters "Name=group-name,Values=shadow-ecs-sg" "Name=vpc-id,Values=$VPC_ID" --region "$AWS_REGION" --profile "$AWS_PROFILE" --query 'SecurityGroups[0].GroupId' --output text)
        warn "Security group 'shadow-ecs-sg' already exists: $ECS_SG"
        return 0
    fi
    
    # Create security group
    ECS_SG=$(aws ec2 create-security-group \
        --group-name shadow-ecs-sg \
        --description "Security group for Shadow ECS backend server" \
        --vpc-id "$VPC_ID" \
        --region "$AWS_REGION" \
        --profile "$AWS_PROFILE" \
        --query 'GroupId' \
        --output text)
    
    # Allow inbound HTTP traffic from internet to ALB on port 80
    aws ec2 authorize-security-group-ingress \
        --group-id "$ECS_SG" \
        --protocol tcp \
        --port 80 \
        --cidr 0.0.0.0/0 \
        --region "$AWS_REGION" \
        --profile "$AWS_PROFILE" || true
    
    # Allow inbound HTTPS traffic from internet to ALB on port 443
    aws ec2 authorize-security-group-ingress \
        --group-id "$ECS_SG" \
        --protocol tcp \
        --port 443 \
        --cidr 0.0.0.0/0 \
        --region "$AWS_REGION" \
        --profile "$AWS_PROFILE" || true
    
    # Allow inbound traffic on container port from ALB
    aws ec2 authorize-security-group-ingress \
        --group-id "$ECS_SG" \
        --protocol tcp \
        --port "$CONTAINER_PORT" \
        --source-group "$ECS_SG" \
        --region "$AWS_REGION" \
        --profile "$AWS_PROFILE"
    
    # Allow communication with K8s cluster
    aws ec2 authorize-security-group-ingress \
        --group-id "$ECS_SG" \
        --protocol tcp \
        --port 443 \
        --source-group "$CLUSTER_SG" \
        --region "$AWS_REGION" \
        --profile "$AWS_PROFILE" || true
    
    # Allow outbound to K8s cluster
    aws ec2 authorize-security-group-egress \
        --group-id "$ECS_SG" \
        --protocol tcp \
        --port 443 \
        --destination-group "$CLUSTER_SG" \
        --region "$AWS_REGION" \
        --profile "$AWS_PROFILE" || true
    
    # Update K8s security group to allow ECS communication
    aws ec2 authorize-security-group-ingress \
        --group-id "$CLUSTER_SG" \
        --protocol tcp \
        --port 443 \
        --source-group "$ECS_SG" \
        --region "$AWS_REGION" \
        --profile "$AWS_PROFILE" || true
    
    log "Security group created: $ECS_SG"
}

# Create IAM roles
create_iam_roles() {
    log "Creating IAM roles..."
    
    # Create ECS task execution role
    cat > trust-policy.json << EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "ecs-tasks.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
EOF
    
    # Create execution role if it doesn't exist
    if ! aws iam get-role --role-name shadowECSExecutionRole --profile "$AWS_PROFILE" &> /dev/null; then
        aws iam create-role \
            --role-name shadowECSExecutionRole \
            --assume-role-policy-document file://trust-policy.json \
            --profile "$AWS_PROFILE"
        
        aws iam attach-role-policy \
            --role-name shadowECSExecutionRole \
            --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy \
            --profile "$AWS_PROFILE"
        
        # Add SSM Parameter Store permissions for secrets
        cat > ssm-policy.json << EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ssm:GetParameters",
        "ssm:GetParameter"
      ],
      "Resource": "arn:aws:ssm:$AWS_REGION:$ACCOUNT_ID:parameter/shadow/*"
    }
  ]
}
EOF
        
        aws iam put-role-policy \
            --role-name shadowECSExecutionRole \
            --policy-name shadowSSMAccess \
            --policy-document file://ssm-policy.json \
            --profile "$AWS_PROFILE"
            
        rm -f ssm-policy.json
    else
        # Role exists, but ensure SSM permissions are added
        log "ECS execution role exists, adding SSM permissions..."
        cat > ssm-policy.json << EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ssm:GetParameters",
        "ssm:GetParameter"
      ],
      "Resource": "arn:aws:ssm:$AWS_REGION:$ACCOUNT_ID:parameter/shadow/*"
    }
  ]
}
EOF
        
        aws iam put-role-policy \
            --role-name shadowECSExecutionRole \
            --policy-name shadowSSMAccess \
            --policy-document file://ssm-policy.json \
            --profile "$AWS_PROFILE" || true
            
        rm -f ssm-policy.json
    fi
    
    # Create task role with K8s permissions
    cat > task-policy.json << EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "eks:DescribeCluster",
        "eks:ListClusters"
      ],
      "Resource": "arn:aws:eks:$AWS_REGION:$ACCOUNT_ID:cluster/$CLUSTER_NAME"
    },
    {
      "Effect": "Allow",
      "Action": [
        "ssm:GetParameter",
        "ssm:GetParameters"
      ],
      "Resource": "arn:aws:ssm:$AWS_REGION:$ACCOUNT_ID:parameter/shadow/*"
    }
  ]
}
EOF
    
    if ! aws iam get-role --role-name shadowECSTaskRole --profile "$AWS_PROFILE" &> /dev/null; then
        aws iam create-role \
            --role-name shadowECSTaskRole \
            --assume-role-policy-document file://trust-policy.json \
            --profile "$AWS_PROFILE"
        
        aws iam put-role-policy \
            --role-name shadowECSTaskRole \
            --policy-name shadowK8sAccess \
            --policy-document file://task-policy.json \
            --profile "$AWS_PROFILE"
    fi
    
    # Clean up temporary files
    rm -f trust-policy.json task-policy.json
    
    log "IAM roles created successfully"
}

# Fetch K8s service account token
# fetch_k8s_token function removed - now handled by setup-production-env.sh

# Store secrets in Systems Manager Parameter Store
store_secrets() {
    log "Storing application secrets in Parameter Store..."
    
    # Verify .env.production exists (should be created by setup-production-env.sh)
    if [[ ! -f "$PROJECT_ROOT/.env.production" ]]; then
        error ".env.production not found. The setup-production-env.sh script should have created this file."
    fi
    
    # Extract secrets from config file (temporarily disable exit on error for debugging)
    set +e
    K8S_TOKEN=$(grep "^K8S_SERVICE_ACCOUNT_TOKEN=" "$PROJECT_ROOT/.env.production" | cut -d'=' -f2-)
    DATABASE_URL=$(grep "^DATABASE_URL=" "$PROJECT_ROOT/.env.production" | cut -d'=' -f2- | tr -d '"')
    DIRECT_URL=$(grep "^DIRECT_URL=" "$PROJECT_ROOT/.env.production" | cut -d'=' -f2- | tr -d '"')
    PINECONE_API_KEY=$(grep "^PINECONE_API_KEY=" "$PROJECT_ROOT/.env.production" | cut -d'=' -f2- | tr -d '"')
    PINECONE_INDEX_NAME=$(grep "^PINECONE_INDEX_NAME=" "$PROJECT_ROOT/.env.production" | cut -d'=' -f2- | tr -d '"')
    GITHUB_CLIENT_ID=$(grep "^GITHUB_CLIENT_ID=" "$PROJECT_ROOT/.env.production" | cut -d'=' -f2- | tr -d '"')
    GITHUB_CLIENT_SECRET=$(grep "^GITHUB_CLIENT_SECRET=" "$PROJECT_ROOT/.env.production" | cut -d'=' -f2- | tr -d '"')
    GITHUB_WEBHOOK_SECRET=$(grep "^GITHUB_WEBHOOK_SECRET=" "$PROJECT_ROOT/.env.production" | cut -d'=' -f2- | tr -d '"')
    GITHUB_APP_USER_ID=$(grep "^GITHUB_APP_USER_ID=" "$PROJECT_ROOT/.env.production" | cut -d'=' -f2- | tr -d '"')
    GITHUB_APP_SLUG=$(grep "^GITHUB_APP_SLUG=" "$PROJECT_ROOT/.env.production" | cut -d'=' -f2- | tr -d '"')
    VM_IMAGE_REGISTRY=$(grep "^VM_IMAGE_REGISTRY=" "$PROJECT_ROOT/.env.production" | cut -d'=' -f2- | tr -d '"')
    SHADOW_API_KEY=$(grep "^SHADOW_API_KEY=" "$PROJECT_ROOT/.env.production" | cut -d'=' -f2- | tr -d '"')
    BRAINTRUST_API_KEY=$(grep "^BRAINTRUST_API_KEY=" "$PROJECT_ROOT/.env.production" | cut -d'=' -f2- | tr -d '"')
    BRAINTRUST_PROJECT_ID=$(grep "^BRAINTRUST_PROJECT_ID=" "$PROJECT_ROOT/.env.production" | cut -d'=' -f2- | tr -d '"')
    set -e
    
    # Debug: Show extracted values (first 20 chars for sensitive data)
    log "Debug - Extracted values:"
    log "  K8S_TOKEN: ${K8S_TOKEN:0:20}${K8S_TOKEN:+...}"
    log "  DATABASE_URL: ${DATABASE_URL:0:30}${DATABASE_URL:+...}"
    log "  DIRECT_URL: ${DIRECT_URL:0:30}${DIRECT_URL:+...}"
    log "  PINECONE_API_KEY: ${PINECONE_API_KEY:0:20}${PINECONE_API_KEY:+...}"
    log "  PINECONE_INDEX_NAME: $PINECONE_INDEX_NAME"
    log "  GITHUB_CLIENT_ID: $GITHUB_CLIENT_ID"
    log "  GITHUB_CLIENT_SECRET: ${GITHUB_CLIENT_SECRET:0:10}${GITHUB_CLIENT_SECRET:+...}"
    log "  GITHUB_WEBHOOK_SECRET: ${GITHUB_WEBHOOK_SECRET:0:10}${GITHUB_WEBHOOK_SECRET:+...}"
    log "  GITHUB_APP_USER_ID: $GITHUB_APP_USER_ID"
    log "  GITHUB_APP_SLUG: $GITHUB_APP_SLUG"
    log "  VM_IMAGE_REGISTRY: $VM_IMAGE_REGISTRY"
    log "  SHADOW_API_KEY: ${SHADOW_API_KEY:0:20}${SHADOW_API_KEY:+...}"
    log "  BRAINTRUST_API_KEY: ${BRAINTRUST_API_KEY:0:20}${BRAINTRUST_API_KEY:+...}"
    log "  BRAINTRUST_PROJECT_ID: $BRAINTRUST_PROJECT_ID"
    
    # Validate required secrets
    if [[ -z "$K8S_TOKEN" ]]; then
        warn "K8S service account token not found - you may need to run deploy-remote-infrastructure.sh first if using remote mode"
        warn "Proceeding without K8s token - ensure you have an existing K8s token in Parameter Store or run remote deployment first"
    fi
    
    # Validate critical secrets
    if [[ -z "$DATABASE_URL" ]]; then
        error "DATABASE_URL extraction failed - check .env.production format and contents"
    fi
    
    if [[ -z "$GITHUB_CLIENT_ID" ]]; then
        error "GITHUB_CLIENT_ID extraction failed - check .env.production format and contents"
    fi
    
    if [[ -z "$GITHUB_CLIENT_SECRET" ]]; then
        error "GITHUB_CLIENT_SECRET extraction failed - check .env.production format and contents"
    fi
    
    if [[ -z "$SHADOW_API_KEY" ]]; then
        error "SHADOW_API_KEY extraction failed - check .env.production format and contents"
    fi
    
    if [[ -z "$VM_IMAGE_REGISTRY" ]]; then
        warn "VM_IMAGE_REGISTRY not found - using default ghcr.io/ishaan1013/shadow"
        VM_IMAGE_REGISTRY="ghcr.io/ishaan1013/shadow"
    fi
    
    # Use DATABASE_URL as DIRECT_URL if DIRECT_URL is not provided (backward compatibility)
    if [[ -z "$DIRECT_URL" ]]; then
        log "DIRECT_URL not found - using DATABASE_URL for direct connection (backward compatibility)"
        DIRECT_URL="$DATABASE_URL"
    fi
    
    log "Secret extraction and validation completed successfully"
    
    # Store all secrets in Parameter Store
    if [[ -n "$K8S_TOKEN" ]]; then
        log "Storing K8s service account token..."
        aws ssm put-parameter \
            --name "/shadow/k8s-token" \
            --value "$K8S_TOKEN" \
            --type "SecureString" \
            --overwrite \
            --region "$AWS_REGION" \
            --profile "$AWS_PROFILE"
    fi
    
    log "Storing database URL..."
    if ! aws ssm put-parameter \
        --name "/shadow/database-url" \
        --value "$DATABASE_URL" \
        --type "SecureString" \
        --overwrite \
        --region "$AWS_REGION" \
        --profile "$AWS_PROFILE"; then
        error "Failed to store database URL in Parameter Store. Check AWS permissions for ssm:PutParameter on /shadow/* path"
    fi
    
    log "Storing direct database URL..."
    if ! aws ssm put-parameter \
        --name "/shadow/direct-url" \
        --value "$DIRECT_URL" \
        --type "SecureString" \
        --overwrite \
        --region "$AWS_REGION" \
        --profile "$AWS_PROFILE"; then
        error "Failed to store direct URL in Parameter Store. Check AWS permissions for ssm:PutParameter on /shadow/* path"
    fi
    
    if [[ -n "$PINECONE_API_KEY" ]]; then
        log "Storing Pinecone API key..."
        if ! aws ssm put-parameter \
            --name "/shadow/pinecone-api-key" \
            --value "$PINECONE_API_KEY" \
            --type "SecureString" \
            --overwrite \
            --region "$AWS_REGION" \
            --profile "$AWS_PROFILE"; then
            error "Failed to store Pinecone API key in Parameter Store. Check AWS permissions for ssm:PutParameter on /shadow/* path"
        fi
    fi
    
    if [[ -n "$PINECONE_INDEX_NAME" ]]; then
        log "Storing Pinecone index name..."
        aws ssm put-parameter \
            --name "/shadow/pinecone-index-name" \
            --value "$PINECONE_INDEX_NAME" \
            --type "String" \
            --overwrite \
            --region "$AWS_REGION" \
            --profile "$AWS_PROFILE"
    fi
    
    if [[ -n "$GITHUB_CLIENT_ID" ]]; then
        log "Storing GitHub client ID..."
        aws ssm put-parameter \
            --name "/shadow/github-client-id" \
            --value "$GITHUB_CLIENT_ID" \
            --type "String" \
            --overwrite \
            --region "$AWS_REGION" \
            --profile "$AWS_PROFILE"
    fi
    
    if [[ -n "$GITHUB_CLIENT_SECRET" ]]; then
        log "Storing GitHub client secret..."
        aws ssm put-parameter \
            --name "/shadow/github-client-secret" \
            --value "$GITHUB_CLIENT_SECRET" \
            --type "SecureString" \
            --overwrite \
            --region "$AWS_REGION" \
            --profile "$AWS_PROFILE"
    fi
    
    if [[ -n "$GITHUB_WEBHOOK_SECRET" ]]; then
        log "Storing GitHub webhook secret..."
        aws ssm put-parameter \
            --name "/shadow/github-webhook-secret" \
            --value "$GITHUB_WEBHOOK_SECRET" \
            --type "SecureString" \
            --overwrite \
            --region "$AWS_REGION" \
            --profile "$AWS_PROFILE"
    fi
    
    if [[ -n "$GITHUB_APP_USER_ID" ]]; then
        log "Storing GitHub App User ID..."
        aws ssm put-parameter \
            --name "/shadow/github-app-user-id" \
            --value "$GITHUB_APP_USER_ID" \
            --type "String" \
            --overwrite \
            --region "$AWS_REGION" \
            --profile "$AWS_PROFILE"
    fi
    
    if [[ -n "$GITHUB_APP_SLUG" ]]; then
        log "Storing GitHub App Slug..."
        aws ssm put-parameter \
            --name "/shadow/github-app-slug" \
            --value "$GITHUB_APP_SLUG" \
            --type "String" \
            --overwrite \
            --region "$AWS_REGION" \
            --profile "$AWS_PROFILE"
    fi
    
    log "Storing VM image registry..."
    if ! aws ssm put-parameter \
        --name "/shadow/vm-image-registry" \
        --value "$VM_IMAGE_REGISTRY" \
        --type "String" \
        --overwrite \
        --region "$AWS_REGION" \
        --profile "$AWS_PROFILE"; then
        error "Failed to store VM image registry in Parameter Store. Check AWS permissions for ssm:PutParameter on /shadow/* path"
    fi
    
    log "Storing Shadow API key..."
    if ! aws ssm put-parameter \
        --name "/shadow/shadow-api-key" \
        --value "$SHADOW_API_KEY" \
        --type "SecureString" \
        --overwrite \
        --region "$AWS_REGION" \
        --profile "$AWS_PROFILE"; then
        error "Failed to store Shadow API key in Parameter Store. Check AWS permissions for ssm:PutParameter on /shadow/* path"
    fi
    
    if [[ -n "$BRAINTRUST_API_KEY" ]]; then
        log "Storing Braintrust API key..."
        if ! aws ssm put-parameter \
            --name "/shadow/braintrust-api-key" \
            --value "$BRAINTRUST_API_KEY" \
            --type "SecureString" \
            --overwrite \
            --region "$AWS_REGION" \
            --profile "$AWS_PROFILE"; then
            error "Failed to store Braintrust API key in Parameter Store. Check AWS permissions for ssm:PutParameter on /shadow/* path"
        fi
    else
        warn "BRAINTRUST_API_KEY not provided - Braintrust observability will be disabled"
    fi
    
    if [[ -n "$BRAINTRUST_PROJECT_ID" ]]; then
        log "Storing Braintrust project ID..."
        aws ssm put-parameter \
            --name "/shadow/braintrust-project-id" \
            --value "$BRAINTRUST_PROJECT_ID" \
            --type "String" \
            --overwrite \
            --region "$AWS_REGION" \
            --profile "$AWS_PROFILE"
    else
        warn "BRAINTRUST_PROJECT_ID not provided - Braintrust observability will be disabled"
    fi
    
    log "All secrets stored in Parameter Store successfully"
}

# Create ECS cluster
create_ecs_cluster() {
    log "Creating ECS cluster..."
    
    # Create ECS service-linked role if it doesn't exist
    if ! aws iam get-role --role-name AWSServiceRoleForECS --profile "$AWS_PROFILE" &> /dev/null; then
        log "Creating ECS service-linked role..."
        aws iam create-service-linked-role --aws-service-name ecs.amazonaws.com --profile "$AWS_PROFILE" || true
        # Wait a moment for role to propagate
        sleep 10
    fi
    
    # Check if cluster exists
    if aws ecs describe-clusters --clusters "$ECS_CLUSTER_NAME" --region "$AWS_REGION" --profile "$AWS_PROFILE" --query 'clusters[0].status' --output text 2>/dev/null | grep -q "ACTIVE"; then
        warn "ECS cluster '$ECS_CLUSTER_NAME' already exists"
        return 0
    fi
    
    # Create cluster
    aws ecs create-cluster \
        --cluster-name "$ECS_CLUSTER_NAME" \
        --capacity-providers FARGATE \
        --default-capacity-provider-strategy capacityProvider=FARGATE,weight=1 \
        --region "$AWS_REGION" \
        --profile "$AWS_PROFILE"
    
    log "ECS cluster created successfully"
}

# Create Application Load Balancer
create_load_balancer() {
    log "Creating Application Load Balancer..."
    
    # Check if ALB exists
    if aws elbv2 describe-load-balancers --names shadow-alb --region "$AWS_REGION" --profile "$AWS_PROFILE" &> /dev/null; then
        ALB_ARN=$(aws elbv2 describe-load-balancers --names shadow-alb --region "$AWS_REGION" --profile "$AWS_PROFILE" --query 'LoadBalancers[0].LoadBalancerArn' --output text)
        warn "Load balancer 'shadow-alb' already exists: $ALB_ARN"
    else
        # Create ALB
        ALB_ARN=$(aws elbv2 create-load-balancer \
            --name shadow-alb \
            --subnets $(echo $SUBNET_IDS | tr ',' ' ') \
            --security-groups "$ECS_SG" \
            --scheme internet-facing \
            --type application \
            --region "$AWS_REGION" \
            --profile "$AWS_PROFILE" \
            --query 'LoadBalancers[0].LoadBalancerArn' \
            --output text)
        
        log "Load balancer created: $ALB_ARN"
    fi
    
    # Create target group
    TG_ARN=$(aws elbv2 create-target-group \
        --name shadow-targets \
        --protocol HTTP \
        --port "$CONTAINER_PORT" \
        --vpc-id "$VPC_ID" \
        --target-type ip \
        --health-check-path /health \
        --health-check-interval-seconds 30 \
        --health-check-timeout-seconds 5 \
        --healthy-threshold-count 2 \
        --unhealthy-threshold-count 3 \
        --region "$AWS_REGION" \
        --profile "$AWS_PROFILE" \
        --query 'TargetGroups[0].TargetGroupArn' \
        --output text 2>/dev/null || \
    aws elbv2 describe-target-groups \
        --names shadow-targets \
        --region "$AWS_REGION" \
        --profile "$AWS_PROFILE" \
        --query 'TargetGroups[0].TargetGroupArn' \
        --output text)
    
    # Enable sticky sessions for WebSocket (check if already enabled first)
    log "Checking sticky sessions on target group..."
    if aws elbv2 describe-target-group-attributes --target-group-arn "$TG_ARN" --region "$AWS_REGION" --profile "$AWS_PROFILE" --query 'Attributes[?Key==`stickiness.enabled`].Value' --output text | grep -q "true"; then
        log "Sticky sessions already enabled"
    else
        log "Enabling sticky sessions on target group..."
        aws elbv2 modify-target-group-attributes \
            --target-group-arn "$TG_ARN" \
            --attributes Key=stickiness.enabled,Value=true Key=stickiness.type,Value=lb_cookie Key=stickiness.lb_cookie.duration_seconds,Value=86400 \
            --region "$AWS_REGION" \
            --profile "$AWS_PROFILE" || warn "Failed to enable sticky sessions, continuing..."
    fi
    
    # Check if HTTP listener already exists
    log "Checking for existing HTTP listener..."
    HTTP_LISTENER_ARN=$(aws elbv2 describe-listeners \
        --load-balancer-arn "$ALB_ARN" \
        --region "$AWS_REGION" \
        --profile "$AWS_PROFILE" \
        --query "Listeners[?Port==\`80\`].ListenerArn" \
        --output text 2>/dev/null || echo "")
    
    if [[ -n "$HTTP_LISTENER_ARN" && "$HTTP_LISTENER_ARN" != "None" ]]; then
        log "HTTP listener already exists: $HTTP_LISTENER_ARN"
    else
        # Create HTTP listener (for redirect or direct access)
        log "Creating HTTP listener..."
        if [[ -n "$SSL_CERTIFICATE_ARN" ]]; then
            # If SSL certificate is provided, redirect HTTP to HTTPS
            aws elbv2 create-listener \
                --load-balancer-arn "$ALB_ARN" \
                --protocol HTTP \
                --port 80 \
                --default-actions Type=redirect,RedirectConfig='{Protocol=HTTPS,Port=443,StatusCode=HTTP_301}' \
                --region "$AWS_REGION" \
                --profile "$AWS_PROFILE" >/dev/null || warn "HTTP listener creation failed, continuing..."
        else
            # If no SSL certificate, create standard HTTP listener
            aws elbv2 create-listener \
                --load-balancer-arn "$ALB_ARN" \
                --protocol HTTP \
                --port 80 \
                --default-actions Type=forward,TargetGroupArn="$TG_ARN" \
                --region "$AWS_REGION" \
                --profile "$AWS_PROFILE" >/dev/null || warn "HTTP listener creation failed, continuing..."
        fi
        log "HTTP listener created successfully"
    fi
    
    # Create HTTPS listener if SSL certificate is provided
    if [[ -n "$SSL_CERTIFICATE_ARN" ]]; then
        # Check if HTTPS listener already exists
        log "Checking for existing HTTPS listener..."
        HTTPS_LISTENER_ARN=$(aws elbv2 describe-listeners \
            --load-balancer-arn "$ALB_ARN" \
            --region "$AWS_REGION" \
            --profile "$AWS_PROFILE" \
            --query "Listeners[?Port==\`443\`].ListenerArn" \
            --output text 2>/dev/null || echo "")
        
        if [[ -n "$HTTPS_LISTENER_ARN" && "$HTTPS_LISTENER_ARN" != "None" ]]; then
            log "HTTPS listener already exists: $HTTPS_LISTENER_ARN"
        else
            log "Creating HTTPS listener with SSL certificate..."
            aws elbv2 create-listener \
                --load-balancer-arn "$ALB_ARN" \
                --protocol HTTPS \
                --port 443 \
                --certificates CertificateArn="$SSL_CERTIFICATE_ARN" \
                --default-actions Type=forward,TargetGroupArn="$TG_ARN" \
                --region "$AWS_REGION" \
                --profile "$AWS_PROFILE" >/dev/null || warn "HTTPS listener creation failed, continuing..."
            log "HTTPS listener created successfully"
        fi
        
        log "HTTPS listener configured with certificate: $SSL_CERTIFICATE_ARN"
    else
        warn "No SSL certificate ARN provided - HTTPS listener not created"
        warn "To enable HTTPS, set SSL_CERTIFICATE_ARN environment variable and re-run"
    fi
    
    log "Load balancer and target group configured"
}

# Create task definition
create_task_definition() {
    log "Creating ECS task definition..."
    
    # Get K8s cluster endpoint
    CLUSTER_ENDPOINT=$(aws eks describe-cluster --name "$CLUSTER_NAME" --region "$AWS_REGION" --profile "$AWS_PROFILE" --query 'cluster.endpoint' --output text)
    K8S_HOST=${CLUSTER_ENDPOINT#https://}
    
    # Create task definition
    cat > task-definition.json << EOF
{
  "family": "$TASK_FAMILY",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "$TASK_CPU",
  "memory": "$TASK_MEMORY",
  "runtimePlatform": {
    "operatingSystemFamily": "LINUX",
    "cpuArchitecture": "X86_64"
  },
  "executionRoleArn": "arn:aws:iam::$ACCOUNT_ID:role/shadowECSExecutionRole",
  "taskRoleArn": "arn:aws:iam::$ACCOUNT_ID:role/shadowECSTaskRole",
  "containerDefinitions": [
    {
      "name": "shadow-server",
      "image": "$ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPO_NAME:latest",
      "portMappings": [
        {
          "containerPort": $CONTAINER_PORT,
          "protocol": "tcp"
        }
      ],
      "environment": [
        {"name": "NODE_ENV", "value": "production"},
        {"name": "AGENT_MODE", "value": "remote"},
        {"name": "AWS_REGION", "value": "$AWS_REGION"},
        {"name": "EKS_CLUSTER_NAME", "value": "$CLUSTER_NAME"},
        {"name": "KUBERNETES_NAMESPACE", "value": "shadow-agents"},
        {"name": "KUBERNETES_SERVICE_HOST", "value": "$K8S_HOST"},
        {"name": "KUBERNETES_SERVICE_PORT", "value": "443"},
        {"name": "ENABLE_BRAINTRUST", "value": "true"}
      ],
      "secrets": [
        {"name": "K8S_SERVICE_ACCOUNT_TOKEN", "valueFrom": "arn:aws:ssm:$AWS_REGION:$ACCOUNT_ID:parameter/shadow/k8s-token"},
        {"name": "DATABASE_URL", "valueFrom": "arn:aws:ssm:$AWS_REGION:$ACCOUNT_ID:parameter/shadow/database-url"},
        {"name": "DIRECT_URL", "valueFrom": "arn:aws:ssm:$AWS_REGION:$ACCOUNT_ID:parameter/shadow/direct-url"},
        {"name": "PINECONE_API_KEY", "valueFrom": "arn:aws:ssm:$AWS_REGION:$ACCOUNT_ID:parameter/shadow/pinecone-api-key"},
        {"name": "PINECONE_INDEX_NAME", "valueFrom": "arn:aws:ssm:$AWS_REGION:$ACCOUNT_ID:parameter/shadow/pinecone-index-name"},
        {"name": "GITHUB_CLIENT_ID", "valueFrom": "arn:aws:ssm:$AWS_REGION:$ACCOUNT_ID:parameter/shadow/github-client-id"},
        {"name": "GITHUB_CLIENT_SECRET", "valueFrom": "arn:aws:ssm:$AWS_REGION:$ACCOUNT_ID:parameter/shadow/github-client-secret"},
        {"name": "GITHUB_WEBHOOK_SECRET", "valueFrom": "arn:aws:ssm:$AWS_REGION:$ACCOUNT_ID:parameter/shadow/github-webhook-secret"},
        {"name": "GITHUB_APP_USER_ID", "valueFrom": "arn:aws:ssm:$AWS_REGION:$ACCOUNT_ID:parameter/shadow/github-app-user-id"},
        {"name": "GITHUB_APP_SLUG", "valueFrom": "arn:aws:ssm:$AWS_REGION:$ACCOUNT_ID:parameter/shadow/github-app-slug"},
        {"name": "VM_IMAGE_REGISTRY", "valueFrom": "arn:aws:ssm:$AWS_REGION:$ACCOUNT_ID:parameter/shadow/vm-image-registry"},
        {"name": "SHADOW_API_KEY", "valueFrom": "arn:aws:ssm:$AWS_REGION:$ACCOUNT_ID:parameter/shadow/shadow-api-key"},
        {"name": "BRAINTRUST_API_KEY", "valueFrom": "arn:aws:ssm:$AWS_REGION:$ACCOUNT_ID:parameter/shadow/braintrust-api-key"},
        {"name": "BRAINTRUST_PROJECT_ID", "valueFrom": "arn:aws:ssm:$AWS_REGION:$ACCOUNT_ID:parameter/shadow/braintrust-project-id"}
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/shadow-server",
          "awslogs-region": "$AWS_REGION",
          "awslogs-stream-prefix": "ecs",
          "awslogs-create-group": "true"
        }
      },
      "healthCheck": {
        "command": ["CMD-SHELL", "curl -f http://localhost:$CONTAINER_PORT/health || exit 1"],
        "interval": 30,
        "timeout": 5,
        "retries": 3,
        "startPeriod": 60
      }
    }
  ]
}
EOF
    
    # Check if identical task definition already exists
    log "Checking for existing task definition..."
    if aws ecs describe-task-definition --task-definition "$TASK_FAMILY" --region "$AWS_REGION" --profile "$AWS_PROFILE" &> /dev/null; then
        # Get current task definition content (excluding metadata)
        CURRENT_TASK_DEF=$(aws ecs describe-task-definition --task-definition "$TASK_FAMILY" --region "$AWS_REGION" --profile "$AWS_PROFILE" --query 'taskDefinition.{family:family,networkMode:networkMode,requiresCompatibilities:requiresCompatibilities,cpu:cpu,memory:memory,runtimePlatform:runtimePlatform,executionRoleArn:executionRoleArn,taskRoleArn:taskRoleArn,containerDefinitions:containerDefinitions}' --output json)
        NEW_TASK_DEF=$(cat task-definition.json)
        
        # Compare definitions (basic check - could be enhanced)
        if echo "$CURRENT_TASK_DEF" | jq -S . > current_def.json && echo "$NEW_TASK_DEF" | jq -S . > new_def.json; then
            if cmp -s current_def.json new_def.json; then
                log "Task definition is identical to existing version, skipping registration"
                rm -f current_def.json new_def.json
                # Clean up and return early
                rm -f task-definition.json
                log "Task definition creation completed (no changes)"
                return 0
            else
                log "Task definition has changes, registering new revision..."
                rm -f current_def.json new_def.json
            fi
        else
            log "Could not compare task definitions, proceeding with registration..."
        fi
    fi
    
    # Register task definition
    log "Registering ECS task definition..."
    log "Detailed output streaming to: $LOG_FILE"
    if aws ecs register-task-definition \
        --cli-input-json file://task-definition.json \
        --region "$AWS_REGION" \
        --profile "$AWS_PROFILE" >> "$LOG_FILE" 2>&1; then
        log "Task definition registered successfully"
    else
        warn "Task definition registration failed, checking if it exists..."
        # Check if task definition was created despite failure
        if aws ecs describe-task-definition --task-definition "$TASK_FAMILY" --region "$AWS_REGION" --profile "$AWS_PROFILE" &> /dev/null; then
            log "Task definition exists, continuing..."
        else
            error "Task definition registration failed and does not exist"
        fi
    fi
    
    # Clean up
    rm -f task-definition.json
    
    log "Task definition creation completed"
}

# Create ECS service
create_ecs_service() {
    log "Creating ECS service..."
    
    # Check if service exists
    if aws ecs describe-services --cluster "$ECS_CLUSTER_NAME" --services "$SERVICE_NAME" --region "$AWS_REGION" --profile "$AWS_PROFILE" --query 'services[0].status' --output text 2>/dev/null | grep -q "ACTIVE"; then
        warn "ECS service '$SERVICE_NAME' already exists"
        return 0
    fi
    
    # Create service
    aws ecs create-service \
        --cluster "$ECS_CLUSTER_NAME" \
        --service-name "$SERVICE_NAME" \
        --task-definition "$TASK_FAMILY" \
        --desired-count "$DESIRED_COUNT" \
        --launch-type FARGATE \
        --platform-version LATEST \
        --network-configuration "awsvpcConfiguration={subnets=[$SUBNET_IDS],securityGroups=[$ECS_SG],assignPublicIp=ENABLED}" \
        --load-balancers "targetGroupArn=$TG_ARN,containerName=shadow-server,containerPort=$CONTAINER_PORT" \
        --health-check-grace-period-seconds 300 \
        --region "$AWS_REGION" \
        --profile "$AWS_PROFILE"
    
    log "ECS service created successfully"
}

# Setup autoscaling for ECS service
setup_autoscaling() {
    if [[ "$ENABLE_AUTOSCALING" != "true" ]]; then
        log "Autoscaling disabled, skipping autoscaling setup"
        return 0
    fi
    
    log "Setting up ECS autoscaling..."
    log "  Min capacity: $MIN_CAPACITY tasks"
    log "  Max capacity: $MAX_CAPACITY tasks"
    log "  CPU target: $TARGET_CPU_UTILIZATION%"
    log "  Memory target: $TARGET_MEMORY_UTILIZATION%"
    
    # Check if service exists first
    if ! aws ecs describe-services --cluster "$ECS_CLUSTER_NAME" --services "$SERVICE_NAME" --region "$AWS_REGION" --profile "$AWS_PROFILE" --query 'services[0].status' --output text 2>/dev/null | grep -q "ACTIVE"; then
        warn "Service '$SERVICE_NAME' does not exist, skipping autoscaling setup"
        return 0
    fi
    
    # Register the service as a scalable target
    log "Registering scalable target..."
    aws application-autoscaling register-scalable-target \
        --service-namespace ecs \
        --resource-id "service/$ECS_CLUSTER_NAME/$SERVICE_NAME" \
        --scalable-dimension ecs:service:DesiredCount \
        --min-capacity "$MIN_CAPACITY" \
        --max-capacity "$MAX_CAPACITY" \
        --region "$AWS_REGION" \
        --profile "$AWS_PROFILE" || {
        warn "Failed to register scalable target, continuing..."
        return 0
    }
    
    # Create CPU utilization scaling policy
    log "Creating CPU utilization scaling policy..."
    aws application-autoscaling put-scaling-policy \
        --service-namespace ecs \
        --resource-id "service/$ECS_CLUSTER_NAME/$SERVICE_NAME" \
        --scalable-dimension ecs:service:DesiredCount \
        --policy-name "shadow-cpu-scaling" \
        --policy-type "TargetTrackingScaling" \
        --target-tracking-scaling-policy-configuration "{
            \"TargetValue\": $TARGET_CPU_UTILIZATION.0,
            \"PredefinedMetricSpecification\": {
                \"PredefinedMetricType\": \"ECSServiceAverageCPUUtilization\"
            },
            \"ScaleOutCooldown\": $SCALE_OUT_COOLDOWN,
            \"ScaleInCooldown\": $SCALE_IN_COOLDOWN
        }" \
        --region "$AWS_REGION" \
        --profile "$AWS_PROFILE" || warn "CPU scaling policy creation failed"
    
    # Create Memory utilization scaling policy
    log "Creating Memory utilization scaling policy..."
    aws application-autoscaling put-scaling-policy \
        --service-namespace ecs \
        --resource-id "service/$ECS_CLUSTER_NAME/$SERVICE_NAME" \
        --scalable-dimension ecs:service:DesiredCount \
        --policy-name "shadow-memory-scaling" \
        --policy-type "TargetTrackingScaling" \
        --target-tracking-scaling-policy-configuration "{
            \"TargetValue\": $TARGET_MEMORY_UTILIZATION.0,
            \"PredefinedMetricSpecification\": {
                \"PredefinedMetricType\": \"ECSServiceAverageMemoryUtilization\"
            },
            \"ScaleOutCooldown\": $SCALE_OUT_COOLDOWN,
            \"ScaleInCooldown\": $SCALE_IN_COOLDOWN
        }" \
        --region "$AWS_REGION" \
        --profile "$AWS_PROFILE" || warn "Memory scaling policy creation failed"
    
    log "✅ Autoscaling configured successfully"
    log "  Service will scale between $MIN_CAPACITY-$MAX_CAPACITY tasks"
    log "  Triggers: CPU >$TARGET_CPU_UTILIZATION% or Memory >$TARGET_MEMORY_UTILIZATION%"
}

# Update ECS service to use latest task definition revision
update_service_to_latest() {
    log "Updating ECS service to use latest task definition revision..."
    
    # Get the latest task definition revision
    LATEST_REVISION=$(aws ecs describe-task-definition \
        --task-definition "$TASK_FAMILY" \
        --region "$AWS_REGION" \
        --profile "$AWS_PROFILE" \
        --query 'taskDefinition.revision' \
        --output text)
    
    log "Latest task definition revision: $LATEST_REVISION"
    
    # Check if service exists before updating
    if ! aws ecs describe-services --cluster "$ECS_CLUSTER_NAME" --services "$SERVICE_NAME" --region "$AWS_REGION" --profile "$AWS_PROFILE" --query 'services[0].status' --output text 2>/dev/null | grep -q "ACTIVE"; then
        warn "Service '$SERVICE_NAME' does not exist, skipping update"
        return 0
    fi
    
    # Get current revision being used by the service
    CURRENT_SERVICE_REVISION=$(aws ecs describe-services \
        --cluster "$ECS_CLUSTER_NAME" \
        --services "$SERVICE_NAME" \
        --region "$AWS_REGION" \
        --profile "$AWS_PROFILE" \
        --query 'services[0].taskDefinition' \
        --output text | sed 's/.*://')
    
    log "Current service revision: $CURRENT_SERVICE_REVISION"
    
    # Only update if there's a new revision
    if [[ "$LATEST_REVISION" == "$CURRENT_SERVICE_REVISION" ]]; then
        log "Service is already using the latest revision, skipping update"
        return 0
    fi
    
    log "Updating service to use revision $LATEST_REVISION and forcing new deployment..."
    
    # Update service with latest task definition and force new deployment
    aws ecs update-service \
        --cluster "$ECS_CLUSTER_NAME" \
        --service "$SERVICE_NAME" \
        --task-definition "$TASK_FAMILY:$LATEST_REVISION" \
        --force-new-deployment \
        --region "$AWS_REGION" \
        --profile "$AWS_PROFILE" \
        --query 'service.serviceName' \
        --output text > /dev/null
    
    if [[ $? -eq 0 ]]; then
        log "Service update initiated successfully"
        log "Waiting for service to stabilize with new revision..."
        
        # Wait for the service to stabilize with new deployment
        aws ecs wait services-stable \
            --cluster "$ECS_CLUSTER_NAME" \
            --services "$SERVICE_NAME" \
            --region "$AWS_REGION" \
            --profile "$AWS_PROFILE"
        
        log "✅ Service updated to revision $LATEST_REVISION and deployment completed"
    else
        error "Failed to update service to latest revision"
    fi
}

# Get service information
get_service_info() {
    log "Getting service information..."
    
    # Get ALB DNS name
    ALB_DNS=$(aws elbv2 describe-load-balancers --names shadow-alb --region "$AWS_REGION" --profile "$AWS_PROFILE" --query 'LoadBalancers[0].DNSName' --output text)
    
    # Get service status
    SERVICE_STATUS=$(aws ecs describe-services --cluster "$ECS_CLUSTER_NAME" --services "$SERVICE_NAME" --region "$AWS_REGION" --profile "$AWS_PROFILE" --query 'services[0].status' --output text)
    
    # Get running tasks count
    RUNNING_TASKS=$(aws ecs describe-services --cluster "$ECS_CLUSTER_NAME" --services "$SERVICE_NAME" --region "$AWS_REGION" --profile "$AWS_PROFILE" --query 'services[0].runningCount' --output text)
    
    # Determine the correct protocol and URL
    if [[ -n "$SSL_CERTIFICATE_ARN" ]]; then
        BACKEND_PROTOCOL="https"
        BACKEND_URL="https://$ALB_DNS"
        log "Service Status: $SERVICE_STATUS"
        log "Running Tasks: $RUNNING_TASKS"
        log "Load Balancer DNS (HTTPS): https://$ALB_DNS"
        log "Load Balancer DNS (HTTP): http://$ALB_DNS (redirects to HTTPS)"
    else
        BACKEND_PROTOCOL="http"
        BACKEND_URL="http://$ALB_DNS"
        log "Service Status: $SERVICE_STATUS"
        log "Running Tasks: $RUNNING_TASKS"
        log "Load Balancer DNS (HTTP): http://$ALB_DNS"
        warn "HTTPS not configured - add SSL_CERTIFICATE_ARN for production use"
    fi
    
    # Save configuration
    cat > .env.ecs-result << EOF
# Shadow ECS Deployment Configuration
# Generated on: $(date -u +%Y-%m-%dT%H:%M:%SZ)

# ECS Configuration
ECS_CLUSTER_NAME=$ECS_CLUSTER_NAME
SERVICE_NAME=$SERVICE_NAME
TASK_FAMILY=$TASK_FAMILY

# Load Balancer
ALB_DNS_NAME=$ALB_DNS
BACKEND_URL=$BACKEND_URL
BACKEND_PROTOCOL=$BACKEND_PROTOCOL

# AWS Configuration
AWS_REGION=$AWS_REGION
VPC_ID=$VPC_ID
ECS_SECURITY_GROUP=$ECS_SG

# ECR
ECR_REPOSITORY_URI=$ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPO_NAME

# Autoscaling Configuration
AUTOSCALING_ENABLED=$ENABLE_AUTOSCALING
MIN_CAPACITY=$MIN_CAPACITY
MAX_CAPACITY=$MAX_CAPACITY
TARGET_CPU_UTILIZATION=$TARGET_CPU_UTILIZATION
TARGET_MEMORY_UTILIZATION=$TARGET_MEMORY_UTILIZATION
EOF
    
    log "Configuration saved to: .env.ecs-result"
}

# Verify deployment
verify_deployment() {
    log "Verifying ECS deployment..."
    
    # Wait for service to be stable
    log "Waiting for service to stabilize..."
    aws ecs wait services-stable \
        --cluster "$ECS_CLUSTER_NAME" \
        --services "$SERVICE_NAME" \
        --region "$AWS_REGION" \
        --profile "$AWS_PROFILE"
    
    # Check service health
    log "Checking service health..."
    HEALTHY_TARGETS=$(aws elbv2 describe-target-health --target-group-arn "$TG_ARN" --region "$AWS_REGION" --profile "$AWS_PROFILE" --query 'TargetHealthDescriptions[?TargetHealth.State==`healthy`] | length(@)')
    
    log "Healthy targets: $HEALTHY_TARGETS"
    
    if [[ "$HEALTHY_TARGETS" -gt 0 ]]; then
        log "✅ ECS deployment verification successful"
    else
        warn "❌ No healthy targets found. Check service logs:"
        log "aws logs tail /ecs/shadow-server --follow --region $AWS_REGION --profile $AWS_PROFILE"
    fi
}

# Main execution
main() {
    log "Starting Shadow backend ECS deployment..."
    log "EKS Cluster: $CLUSTER_NAME"
    log "ECS Cluster: $ECS_CLUSTER_NAME"
    log "Region: $AWS_REGION"
    
    # Setup production environment configuration first
    log "Setting up production environment configuration..."
    "$SCRIPT_DIR/setup-production-env.sh"
    
    # Load SSL_CERTIFICATE_ARN from .env.production if not already set
    if [[ -z "$SSL_CERTIFICATE_ARN" && -f "$PROJECT_ROOT/.env.production" ]]; then
        SSL_CERTIFICATE_ARN=$(grep "^SSL_CERTIFICATE_ARN=" "$PROJECT_ROOT/.env.production" | cut -d'=' -f2- | tr -d '"')
        if [[ -n "$SSL_CERTIFICATE_ARN" ]]; then
            log "SSL certificate ARN loaded from .env.production"
        fi
    fi
    
    check_prerequisites
    get_vpc_info
    create_ecr_repository
    build_and_push_image
    create_security_group
    create_iam_roles
    store_secrets
    create_ecs_cluster
    create_load_balancer
    create_task_definition
    create_ecs_service
    update_service_to_latest
    setup_autoscaling
    get_service_info
    verify_deployment
    
    log "🎉 Shadow backend deployed to ECS successfully!"
    log ""
    log "Next steps:"
    if [[ -n "$SSL_CERTIFICATE_ARN" ]]; then
        log "1. Update your frontend to use: https://$ALB_DNS"
        log "2. Test HTTPS/WSS connections (WebSocket Secure)"
    else
        log "1. Update your frontend to use: http://$ALB_DNS"
        log "2. ⚠️  For production, configure SSL certificate with SSL_CERTIFICATE_ARN"
        log "3. Test HTTP/WS connections"
    fi
    log "3. Verify remote VM communication"
    if [[ "$ENABLE_AUTOSCALING" == "true" ]]; then
        log "4. Monitor autoscaling: Service will scale between $MIN_CAPACITY-$MAX_CAPACITY tasks"
    fi
    log ""
    log "Useful commands:"
    log "- Check service: aws ecs describe-services --cluster $ECS_CLUSTER_NAME --services $SERVICE_NAME"
    log "- View logs: aws logs tail /ecs/shadow-server --follow"
    if [[ "$ENABLE_AUTOSCALING" == "true" ]]; then
        log "- Check scaling: aws application-autoscaling describe-scaling-activities --service-namespace ecs"
        log "- View scaling policies: aws application-autoscaling describe-scaling-policies --service-namespace ecs"
    else
        log "- Manual scale: aws ecs update-service --cluster $ECS_CLUSTER_NAME --service $SERVICE_NAME --desired-count N"
    fi
}

# Handle cleanup on exit
cleanup() {
    log "Cleaning up temporary files..."
    rm -f task-definition.json trust-policy.json task-policy.json
}

trap cleanup EXIT

# Run main function
main "$@"