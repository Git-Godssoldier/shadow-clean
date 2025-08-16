# 🚀 Quick Deploy Guide - Shadow to Railway + Vercel

**Time Required**: ~15-20 minutes  
**Cost**: ~$5-15/month (Railway) + Free (Vercel)

## Step 1: Deploy Backend to Railway (5 minutes)

1. **Sign up/Login**: Go to [railway.app](https://railway.app) and sign in with GitHub
2. **Create Project**: Click "New Project" → "Deploy from GitHub repo" → Select this repository
3. **Add Database**: Click "New" → "Database" → "PostgreSQL" 
4. **Set Environment Variables** (copy from `.env.railway`):
   ```
   NODE_ENV=production
   GITHUB_CLIENT_ID=your_github_client_id_here
   GITHUB_CLIENT_SECRET=[your-secret]
   JWT_SECRET=[generate-random-32-chars]
   ANTHROPIC_API_KEY=[your-key]
   OPENAI_API_KEY=[your-key]
   ```
5. **Deploy**: Railway auto-deploys. Note your Railway URL (e.g., `https://xyz.railway.app`)

## Step 2: Deploy Frontend to Vercel (5 minutes)

1. **Sign up/Login**: Go to [vercel.com](https://vercel.com) and sign in with GitHub
2. **Import Project**: Click "New Project" → Import this repository
3. **Configure**: 
   - Framework: "Next.js"
   - **Root Directory**: `apps/frontend` (IMPORTANT!)
4. **Deploy**: Click Deploy (will fail initially - this is expected)
5. **Add Environment Variables**:
   ```
   NEXT_PUBLIC_SERVER_URL=https://your-railway-url.railway.app
   GITHUB_CLIENT_ID=your_github_client_id_here
   GITHUB_CLIENT_SECRET=[your-secret]
   BETTER_AUTH_SECRET=[generate-random-32-chars]
   ```
6. **Redeploy**: Go to Deployments → Redeploy

## Step 3: Database Setup (2 minutes)

1. In Railway dashboard, find your backend service
2. Go to Deploy tab → Run this command: `npm run db:push`
3. This creates all database tables

## Step 4: Update GitHub OAuth (3 minutes)

1. Go to GitHub → Settings → Developer settings → GitHub Apps
2. Edit your app:
   - **Homepage URL**: `https://your-vercel-app.vercel.app`
   - **Callback URL**: `https://your-vercel-app.vercel.app/api/auth/callback/github`
   - **Webhook URL**: `https://your-railway-url.railway.app/webhooks/github`

## Step 5: Test Everything

- [ ] Visit your Vercel URL - app should load
- [ ] Visit `https://your-railway-url.railway.app/health` - should return "healthy"
- [ ] Try GitHub login in the app
- [ ] Create a test task

## 🆘 If Something Goes Wrong

### Railway Build Fails
- Check environment variables are set correctly
- Look at build logs for specific errors
- Ensure PostgreSQL database is added

### Vercel Build Fails
- Verify root directory is set to `apps/frontend`
- Check environment variables
- Look at function logs

### GitHub OAuth Doesn't Work
- Double-check callback URLs match exactly
- Verify GitHub client ID/secret are correct
- Check GitHub App permissions

### Database Connection Issues
- Ensure `DATABASE_URL` is automatically set by Railway PostgreSQL
- Run the database migration command: `npm run db:push`

## 📞 Need Help?

Environment variable templates are in:
- `.env.railway` - Copy to Railway dashboard
- `.env.vercel` - Copy to Vercel dashboard

Full detailed guide: See `DEPLOYMENT_CHECKLIST.md`

---
**Your Deployment URLs:**
- Frontend: `https://[project-name].vercel.app`
- Backend: `https://[project-name].railway.app`
- Health Check: `https://[project-name].railway.app/health`