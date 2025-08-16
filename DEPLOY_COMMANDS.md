# 🚀 Deploy Shadow with CLI Commands

Since you have both Railway and Vercel CLIs installed, here are the exact commands to deploy Shadow quickly:

## Step 1: Authenticate (Run These First)

```bash
# Authenticate with Railway (opens browser)
railway login

# Authenticate with Vercel (opens browser)  
vercel login
```

## Step 2: Deploy Backend to Railway

```bash
# Create Railway project
railway project new shadow-backend

# Link to the project
railway link

# Add PostgreSQL database
railway add postgresql

# Set environment variables
railway variables set NODE_ENV=production
railway variables set AGENT_MODE=local
railway variables set PORT=4000
railway variables set GITHUB_CLIENT_ID=your_github_client_id_here
railway variables set GITHUB_CLIENT_SECRET=your_github_client_secret_here
railway variables set GITHUB_PERSONAL_TOKEN=your_github_personal_token_here
railway variables set WORKSPACE_DIR=/app/workspace
railway variables set SIDECAR_URL=http://localhost:3001

# Deploy the backend
railway up

# Get your Railway URL (save this for next step)
railway status
```

## Step 3: Deploy Frontend to Vercel

```bash
# Go to frontend directory
cd apps/frontend

# Link to Vercel project (or create new one)
vercel link

# Set environment variables (replace YOUR_RAILWAY_URL with actual URL from step 2)
vercel env add NEXT_PUBLIC_SERVER_URL
# Enter: https://YOUR_RAILWAY_URL.railway.app

vercel env add DATABASE_URL  
# Enter: (copy from Railway dashboard - PostgreSQL connection string)

vercel env add BETTER_AUTH_SECRET
# Enter: your_better_auth_secret_here

vercel env add GITHUB_CLIENT_ID
# Enter: your_github_client_id_here

vercel env add GITHUB_CLIENT_SECRET  
# Enter: your_github_client_secret_here

vercel env add GITHUB_PERSONAL_ACCESS_TOKEN
# Enter: your_github_personal_access_token_here

# Deploy to production
vercel --prod

# Go back to root
cd ../..
```

## Step 4: Run Database Migrations

```bash
# Run migrations via Railway
railway run npm run db:migrate:deploy
```

## Step 5: Update GitHub OAuth App

1. Go to GitHub → Settings → Developer settings → OAuth Apps
2. Find your OAuth app with Client ID: `your_github_client_id_here`
3. Update:
   - **Homepage URL**: `https://your-vercel-app.vercel.app` (from Vercel deployment)
   - **Authorization callback URL**: `https://your-vercel-app.vercel.app/api/auth/callback/github`

## Quick Status Check Commands

```bash
# Check Railway deployment
railway status
railway logs

# Check Vercel deployment  
vercel ls
vercel logs

# Test database connection
railway run npm run db:studio
```

## Alternative: One-Line Commands (After Authentication)

If you want to run everything quickly:

```bash
# Backend
railway project new shadow-backend && railway link && railway add postgresql && railway variables set NODE_ENV=production AGENT_MODE=local PORT=4000 GITHUB_CLIENT_ID=your_github_client_id_here GITHUB_CLIENT_SECRET=your_github_client_secret_here GITHUB_PERSONAL_TOKEN=your_github_personal_token_here WORKSPACE_DIR=/app/workspace SIDECAR_URL=http://localhost:3001 && railway up

# Frontend (after getting Railway URL)
cd apps/frontend && vercel link && vercel --prod && cd ../..

# Migrations
railway run npm run db:migrate:deploy
```

## Expected Output

- **Railway URL**: `https://shadow-backend-production-xxxx.up.railway.app`
- **Vercel URL**: `https://shadow-xxxx.vercel.app`  
- **Total Time**: ~10-15 minutes
- **Cost**: ~$5-15/month

## Troubleshooting

**If Railway deployment fails:**
```bash
railway logs
```

**If Vercel build fails:**
```bash
vercel logs
# Or try building locally first
npm run build
```

**If database connection fails:**
```bash
# Check Railway database
railway run npm run db:studio
```

## Success Indicators

✅ `railway status` shows "Deployed"
✅ `vercel ls` shows your project  
✅ Can visit both URLs without errors
✅ Can sign in with GitHub
✅ Can create and run tasks

---

**Pro Tip**: Copy these commands to a text file and run them one by one for fastest deployment!