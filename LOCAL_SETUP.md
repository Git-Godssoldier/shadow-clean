# Local Setup Instructions

## Prerequisites
- Node.js (v18 or higher)
- PostgreSQL database
- GitHub Personal Access Token (for GitHub integration)

## Setup Steps

1. **Create Database**
   ```bash
   createdb shadow_dev
   ```

2. **Environment Setup**
   Copy the template files and update with your configuration:
   ```bash
   cp apps/server/.env.template apps/server/.env
   cp apps/frontend/.env.template apps/frontend/.env.local
   cp packages/db/.env.template packages/db/.env
   ```

3. **Update Database URLs**
   In all `.env` files, update the database URLs to use your PostgreSQL user:
   ```
   DATABASE_URL="postgres://your_username:@127.0.0.1:5432/shadow_dev"
   DIRECT_URL="postgres://your_username:@127.0.0.1:5432/shadow_dev"
   ```

4. **Install Dependencies**
   ```bash
   npm install
   ```

5. **Generate Prisma Client**
   ```bash
   cd packages/db && npx prisma generate
   ```

6. **Push Database Schema**
   ```bash
   cd packages/db && npx prisma db push
   ```

7. **Start Services**
   In separate terminals:
   ```bash
   # Terminal 1 - Start the server
   cd apps/server && npm run dev
   
   # Terminal 2 - Start the frontend
   cd apps/frontend && npm run dev
   ```

## Accessing the Application
- Frontend: http://localhost:3000
- Backend API: http://localhost:4000

## GitHub Integration
For GitHub integration to work, you'll need to:
1. Create a GitHub Personal Access Token with `repo` and `read:org` scopes
2. Add it to your `apps/server/.env` file:
   ```
   GITHUB_PERSONAL_ACCESS_TOKEN=your_token_here
   ```
3. Add it to your `apps/frontend/.env.local` file:
   ```
   GITHUB_PERSONAL_ACCESS_TOKEN=your_token_here
   ```

Note: In local development mode, the application uses your personal access token for GitHub operations instead of requiring a GitHub App installation.