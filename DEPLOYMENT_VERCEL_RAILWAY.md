# Shadow Deployment Guide - Vercel + Railway

This guide explains how to deploy Shadow using Vercel for the frontend and Railway for the backend services and database.

## Architecture Overview

- **Frontend**: Next.js app deployed on Vercel
- **Backend**: Node.js server + Sidecar service on Railway
- **Database**: PostgreSQL on Railway
- **Execution Mode**: Local mode (no Kubernetes/VMs required)

## Prerequisites

- GitHub account
- Vercel account (free tier works)
- Railway account (free trial or paid)
- Git installed locally

## Step 1: Prepare the Repository

1. Fork or push this repository to your GitHub account
2. Ensure all files are committed:
```bash
git add .
git commit -m "Prepare for deployment"
git push origin main
```

## Step 2: Deploy Backend to Railway

### 2.1 Create Railway Project

1. Go to [Railway](https://railway.app)
2. Click "New Project"
3. Select "Deploy from GitHub repo"
4. Connect your GitHub account and select the Shadow repository
5. Railway will auto-detect the monorepo structure

### 2.2 Add PostgreSQL Database

1. In your Railway project, click "New Service"
2. Select "Database" → "PostgreSQL"
3. Railway will automatically create a database and set the `DATABASE_URL`

### 2.3 Configure Backend Service

1. Click on the deployed service
2. Go to "Variables" tab
3. Add the following environment variables:

```env
# Core Configuration
NODE_ENV=production
AGENT_MODE=local
PORT=4000

# GitHub (from your OAuth app)
GITHUB_CLIENT_ID=your_github_client_id_here
GITHUB_CLIENT_SECRET=your_github_client_secret_here
GITHUB_PERSONAL_TOKEN=your_github_personal_token_here

# Workspace
WORKSPACE_DIR=/app/workspace

# Sidecar
SIDECAR_URL=http://localhost:3001

# Optional: Pinecone
PINECONE_API_KEY=your-pinecone-key
PINECONE_INDEX_NAME=shadow
```

### 2.4 Update Build Settings

1. Go to "Settings" tab
2. Set Build Command: `npm install && npm run generate && npm run build`
3. Set Start Command: `npm run start:railway`
4. Set Root Directory: `/` (keep as monorepo root)

### 2.5 Deploy

1. Click "Deploy" or push to your GitHub repo
2. Railway will automatically build and deploy
3. Note your Railway app URL (e.g., `https://shadow-production.up.railway.app`)

## Step 3: Deploy Frontend to Vercel

### 3.1 Import Project

1. Go to [Vercel](https://vercel.com)
2. Click "Add New" → "Project"
3. Import your GitHub repository
4. Select the Shadow repository

### 3.2 Configure Build Settings

Vercel should auto-detect Next.js, but verify:

- **Framework Preset**: Next.js
- **Root Directory**: `apps/frontend`
- **Build Command**: `cd ../.. && npm install && npm run build --filter=frontend`
- **Output Directory**: `.next`
- **Install Command**: `cd ../.. && npm install`

### 3.3 Set Environment Variables

In the Vercel dashboard, add these environment variables:

```env
# Railway Backend URL (from Step 2.5)
NEXT_PUBLIC_SERVER_URL=https://shadow-production.up.railway.app

# Database (Railway PostgreSQL)
DATABASE_URL=postgresql://postgres:xxx@xxx.railway.app:5432/railway

# Authentication
BETTER_AUTH_SECRET=your_better_auth_secret_here

# GitHub OAuth
GITHUB_CLIENT_ID=your_github_client_id_here
GITHUB_CLIENT_SECRET=your_github_client_secret_here
GITHUB_PERSONAL_ACCESS_TOKEN=your_github_personal_access_token_here
```

### 3.4 Deploy

1. Click "Deploy"
2. Vercel will build and deploy your frontend
3. Note your Vercel URL (e.g., `https://shadow.vercel.app`)

## Step 4: Database Setup

### 4.1 Run Migrations

SSH into Railway or use Railway CLI:

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Link to your project
railway link

# Run migrations
railway run npm run db:migrate:deploy
```

### 4.2 Alternative: Local Migration

```bash
# Export Railway database URL
export DATABASE_URL="your-railway-database-url"

# Run migrations locally
npm run db:migrate:deploy
```

## Step 5: Configure GitHub OAuth App

1. Go to GitHub Settings → Developer settings → OAuth Apps
2. Update your OAuth app:
   - **Homepage URL**: `https://your-app.vercel.app`
   - **Authorization callback URL**: `https://your-app.vercel.app/api/auth/callback/github`

## Step 6: Configure CORS and WebSockets

### Update Backend CORS

In Railway, add environment variable:
```env
CORS_ORIGIN=https://your-app.vercel.app
```

### Enable WebSocket Support

Railway supports WebSockets by default. Ensure your backend is configured to accept connections from your Vercel frontend URL.

## Step 7: Testing

1. Visit your Vercel URL
2. Sign in with GitHub
3. Create a test task to verify:
   - Database connectivity
   - WebSocket connections
   - File operations
   - Terminal commands

## Monitoring and Logs

### Railway Logs
- Click on your service → "Logs" tab
- Use Railway CLI: `railway logs`

### Vercel Logs
- Vercel Dashboard → Functions → Logs
- Use Vercel CLI: `vercel logs`

## Troubleshooting

### Database Connection Issues

If frontend can't connect to database:
1. Ensure DATABASE_URL is set in Vercel
2. Check if Railway database allows external connections
3. Consider using Prisma Data Proxy for connection pooling

### WebSocket Connection Failed

1. Check CORS settings in backend
2. Verify NEXT_PUBLIC_SERVER_URL in Vercel points to Railway URL
3. Ensure Railway service is running

### Build Failures

**Vercel Build Error:**
```bash
# Build locally first
cd apps/frontend
npm run build
```

**Railway Build Error:**
```bash
# Check logs for specific errors
railway logs
```

### GitHub OAuth Issues

1. Verify callback URL matches exactly
2. Check CLIENT_ID and CLIENT_SECRET match
3. Ensure personal access token has required scopes

## Cost Optimization

### Vercel (Frontend)
- **Free tier**: 100GB bandwidth, unlimited deployments
- **Pro**: $20/month for team features

### Railway (Backend + Database)
- **Trial**: $5 free credit
- **Hobby**: $5/month + usage
- **Pro**: $20/month + usage
- **Estimated monthly**: $10-30 for typical usage

### Tips to Reduce Costs
1. Use Vercel's Edge Functions for API routes
2. Implement caching for database queries
3. Use Railway's sleep feature during low traffic
4. Consider Supabase for free PostgreSQL alternative

## Production Checklist

- [ ] SSL certificates configured (automatic on both platforms)
- [ ] Environment variables set on both platforms
- [ ] Database migrations completed
- [ ] GitHub OAuth app configured with production URLs
- [ ] CORS configured for production domains
- [ ] Error tracking configured (Sentry, etc.)
- [ ] Monitoring set up (Uptime, performance)
- [ ] Backup strategy for database
- [ ] Rate limiting configured
- [ ] Security headers added

## Scaling Considerations

### When to Scale

- More than 100 concurrent users
- Database queries taking >1 second
- Memory usage >80%

### How to Scale

**Vercel:**
- Automatic scaling for frontend
- Consider ISR for static content
- Use Edge Functions for geo-distribution

**Railway:**
- Horizontal scaling: Add more service instances
- Vertical scaling: Increase memory/CPU
- Database: Enable read replicas
- Consider Redis for caching

## Alternative Deployment Options

If Railway doesn't meet your needs:

### Backend Alternatives
- **Render.com**: Similar to Railway, good free tier
- **Fly.io**: Better for WebSocket-heavy apps
- **DigitalOcean App Platform**: More control, predictable pricing

### Database Alternatives
- **Supabase**: Free PostgreSQL with good limits
- **Neon**: Serverless PostgreSQL
- **PlanetScale**: MySQL with branching

## Support

For deployment issues:
1. Check Railway and Vercel status pages
2. Review deployment logs
3. Open issue on GitHub with error details
4. Join Railway/Vercel Discord communities

---

**Next Steps:**
1. Complete deployment following this guide
2. Test all features thoroughly
3. Configure custom domain (optional)
4. Set up monitoring and alerts
5. Implement backup strategy