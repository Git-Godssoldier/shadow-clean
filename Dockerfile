# Multi-stage Dockerfile for Railway deployment
FROM node:18-alpine AS builder

# Install dependencies for building
RUN apk add --no-cache python3 make g++ git

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY turbo.json ./
COPY apps/server/package*.json ./apps/server/
COPY apps/sidecar/package*.json ./apps/sidecar/
COPY packages/*/package*.json ./packages/*/

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Generate Prisma client
RUN npm run generate

# Build the application
RUN npm run build

# Production stage
FROM node:18-alpine

# Install git for workspace operations
RUN apk add --no-cache git

# Create workspace directory
RUN mkdir -p /app/workspace && chmod 777 /app/workspace

WORKDIR /app

# Copy built application
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/server/dist ./apps/server/dist
COPY --from=builder /app/apps/server/package*.json ./apps/server/
COPY --from=builder /app/apps/sidecar/dist ./apps/sidecar/dist
COPY --from=builder /app/apps/sidecar/package*.json ./apps/sidecar/
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/turbo.json ./

# Set environment variables
ENV NODE_ENV=production
ENV AGENT_MODE=local
ENV WORKSPACE_DIR=/app/workspace

# Expose ports
EXPOSE 4000 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:4000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start both services
CMD ["npm", "run", "start:production"]