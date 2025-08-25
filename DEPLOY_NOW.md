# 🚀 Deploy Shadow Now - Step by Step

Follow these steps to deploy Shadow to Vercel and Railway.

## Prerequisites Checklist
- [x] GitHub repository ready
- [x] Environment files configured
- [x] Build issues fixed (SWC WASM installed)

## Step 1: Deploy Backend to Railway

### 1.1 Create Railway Account & Project
1. Go to [railway.app](https://railway.app)
2. Sign up/Login with GitHub
3. Click "New Project"
4. Select "Deploy from GitHub repo"
5. Choose your Shadow repository

### 1.2 Add PostgreSQL Database
1. In your Railway project, click "+ New"
2. Select "Database" → "Add PostgreSQL"
3. Railway automatically creates the database

### 1.3 Configure Backend Environment Variables
In Railway dashboard → Variables tab, add:

```env
NODE_ENV=production
AGENT_MODE=local
PORT=4000
GITHUB_CLIENT_ID=your_github_client_id_here
GITHUB_CLIENT_SECRET=your_github_client_secret_here
GITHUB_PERSONAL_TOKEN=your_github_personal_token_here
WORKSPACE_DIR=/app/workspace
SIDECAR_URL=http://localhost:3001
```

### 1.4 Configure Build Settings
In Railway → Settings:
- **Build Command**: `npm install && npm run generate && npm run build`
- **Start Command**: `npm run start:railway`
- **Root Directory**: `/` (leave as is)
- **Watch Paths**: `apps/server/**`, `apps/sidecar/**`, `packages/**`

### 1.5 Deploy
1. Click "Deploy" button
2. Wait for build to complete (5-10 minutes)
3. Copy your Railway URL: `https://shadow-production-xxxx.up.railway.app`

## Step 2: Deploy Frontend to Vercel

### 2.1 Create Vercel Account & Import
1. Go to [vercel.com](https://vercel.com)
2. Sign up/Login with GitHub
3. Click "Add New" → "Project"
4. Import your Shadow repository

### 2.2 Configure Build Settings
Vercel should auto-detect, but verify:
- **Framework Preset**: Next.js
- **Root Directory**: `apps/frontend`
- **Build Command**: `cd ../.. && npm install && npm run build --filter=frontend`
- **Output Directory**: `.next`

### 2.3 Set Environment Variables
Add these in Vercel dashboard:

```env
NEXT_PUBLIC_SERVER_URL=https://shadow-production-xxxx.up.railway.app
DATABASE_URL=[Copy from Railway PostgreSQL]
BETTER_AUTH_SECRET=your_better_auth_secret_here
GITHUB_CLIENT_ID=your_github_client_id_here
GITHUB_CLIENT_SECRET=your_github_client_secret_here
GITHUB_PERSONAL_ACCESS_TOKEN=your_github_personal_access_token_here
```

**Important**: Replace `NEXT_PUBLIC_SERVER_URL` with your actual Railway URL from Step 1.5

### 2.4 Deploy
1. Click "Deploy"
2. Wait for build (3-5 minutes)
3. Get your Vercel URL: `https://shadow-xxxx.vercel.app`

## Step 3: Run Database Migrations

### Option A: Using Railway CLI
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

### Option B: Direct Database Connection
1. Get DATABASE_URL from Railway dashboard
2. Run locally:
```bash
export DATABASE_URL="postgresql://..."
npm run db:migrate:deploy
```

## Step 4: Update GitHub OAuth App

1. Go to GitHub → Settings → Developer settings → OAuth Apps
2. Find your OAuth app (or create new one)
3. Update:
   - **Homepage URL**: `https://shadow-xxxx.vercel.app`
   - **Authorization callback URL**: `https://shadow-xxxx.vercel.app/api/auth/callback/github`
4. Save changes

## Step 5: Test Your Deployment

1. Visit your Vercel URL
2. Click "Sign in with GitHub"
3. Authorize the app
4. Create a test task
5. Run a simple command like `ls` or `echo "Hello Shadow"`

## Troubleshooting

### If build fails on Vercel:
```bash
# Build locally first to test
cd apps/frontend
npm run build
```

### If database connection fails:
- Check DATABASE_URL is correctly set in Vercel
- Ensure Railway database allows external connections
- Try using connection pooling URL if available

### If WebSocket fails:
- Verify NEXT_PUBLIC_SERVER_URL points to Railway
- Check Railway logs for errors
- Ensure CORS is properly configured

### If GitHub OAuth fails:
- Double-check callback URL matches exactly
- Verify CLIENT_ID and SECRET are correct
- Check personal access token has required scopes

## Quick Commands Reference

```bash
# View Railway logs
railway logs

# View Vercel logs
vercel logs

# Redeploy Railway
railway up

# Redeploy Vercel
vercel --prod

# Check deployment status
railway status
vercel ls
```

## Success Indicators

✅ **Railway**: Shows "Deployed" status, no errors in logs
✅ **Vercel**: Shows green checkmark, preview works
✅ **Database**: Migrations completed successfully
✅ **Auth**: Can sign in with GitHub
✅ **WebSocket**: Real-time updates work in chat
✅ **Tasks**: Can create and execute tasks

## Next Steps After Deployment

1. **Custom Domain** (optional):
   - Add custom domain in Vercel settings
   - Update GitHub OAuth callback URL

2. **Monitoring**:
   - Set up Vercel Analytics
   - Configure Railway metrics

3. **Optimization**:
   - Enable Vercel Edge Functions
   - Configure caching headers
   - Set up CDN for assets

---

**Estimated Time**: 20-30 minutes total
**Cost**: ~$5-20/month (Railway charges, Vercel free tier)

Need help? Check logs first, then refer to the comprehensive guide in `DEPLOYMENT_VERCEL_RAILWAY.md`