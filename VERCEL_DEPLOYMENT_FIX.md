# Vercel Deployment Fix

## Issue
During the initial deployment to Vercel, we encountered an error where Vercel couldn't find the `.next/routes-manifest.json` file. This was because Vercel was looking for the Next.js build artifacts in the root directory, but the Next.js app is actually located in the `apps/frontend` directory.

## Solution
We updated the `vercel.json` file in the root of the project to include the `outputDirectory` property that points to the correct location of the build artifacts:

```json
{
  "version": 2,
  "framework": "nextjs",
  "installCommand": "npm ci",
  "buildCommand": "npx turbo run build --filter=frontend",
  "outputDirectory": "apps/frontend/.next"
}
```

This configuration tells Vercel where to find the built Next.js application files, resolving the deployment issue.

## Additional Notes
The `apps/frontend/vercel.json` file already had the correct `outputDirectory` set to `".next"`, but since we're deploying from the root of the monorepo, we needed to specify the full path in the root `vercel.json` file.