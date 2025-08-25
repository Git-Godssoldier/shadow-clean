# Shadow Application Setup Guide

## Overview
This guide explains how to set up the Shadow application for local development with all required credentials and services.

## Prerequisites
1. Node.js >= 18
2. PostgreSQL database
3. GitHub account
4. Optional: Pinecone account (for semantic search)
5. Optional: LLM provider accounts (OpenAI, Anthropic, etc.)

## Setup Steps

### 1. Database Setup
1. Ensure PostgreSQL is running:
   ```bash
   pg_isready
   ```

2. Create the database:
   ```bash
   psql -d postgres -c "CREATE DATABASE shadow_dev;"
   ```

3. If your PostgreSQL user is not "postgres", update the DATABASE_URL in the environment files to use your username:
   ```
   DATABASE_URL="postgres://your_username:@127.0.0.1:5432/shadow_dev"
   ```

### 2. GitHub Credentials Setup
You'll need to create two types of GitHub credentials:

#### GitHub OAuth App (for user authentication)
1. Go to https://github.com/settings/developers
2. Click "New OAuth App"
3. Fill in the details:
   - Application name: Shadow Development
   - Homepage URL: http://localhost:3000
   - Authorization callback URL: http://localhost:3000/api/auth/callback
4. Click "Register application"
5. Copy the Client ID and generate a new Client Secret

#### GitHub Personal Access Token (for repository access)
1. Go to https://github.com/settings/tokens
2. Click "Generate new token" → "Fine-grained tokens"
3. Give it a name like "Shadow Development"
4. Set expiration as needed
5. Under "Repository permissions", select:
   - Contents: Read and write
   - Metadata: Read-only
6. Under "Organization permissions", select:
   - Members: Read-only (if needed)
7. Click "Generate token"
8. Copy the token and save it securely

### 3. Environment Configuration
Create the required environment files:

#### Server Environment (apps/server/.env)
```bash
DATABASE_URL="postgres://your_username:@127.0.0.1:5432/shadow_dev"

# Optional: Pinecone for semantic search
PINECONE_API_KEY=your_pinecone_api_key_here
PINECONE_INDEX_NAME="shadow"

# GitHub credentials
GITHUB_CLIENT_ID=your_github_client_id_here
GITHUB_CLIENT_SECRET=your_github_client_secret_here
GITHUB_PERSONAL_TOKEN=your_github_personal_token_here

# Workspace directory for local agent
WORKSPACE_DIR=/path/to/your/workspace/directory
```

#### Frontend Environment (apps/frontend/.env)
```bash
NEXT_PUBLIC_SERVER_URL="http://localhost:4000"
NEXT_PUBLIC_FORCE_GITHUB_APP=false

# Authentication secret (generate with: openssl rand -base64 32)
BETTER_AUTH_SECRET=your_better_auth_secret_here

# GitHub credentials (same as server)
GITHUB_CLIENT_ID=your_github_client_id_here
GITHUB_CLIENT_SECRET=your_github_client_secret_here
GITHUB_PERSONAL_ACCESS_TOKEN=your_github_personal_token_here

# Database URL (same as server)
DATABASE_URL="postgres://your_username:@127.0.0.1:5432/shadow_dev"
```

#### Database Environment (packages/db/.env)
```bash
DATABASE_URL="postgres://your_username:@127.0.0.1:5432/shadow_dev"
DIRECT_URL="postgres://your_username:@127.0.0.1:5432/shadow_dev"
```

### 4. Database Migrations
1. Generate the Prisma client:
   ```bash
   cd packages/db
   npm run generate
   ```

2. Push the schema to the database:
   ```bash
   npm run db:push
   ```

### 5. Start Development Servers
In separate terminal sessions:

1. Start the server:
   ```bash
   cd apps/server
   npm run dev
   ```

2. Start the frontend:
   ```bash
   cd apps/frontend
   npm run dev
   ```

### 6. Access the Application
Once both servers are running:
- Frontend: http://localhost:3000
- Server API: http://localhost:4000

## Troubleshooting

### Database Connection Issues
- Ensure PostgreSQL is running: `pg_isready`
- Check that the database exists: `psql -d postgres -l`
- Verify the DATABASE_URL in your environment files

### Authentication Issues
- Double-check your GitHub OAuth App credentials
- Ensure the callback URL matches: http://localhost:3000/api/auth/callback
- Verify your Personal Access Token has the correct permissions

### Missing Environment Variables
- Ensure all required environment files are created
- Check that variable names match exactly
- Verify there are no extra spaces or quotes

## Security Notes
- Never commit .env files to version control
- Regenerate BETTER_AUTH_SECRET for production
- Use strong, unique passwords for all services
- Rotate GitHub tokens regularly
- Restrict GitHub token permissions to minimum required

## Next Steps
1. Test the authentication flow
2. Create a task and test tool execution
3. Verify GitHub repository access
4. Test file operations and terminal commands
5. Validate real-time updates and WebSocket connections