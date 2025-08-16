# Shadow Deployment Environment Variables

This document outlines all the required and optional environment variables needed for deploying the Shadow application.

## Required Variables

### Backend (Railway)

| Variable | Description | Example |
|----------|-------------|---------|
| `NODE_ENV` | Node.js environment | `production` |
| `AGENT_MODE` | Execution mode for the agent | `remote` |
| `PORT` | Port for the server to listen on | `4000` |
| `DATABASE_URL` | PostgreSQL database connection URL | `postgresql://user:pass@host:5432/dbname` |
| `GITHUB_CLIENT_ID` | GitHub OAuth App Client ID | `your_github_client_id` |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth App Client Secret | `your_github_client_secret` |
| `BETTER_AUTH_SECRET` | Secret for authentication | `generate_a_secure_random_string` |
| `NEXT_PUBLIC_SERVER_URL` | Public URL of the backend | `https://your-app.railway.app` |

### Frontend (Vercel)

| Variable | Description | Example |
|----------|-------------|---------|
| `NEXT_PUBLIC_SERVER_URL` | URL of the backend API | `https://your-app.railway.app` |
| `NEXT_PUBLIC_VERCEL_ENV` | Vercel environment | `production` |
| `GITHUB_CLIENT_ID` | GitHub OAuth App Client ID | `your_github_client_id` |
| `BETTER_AUTH_SECRET` | Must match backend's secret | `same_as_backend_secret` |

## Optional Variables

### Backend

| Variable | Description | Default |
|----------|-------------|---------|
| `WORKSPACE_DIR` | Local workspace directory (for local mode) | `/workspace` |
| `PINECONE_API_KEY` | API key for Pinecone vector database | - |
| `PINECONE_INDEX_NAME` | Name of the Pinecone index | `shadow` |
| `EMBEDDING_MODEL` | Model to use for embeddings | `llama-text-embed-v2` |
| `CONCURRENCY` | Number of concurrent operations | `4` |
| `MODEL` | Default model to use | `gpt-4o` |
| `MODEL_MINI` | Smaller model for less critical tasks | `gpt-4o-mini` |

### Frontend

| Variable | Description | Default |
|----------|-------------|---------|
| `NEXT_PUBLIC_ANALYTICS_ID` | Analytics tracking ID | - |
| `NEXT_PUBLIC_SENTRY_DSN` | Sentry DSN for error tracking | - |

## GitHub App Configuration

For full GitHub integration, you'll need to configure a GitHub App with these settings:

1. **Homepage URL**: `https://your-vercel-app.vercel.app`
2. **Callback URL**: `https://your-vercel-app.vercel.app/api/auth/callback/github`
3. **Webhook URL**: `https://your-app.railway.app/webhooks/github`
4. **Required Permissions**:
   - Repository: Contents (Read & Write)
   - Pull Requests (Read & Write)
   - Metadata (Read-only)

## Environment Setup Script

Use the included `setup-script.sh` to configure your environment variables:

```bash
chmod +x setup-script.sh
./setup-script.sh
```

## Verifying Configuration

After setting up your environment variables, verify them using:

```bash
# Check required variables
./secure-deploy.sh --check-env
```

## Security Notes

1. Never commit `.env` files to version control
2. Use different secrets for development and production
3. Rotate secrets regularly
4. Use strong, randomly generated strings for secrets
5. Limit permissions to the minimum required
