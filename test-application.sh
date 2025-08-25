#!/bin/bash

# Shadow Application Test Script
# This script starts both the server and frontend, then tests the application

echo "🚀 Starting Shadow Application Test"
echo "================================="

# Check if required ports are free
if lsof -Pi :3000 -sTCP:LISTEN -t >/dev/null ; then
    echo "❌ Port 3000 is already in use"
    exit 1
fi

if lsof -Pi :4000 -sTCP:LISTEN -t >/dev/null ; then
    echo "❌ Port 4000 is already in use"
    exit 1
fi

echo "✅ Required ports are free"

# Start the server in the background
echo "🔧 Starting server..."
cd apps/server
npm run dev > server.log 2>&1 &
SERVER_PID=$!
cd ../..

# Wait a bit for the server to start
sleep 10

# Check if server is running
if lsof -Pi :4000 -sTCP:LISTEN -t >/dev/null ; then
    echo "✅ Server is running on port 4000"
else
    echo "❌ Server failed to start"
    echo "Server log:"
    cat apps/server/server.log
    exit 1
fi

# Start the frontend in the background
echo "🎨 Starting frontend..."
cd apps/frontend
npm run dev > frontend.log 2>&1 &
FRONTEND_PID=$!
cd ../..

# Wait a bit for the frontend to start
sleep 10

# Check if frontend is running
if lsof -Pi :3000 -sTCP:LISTEN -t >/dev/null ; then
    echo "✅ Frontend is running on port 3000"
else
    echo "❌ Frontend failed to start"
    echo "Frontend log:"
    cat apps/frontend/frontend.log
    # Kill the server process
    kill $SERVER_PID 2>/dev/null
    exit 1
fi

echo "🎉 Both servers are running!"
echo "   Server: http://localhost:4000"
echo "   Frontend: http://localhost:3000"

echo "🧪 Testing application..."

# Test if we can access the frontend
if curl -s http://localhost:3000 > /dev/null ; then
    echo "✅ Application is accessible"
else
    echo "❌ Application is not accessible"
fi

echo "📋 To stop the servers, run:"
echo "   kill $SERVER_PID $FRONTEND_PID"

echo "✨ Test complete!"