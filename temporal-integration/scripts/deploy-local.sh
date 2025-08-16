#!/bin/bash

# Local deployment script for development
set -e

echo "🚀 Starting local Temporal deployment..."

# Check if Temporal is installed
if ! command -v temporal &> /dev/null; then
    echo "❌ Temporal CLI not found. Please install it first:"
    echo "   brew install temporal"
    exit 1
fi

# Check if Docker is running
if ! docker info &> /dev/null; then
    echo "❌ Docker is not running. Please start Docker first."
    exit 1
fi

# Stop any existing Temporal server
echo "📦 Stopping existing Temporal server..."
pkill -f "temporal server" || true

# Start Temporal server in development mode
echo "🔧 Starting Temporal server..."
temporal server start-dev --db-filename temporal.db --ui-port 8233 &
TEMPORAL_PID=$!

# Wait for server to be ready
echo "⏳ Waiting for Temporal server to be ready..."
sleep 5

# Check if server is running
if ! curl -s http://localhost:7233 > /dev/null; then
    echo "❌ Temporal server failed to start"
    exit 1
fi

echo "✅ Temporal server is running"
echo "   - Server: localhost:7233"
echo "   - UI: http://localhost:8233"

# Build the project
echo "🔨 Building project..."
npm run build || echo "⚠️  Build had issues, continuing..."

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Run database migrations (if needed)
echo "🗄️ Setting up database..."
if [ -f "src/migrations/run.js" ]; then
    node src/migrations/run.js || echo "⚠️  No migrations to run"
fi

# Start the worker
echo "👷 Starting worker..."
npm run worker:dev &
WORKER_PID=$!

# Start monitoring server
echo "📊 Starting monitoring server..."
node dist/monitoring/server.js &
MONITOR_PID=$!

# Function to cleanup on exit
cleanup() {
    echo "\n🧹 Cleaning up..."
    kill $TEMPORAL_PID 2>/dev/null || true
    kill $WORKER_PID 2>/dev/null || true
    kill $MONITOR_PID 2>/dev/null || true
    echo "✅ Cleanup complete"
}

trap cleanup EXIT

echo ""
echo "✅ Local deployment complete!"
echo ""
echo "📊 Services running:"
echo "   - Temporal Server: http://localhost:7233"
echo "   - Temporal UI: http://localhost:8233"
echo "   - Metrics: http://localhost:9090/metrics"
echo "   - Health: http://localhost:9090/health"
echo ""
echo "📝 Next steps:"
echo "   1. Open Temporal UI: http://localhost:8233"
echo "   2. Run example workflow: npm run example:basic"
echo "   3. Check metrics: http://localhost:9090/metrics"
echo ""
echo "Press Ctrl+C to stop all services..."

# Keep script running
wait