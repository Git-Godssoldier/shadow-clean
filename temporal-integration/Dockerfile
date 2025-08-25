# Multi-stage Docker build for Temporal worker

# Stage 1: Builder
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci --only=production
RUN npm ci --only=development

# Copy source code
COPY src ./src
COPY webpack.config.js ./

# Build the application
RUN npm run build || true

# Stage 2: Runtime
FROM node:20-alpine

WORKDIR /app

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create non-root user
RUN addgroup -g 1001 -S temporal && \
    adduser -S temporal -u 1001

# Copy package files and install production dependencies
COPY package*.json ./
RUN npm ci --only=production && \
    npm cache clean --force

# Copy built application from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src/workflows ./src/workflows

# Copy configuration files
COPY .env.example .env.example

# Set ownership
RUN chown -R temporal:temporal /app

# Switch to non-root user
USER temporal

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:9090/health', (r) => {r.statusCode === 200 ? process.exit(0) : process.exit(1)})"

# Expose metrics port
EXPOSE 9090

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Default command (can be overridden)
CMD ["node", "dist/workers/index.js"]