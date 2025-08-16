#!/bin/bash

# Script to start both the server and frontend for local development

echo "Starting Shadow development environment..."

# Start the server in the background
echo "Starting server on port 4000..."
cd apps/server && npm run dev > server.log 2>&1 &
SERVER_PID=$!

# Start the frontend in the background
echo "Starting frontend on port 3000..."
cd ../frontend && npm run dev > frontend.log 2>&1 &
FRONTEND_PID=$!

echo "Server PID: $SERVER_PID"
echo "Frontend PID: $FRONTEND_PID"
echo ""
echo "Services started!"
echo "Frontend: http://localhost:3000"
echo "Backend API: http://localhost:4000"
echo ""
echo "Logs are being written to server.log and frontend.log"
echo "Press Ctrl+C to stop both services"

# Wait for both processes
wait $SERVER_PID $FRONTEND_PID