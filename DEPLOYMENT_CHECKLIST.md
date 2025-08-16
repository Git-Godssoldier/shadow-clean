# Shadow Deployment Checklist

## ✅ Automated Deployment (RECOMMENDED)

### Quick Deploy with Script
```bash
./auto-deploy.sh
```

**What the script does:**
- [x] Verifies database migrations non-interactively
- [x] Deploys backend to Railway with PostgreSQL
- [x] Deploys frontend to Vercel
- [x] Sets all environment variables automatically
- [x] Runs database migrations on production

### Prerequisites
- [x] Railway CLI installed and authenticated (`railway login`)
- [x] Vercel CLI installed and authenticated (`vercel login`)
- [x] Local PostgreSQL database for migration verification

## 🛠️ Manual Deployment Instructions (Alternative)

### Phase 1: Deploy Backend to Railway

#### 1.1 Railway Account Setup
1. Go to [railway.app](https://railway.app)
2. Sign in with GitHub (use same account as this repository)
3. Authorize Railway to access your GitHub repositories

#### 1.2 Create New Railway Project
1. Click "New Project" in Railway dashboard
2. Select "Deploy from GitHub repo"
3. Choose this repository: `jeremyalston/shadow`
4. Railway will detect the `railway.json` configuration automatically

#### 1.3 Configure Railway Environment Variables
Copy these variables from `.env.railway` to Railway dashboard:

**Required Environment Variables:**
```
NODE_ENV=production
PORT=8080
AGENT_MODE=local

# Database (Railway will auto-generate)
DATABASE_URL=postgresql://postgres:password@localhost:5432/shadow_prod

# GitHub OAuth (from your GitHub App)
GITHUB_CLIENT_ID=your_github_client_id_here
GITHUB_CLIENT_SECRET=[your-github-client-secret]
GITHUB_APP_ID=[your-github-app-id]
GITHUB_PRIVATE_KEY=[your-github-private-key]

# JWT Secret (generate secure random string)
JWT_SECRET=[generate-32-character-random-string]

# AI API Keys (add your actual keys)
ANTHROPIC_API_KEY=[your-anthropic-key]
OPENAI_API_KEY=[your-openai-key]
OPENROUTER_API_KEY=[your-openrouter-key]

# Optional Services
PINECONE_API_KEY=[your-pinecone-key]
BRAINTRUST_API_KEY=[your-braintrust-key]
```

#### 1.4 Add PostgreSQL Database
1. In Railway project, click "New" → "Database" → "PostgreSQL"
2. Railway will automatically generate `DATABASE_URL`
3. This will be automatically injected into your backend service

#### 1.5 Deploy Backend
1. Railway will automatically start building from `Dockerfile.railway`
2. Monitor build logs for any issues
3. Once deployed, note the Railway service URL (e.g., `https://your-app.railway.app`)

### Phase 2: Deploy Frontend to Vercel

#### 2.1 Vercel Account Setup
1. Go to [vercel.com](https://vercel.com)
2. Sign in with GitHub (same account as repository)
3. Authorize Vercel to access your repositories

#### 2.2 Import Project to Vercel
1. Click "New Project" in Vercel dashboard
2. Import from GitHub: select this repository
3. **Important**: Set Framework Preset to "Next.js"
4. **Important**: Set Root Directory to `apps/frontend`
5. Click "Deploy" (initial deployment will fail, this is expected)

#### 2.3 Configure Vercel Environment Variables
Add these variables in Vercel project settings → Environment Variables:

```
# Backend Connection (use your Railway URL)
NEXT_PUBLIC_SERVER_URL=https://your-app.railway.app

# GitHub OAuth (same as Railway)
GITHUB_CLIENT_ID=your_github_client_id_here
GITHUB_CLIENT_SECRET=[your-github-client-secret]

# Auth Secret
BETTER_AUTH_SECRET=[generate-32-character-random-string]
BETTER_AUTH_URL=https://your-vercel-app.vercel.app

# Optional: AI API Keys for client-side features
NEXT_PUBLIC_ANTHROPIC_API_KEY=[your-anthropic-key]
```

#### 2.4 Redeploy Frontend
1. After adding environment variables, trigger a new deployment
2. Go to Vercel dashboard → Deployments → "Redeploy"
3. Monitor build logs to ensure successful deployment

### Phase 3: Database Migration & GitHub OAuth

#### 3.1 Run Database Migrations
1. In Railway dashboard, find your backend service
2. Go to "Deploy" tab → "Manual Deploy" → "Run Command"
3. Execute: `npm run db:push`
4. This will create all necessary database tables

#### 3.2 Update GitHub OAuth Callback URLs
Update your GitHub App settings:

1. Go to GitHub → Settings → Developer settings → GitHub Apps
2. Edit your app and update these URLs:
   - **Homepage URL**: `https://your-vercel-app.vercel.app`
   - **Callback URL**: `https://your-vercel-app.vercel.app/api/auth/callback/github`
   - **Webhook URL**: `https://your-app.railway.app/webhooks/github`

### Phase 4: Verify Deployment

#### 4.1 Test Frontend
- [ ] Visit your Vercel URL
- [ ] Verify the app loads without errors
- [ ] Check browser console for any errors

#### 4.2 Test Backend Health
- [ ] Visit `https://your-app.railway.app/health`
- [ ] Should return `{"status":"healthy"}`

#### 4.3 Test GitHub Integration
- [ ] Try to connect GitHub account in the app
- [ ] Verify OAuth flow works correctly
- [ ] Test repository access

#### 4.4 Test Full Workflow
- [ ] Create a new task
- [ ] Verify chat interface works
- [ ] Test tool execution (if possible)

## 🛠️ Troubleshooting

### Common Issues & Solutions

#### Build Failures
- **Railway**: Check `Dockerfile.railway` syntax, verify `package.json` scripts
- **Vercel**: Ensure root directory is set to `apps/frontend`, check for TypeScript errors

#### Environment Variable Issues
- Verify all required variables are set in both platforms
- Check for typos in variable names
- Ensure secrets are properly base64 encoded where needed

#### Database Connection Issues
- Verify `DATABASE_URL` is properly set by Railway
- Check Railway PostgreSQL service is running
- Run migrations if tables don't exist

#### GitHub OAuth Issues
- Verify callback URLs exactly match deployment URLs
- Check GitHub App permissions are sufficient
- Ensure client ID and secret are correct

## 📊 Expected Costs

- **Railway**: ~$5-15/month (includes PostgreSQL)
- **Vercel**: Free tier (hobby usage)
- **Total**: ~$5-15/month

## 🔧 Post-Deployment Maintenance

### Regular Tasks
- Monitor Railway logs for errors
- Update environment variables as needed
- Scale Railway resources if needed
- Monitor Vercel build times and function usage

### Updating the Application
1. Push changes to GitHub main branch
2. Vercel will auto-deploy frontend changes
3. Railway will auto-deploy backend changes
4. Run database migrations if schema changes

## 🆘 Support Resources

- **Railway Docs**: https://docs.railway.app
- **Vercel Docs**: https://vercel.com/docs
- **Next.js Deployment**: https://nextjs.org/docs/deployment
- **GitHub Apps**: https://docs.github.com/en/apps

---

**Next Steps**: Follow this checklist in order. Each phase depends on the previous one being completed successfully.