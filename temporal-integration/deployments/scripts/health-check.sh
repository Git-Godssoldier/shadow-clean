#!/bin/bash

# Health Check Script for Temporal Integration
# Used by Docker containers and Kubernetes pods

set -euo pipefail

# Configuration
HEALTH_ENDPOINT="${HEALTH_ENDPOINT:-http://localhost:3000/health}"
TIMEOUT="${TIMEOUT:-10}"
MAX_RETRIES="${MAX_RETRIES:-3}"
RETRY_DELAY="${RETRY_DELAY:-2}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

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

# Check if curl is available
if ! command -v curl >/dev/null 2>&1; then
    error "curl is not available"
fi

# Health check function
check_health() {
    local endpoint="$1"
    local retries=0
    
    while [ $retries -lt $MAX_RETRIES ]; do
        if curl -f -s --max-time "$TIMEOUT" "$endpoint" >/dev/null 2>&1; then
            log "Health check passed: $endpoint"
            return 0
        fi
        
        retries=$((retries + 1))
        if [ $retries -lt $MAX_RETRIES ]; then
            warn "Health check failed (attempt $retries/$MAX_RETRIES): $endpoint"
            sleep "$RETRY_DELAY"
        fi
    done
    
    error "Health check failed after $MAX_RETRIES attempts: $endpoint"
}

# Extended health checks
check_extended_health() {
    log "Running extended health checks..."
    
    # Check memory usage
    if command -v free >/dev/null 2>&1; then
        local memory_usage
        memory_usage=$(free | grep Mem | awk '{printf "%.1f", ($3/$2) * 100.0}')
        log "Memory usage: ${memory_usage}%"
        
        if (( $(echo "$memory_usage > 90" | bc -l) )); then
            warn "High memory usage: ${memory_usage}%"
        fi
    fi
    
    # Check disk usage
    if command -v df >/dev/null 2>&1; then
        local disk_usage
        disk_usage=$(df / | tail -1 | awk '{print $5}' | sed 's/%//')
        log "Disk usage: ${disk_usage}%"
        
        if [ "$disk_usage" -gt 90 ]; then
            warn "High disk usage: ${disk_usage}%"
        fi
    fi
    
    # Check process count
    if command -v ps >/dev/null 2>&1; then
        local process_count
        process_count=$(ps aux | wc -l)
        log "Process count: $process_count"
    fi
}

# Specific checks based on service type
check_worker_health() {
    log "Checking worker-specific health..."
    
    # Check worker endpoints
    local endpoints=(
        "http://localhost:3000/health"
        "http://localhost:3000/ready"
        "http://localhost:3000/metrics"
    )
    
    for endpoint in "${endpoints[@]}"; do
        check_health "$endpoint"
    done
    
    # Check worker-specific metrics
    if curl -f -s --max-time "$TIMEOUT" "http://localhost:3000/metrics" | grep -q "temporal_worker_"; then
        log "Worker metrics available"
    else
        warn "Worker metrics not available"
    fi
}

check_client_health() {
    log "Checking client-specific health..."
    
    # Check client endpoints
    local endpoints=(
        "http://localhost:8080/health"
        "http://localhost:8080/ready"
    )
    
    for endpoint in "${endpoints[@]}"; do
        check_health "$endpoint"
    done
}

check_temporal_connectivity() {
    log "Checking Temporal server connectivity..."
    
    local temporal_address="${TEMPORAL_ADDRESS:-temporal-server:7233}"
    
    # Check if we can reach Temporal server
    if command -v nc >/dev/null 2>&1; then
        if nc -z -w5 "${temporal_address%:*}" "${temporal_address#*:}" 2>/dev/null; then
            log "Temporal server is reachable: $temporal_address"
        else
            error "Cannot reach Temporal server: $temporal_address"
        fi
    elif command -v telnet >/dev/null 2>&1; then
        if timeout 5 telnet "${temporal_address%:*}" "${temporal_address#*:}" </dev/null 2>/dev/null; then
            log "Temporal server is reachable: $temporal_address"
        else
            error "Cannot reach Temporal server: $temporal_address"
        fi
    else
        warn "Cannot test Temporal connectivity (nc or telnet not available)"
    fi
}

# Main health check
main() {
    local check_type="${1:-basic}"
    
    case "$check_type" in
        basic)
            check_health "$HEALTH_ENDPOINT"
            ;;
        worker)
            check_worker_health
            check_temporal_connectivity
            ;;
        client)
            check_client_health
            check_temporal_connectivity
            ;;
        extended)
            check_health "$HEALTH_ENDPOINT"
            check_extended_health
            check_temporal_connectivity
            ;;
        startup)
            # Startup probe - more lenient
            MAX_RETRIES=10
            RETRY_DELAY=5
            check_health "$HEALTH_ENDPOINT"
            ;;
        *)
            error "Unknown check type: $check_type"
            ;;
    esac
    
    log "Health check completed successfully"
}

# Handle different probe types based on script name or argument
if [[ "${0##*/}" == "startup-probe.sh" ]] || [[ "${1:-}" == "startup" ]]; then
    main startup
elif [[ "${0##*/}" == "worker-health.sh" ]] || [[ "${1:-}" == "worker" ]]; then
    main worker
elif [[ "${0##*/}" == "client-health.sh" ]] || [[ "${1:-}" == "client" ]]; then
    main client
elif [[ "${1:-}" == "extended" ]]; then
    main extended
else
    main basic
fi