#!/bin/bash

# Production Deployment Script for Temporal Integration
# Supports Docker Compose, Kubernetes, and cloud deployments

set -euo pipefail

# ============================================================================
# Configuration
# ============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
DEPLOYMENT_DIR="${PROJECT_ROOT}/deployments"

# Default values
ENVIRONMENT="${ENVIRONMENT:-production}"
DEPLOYMENT_TYPE="${DEPLOYMENT_TYPE:-docker}"
NAMESPACE="${NAMESPACE:-temporal}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
DRY_RUN="${DRY_RUN:-false}"
VERBOSE="${VERBOSE:-false}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ============================================================================
# Helper Functions
# ============================================================================

log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING: $1${NC}"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR: $1${NC}"
    exit 1
}

debug() {
    if [ "$VERBOSE" = "true" ]; then
        echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')] DEBUG: $1${NC}"
    fi
}

check_requirements() {
    local missing=()
    
    case "$DEPLOYMENT_TYPE" in
        docker)
            command -v docker >/dev/null 2>&1 || missing+=("docker")
            command -v docker-compose >/dev/null 2>&1 || missing+=("docker-compose")
            ;;
        kubernetes)
            command -v kubectl >/dev/null 2>&1 || missing+=("kubectl")
            command -v helm >/dev/null 2>&1 || missing+=("helm")
            ;;
        aws)
            command -v aws >/dev/null 2>&1 || missing+=("aws-cli")
            command -v kubectl >/dev/null 2>&1 || missing+=("kubectl")
            ;;
        gcp)
            command -v gcloud >/dev/null 2>&1 || missing+=("gcloud")
            command -v kubectl >/dev/null 2>&1 || missing+=("kubectl")
            ;;
        azure)
            command -v az >/dev/null 2>&1 || missing+=("azure-cli")
            command -v kubectl >/dev/null 2>&1 || missing+=("kubectl")
            ;;
    esac
    
    if [ ${#missing[@]} -ne 0 ]; then
        error "Missing required tools: ${missing[*]}"
    fi
}

validate_environment() {
    case "$ENVIRONMENT" in
        development|staging|production)
            log "Environment: $ENVIRONMENT"
            ;;
        *)
            error "Invalid environment: $ENVIRONMENT. Must be development, staging, or production"
            ;;
    esac
}

build_images() {
    log "Building Docker images..."
    
    cd "$PROJECT_ROOT"
    
    # Build worker image
    docker build \
        -f deployments/docker/Dockerfile.worker \
        -t "temporal-worker:${IMAGE_TAG}" \
        --build-arg ENVIRONMENT="$ENVIRONMENT" \
        .
    
    # Build client image
    docker build \
        -f deployments/docker/Dockerfile.client \
        -t "temporal-client:${IMAGE_TAG}" \
        --build-arg ENVIRONMENT="$ENVIRONMENT" \
        .
    
    log "Docker images built successfully"
}

push_images() {
    local registry="${REGISTRY:-}"
    
    if [ -z "$registry" ]; then
        warn "No registry specified, skipping image push"
        return 0
    fi
    
    log "Pushing images to registry: $registry"
    
    # Tag and push worker image
    docker tag "temporal-worker:${IMAGE_TAG}" "${registry}/temporal-worker:${IMAGE_TAG}"
    docker push "${registry}/temporal-worker:${IMAGE_TAG}"
    
    # Tag and push client image
    docker tag "temporal-client:${IMAGE_TAG}" "${registry}/temporal-client:${IMAGE_TAG}"
    docker push "${registry}/temporal-client:${IMAGE_TAG}"
    
    log "Images pushed successfully"
}

# ============================================================================
# Deployment Functions
# ============================================================================

deploy_docker() {
    log "Deploying with Docker Compose..."
    
    cd "${DEPLOYMENT_DIR}/docker"
    
    # Create environment-specific compose file
    local compose_file="docker-compose.${ENVIRONMENT}.yml"
    if [ ! -f "$compose_file" ]; then
        compose_file="docker-compose.yml"
    fi
    
    # Set environment variables
    export IMAGE_TAG
    export ENVIRONMENT
    
    if [ "$DRY_RUN" = "true" ]; then
        log "DRY RUN: Would execute:"
        echo "docker-compose -f $compose_file up -d"
        return 0
    fi
    
    # Deploy services
    docker-compose -f "$compose_file" up -d
    
    # Wait for services to be healthy
    log "Waiting for services to be healthy..."
    docker-compose -f "$compose_file" ps
    
    # Run health checks
    sleep 30
    run_health_checks_docker
    
    log "Docker deployment completed successfully"
}

deploy_kubernetes() {
    log "Deploying to Kubernetes..."
    
    # Check if namespace exists
    if ! kubectl get namespace "$NAMESPACE" >/dev/null 2>&1; then
        log "Creating namespace: $NAMESPACE"
        kubectl create namespace "$NAMESPACE"
    fi
    
    # Apply secrets
    apply_kubernetes_secrets
    
    # Deploy components
    cd "${DEPLOYMENT_DIR}/kubernetes"
    
    if [ "$DRY_RUN" = "true" ]; then
        log "DRY RUN: Would apply Kubernetes manifests"
        kubectl apply --dry-run=client -f . -n "$NAMESPACE"
        return 0
    fi
    
    # Apply manifests
    kubectl apply -f . -n "$NAMESPACE"
    
    # Wait for rollout
    log "Waiting for deployment rollout..."
    kubectl rollout status deployment/temporal-worker -n "$NAMESPACE" --timeout=600s
    kubectl rollout status deployment/temporal-client -n "$NAMESPACE" --timeout=600s
    
    # Run health checks
    run_health_checks_kubernetes
    
    log "Kubernetes deployment completed successfully"
}

deploy_aws() {
    log "Deploying to AWS EKS..."
    
    # Update kubeconfig
    aws eks update-kubeconfig --region "${AWS_REGION:-us-west-2}" --name "${EKS_CLUSTER_NAME:-temporal-cluster}"
    
    # Deploy using Kubernetes
    deploy_kubernetes
    
    # Configure AWS-specific resources
    configure_aws_resources
    
    log "AWS deployment completed successfully"
}

deploy_gcp() {
    log "Deploying to Google Cloud GKE..."
    
    # Get GKE credentials
    gcloud container clusters get-credentials "${GKE_CLUSTER_NAME:-temporal-cluster}" \
        --zone="${GCP_ZONE:-us-central1-a}" \
        --project="${GCP_PROJECT:-}"
    
    # Deploy using Kubernetes
    deploy_kubernetes
    
    # Configure GCP-specific resources
    configure_gcp_resources
    
    log "GCP deployment completed successfully"
}

deploy_azure() {
    log "Deploying to Azure AKS..."
    
    # Get AKS credentials
    az aks get-credentials --resource-group "${AZURE_RESOURCE_GROUP:-temporal-rg}" \
        --name "${AKS_CLUSTER_NAME:-temporal-cluster}"
    
    # Deploy using Kubernetes
    deploy_kubernetes
    
    # Configure Azure-specific resources
    configure_azure_resources
    
    log "Azure deployment completed successfully"
}

# ============================================================================
# Configuration Functions
# ============================================================================

apply_kubernetes_secrets() {
    log "Applying Kubernetes secrets..."
    
    # Create secrets from environment variables or files
    kubectl create secret generic temporal-secrets \
        --from-literal=database-url="${DATABASE_URL:-postgresql://temporal:temporal@postgres:5432/temporal}" \
        --from-literal=redis-url="${REDIS_URL:-redis://redis:6379}" \
        --namespace="$NAMESPACE" \
        --dry-run=client -o yaml | kubectl apply -f -
    
    # TLS secrets if provided
    if [ -n "${TLS_CERT_PATH:-}" ] && [ -n "${TLS_KEY_PATH:-}" ]; then
        kubectl create secret tls temporal-tls \
            --cert="$TLS_CERT_PATH" \
            --key="$TLS_KEY_PATH" \
            --namespace="$NAMESPACE" \
            --dry-run=client -o yaml | kubectl apply -f -
    fi
}

configure_aws_resources() {
    log "Configuring AWS-specific resources..."
    
    # Configure Application Load Balancer
    if [ "${ENABLE_ALB:-false}" = "true" ]; then
        log "Configuring Application Load Balancer..."
        # ALB configuration would go here
    fi
    
    # Configure RDS if needed
    if [ "${USE_RDS:-false}" = "true" ]; then
        log "Configuring RDS connection..."
        # RDS configuration would go here
    fi
    
    # Configure ElastiCache if needed
    if [ "${USE_ELASTICACHE:-false}" = "true" ]; then
        log "Configuring ElastiCache connection..."
        # ElastiCache configuration would go here
    fi
}

configure_gcp_resources() {
    log "Configuring GCP-specific resources..."
    
    # Configure Cloud Load Balancer
    if [ "${ENABLE_GLB:-false}" = "true" ]; then
        log "Configuring Google Cloud Load Balancer..."
        # GLB configuration would go here
    fi
    
    # Configure Cloud SQL if needed
    if [ "${USE_CLOUD_SQL:-false}" = "true" ]; then
        log "Configuring Cloud SQL connection..."
        # Cloud SQL configuration would go here
    fi
}

configure_azure_resources() {
    log "Configuring Azure-specific resources..."
    
    # Configure Azure Load Balancer
    if [ "${ENABLE_ALB:-false}" = "true" ]; then
        log "Configuring Azure Load Balancer..."
        # Azure LB configuration would go here
    fi
    
    # Configure Azure Database if needed
    if [ "${USE_AZURE_DB:-false}" = "true" ]; then
        log "Configuring Azure Database connection..."
        # Azure DB configuration would go here
    fi
}

# ============================================================================
# Health Check Functions
# ============================================================================

run_health_checks_docker() {
    log "Running Docker health checks..."
    
    local services=("temporal-server" "temporal-worker-1" "temporal-worker-2" "temporal-client")
    
    for service in "${services[@]}"; do
        log "Checking health of $service..."
        
        local retries=10
        local count=0
        
        while [ $count -lt $retries ]; do
            if docker-compose ps "$service" | grep -q "healthy\|Up"; then
                log "$service is healthy"
                break
            fi
            
            count=$((count + 1))
            if [ $count -eq $retries ]; then
                error "$service failed health check"
            fi
            
            sleep 10
        done
    done
}

run_health_checks_kubernetes() {
    log "Running Kubernetes health checks..."
    
    # Check deployment status
    kubectl get deployments -n "$NAMESPACE"
    
    # Check pod status
    kubectl get pods -n "$NAMESPACE"
    
    # Check services
    kubectl get services -n "$NAMESPACE"
    
    # Verify worker connectivity
    log "Verifying worker connectivity..."
    kubectl exec -n "$NAMESPACE" deployment/temporal-worker -- curl -f http://localhost:3000/health || error "Worker health check failed"
    
    # Verify client connectivity
    log "Verifying client connectivity..."
    kubectl exec -n "$NAMESPACE" deployment/temporal-client -- curl -f http://localhost:8080/health || error "Client health check failed"
}

# ============================================================================
# Utility Functions
# ============================================================================

show_deployment_info() {
    log "Deployment Information:"
    echo "  Environment: $ENVIRONMENT"
    echo "  Deployment Type: $DEPLOYMENT_TYPE"
    echo "  Image Tag: $IMAGE_TAG"
    echo "  Namespace: $NAMESPACE"
    echo "  Dry Run: $DRY_RUN"
    
    case "$DEPLOYMENT_TYPE" in
        kubernetes|aws|gcp|azure)
            echo ""
            echo "Kubernetes Resources:"
            kubectl get all -n "$NAMESPACE" 2>/dev/null || true
            ;;
        docker)
            echo ""
            echo "Docker Services:"
            cd "${DEPLOYMENT_DIR}/docker"
            docker-compose ps 2>/dev/null || true
            ;;
    esac
}

cleanup() {
    log "Cleaning up..."
    
    case "$DEPLOYMENT_TYPE" in
        docker)
            cd "${DEPLOYMENT_DIR}/docker"
            docker-compose down
            ;;
        kubernetes|aws|gcp|azure)
            kubectl delete namespace "$NAMESPACE" --ignore-not-found=true
            ;;
    esac
    
    log "Cleanup completed"
}

show_usage() {
    cat << EOF
Usage: $0 [OPTIONS] [COMMAND]

Deploy Temporal Integration to various environments.

COMMANDS:
    deploy      Deploy the application (default)
    build       Build Docker images only
    cleanup     Clean up deployment
    info        Show deployment information
    health      Run health checks

OPTIONS:
    -e, --environment ENV    Deployment environment (development|staging|production)
    -t, --type TYPE         Deployment type (docker|kubernetes|aws|gcp|azure)
    -n, --namespace NS      Kubernetes namespace
    -i, --image-tag TAG     Docker image tag
    -r, --registry REG      Docker registry URL
    -d, --dry-run          Perform dry run
    -v, --verbose          Verbose output
    -h, --help             Show this help

EXAMPLES:
    # Deploy to Docker Compose
    $0 --type docker --environment production

    # Deploy to Kubernetes
    $0 --type kubernetes --namespace temporal-prod --image-tag v1.0.0

    # Deploy to AWS EKS
    $0 --type aws --environment production --image-tag latest

    # Dry run deployment
    $0 --type kubernetes --dry-run

EOF
}

# ============================================================================
# Main Function
# ============================================================================

main() {
    local command="deploy"
    
    # Parse command line arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            -e|--environment)
                ENVIRONMENT="$2"
                shift 2
                ;;
            -t|--type)
                DEPLOYMENT_TYPE="$2"
                shift 2
                ;;
            -n|--namespace)
                NAMESPACE="$2"
                shift 2
                ;;
            -i|--image-tag)
                IMAGE_TAG="$2"
                shift 2
                ;;
            -r|--registry)
                REGISTRY="$2"
                shift 2
                ;;
            -d|--dry-run)
                DRY_RUN="true"
                shift
                ;;
            -v|--verbose)
                VERBOSE="true"
                shift
                ;;
            -h|--help)
                show_usage
                exit 0
                ;;
            deploy|build|cleanup|info|health)
                command="$1"
                shift
                ;;
            *)
                error "Unknown option: $1"
                ;;
        esac
    done
    
    # Validate inputs
    validate_environment
    check_requirements
    
    # Execute command
    case "$command" in
        deploy)
            log "Starting deployment..."
            build_images
            push_images
            
            case "$DEPLOYMENT_TYPE" in
                docker)
                    deploy_docker
                    ;;
                kubernetes)
                    deploy_kubernetes
                    ;;
                aws)
                    deploy_aws
                    ;;
                gcp)
                    deploy_gcp
                    ;;
                azure)
                    deploy_azure
                    ;;
                *)
                    error "Unsupported deployment type: $DEPLOYMENT_TYPE"
                    ;;
            esac
            ;;
        build)
            build_images
            push_images
            ;;
        cleanup)
            cleanup
            ;;
        info)
            show_deployment_info
            ;;
        health)
            case "$DEPLOYMENT_TYPE" in
                docker)
                    run_health_checks_docker
                    ;;
                kubernetes|aws|gcp|azure)
                    run_health_checks_kubernetes
                    ;;
            esac
            ;;
        *)
            error "Unknown command: $command"
            ;;
    esac
    
    log "Operation completed successfully!"
}

# Execute main function with all arguments
main "$@"