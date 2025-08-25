#!/bin/bash

# GitHub OAuth App Creation Helper Script

echo "🔧 GitHub OAuth App Creation Helper"
echo "==================================="
echo

USERNAME=$(gh api user | jq -r .login)
echo "Logged in as: $USERNAME"
echo

echo "📋 Instructions to create GitHub OAuth App:"
echo "1. Open this URL in your browser:"
echo "   https://github.com/settings/developers"
echo
echo "2. Click 'New OAuth App'"
echo
echo "3. Fill in the form:"
echo "   Application name: Shadow Development"
echo "   Homepage URL: http://localhost:3000"
echo "   Authorization callback URL: http://localhost:3000/api/auth/callback"
echo
echo "4. Click 'Register application'"
echo
echo "5. Copy the Client ID and Client Secret"
echo
echo "6. Update these values in your environment files:"
echo "   apps/server/.env"
echo "   apps/frontend/.env"
echo
echo "   Replace:"
echo "   GITHUB_CLIENT_ID=your_github_client_id_here"
echo "   GITHUB_CLIENT_SECRET=your_github_client_secret_here"
echo
echo "   With your actual values"
echo
echo "💡 Tip: You can use this command to update the files:"
echo "   sed -i '' 's/your_github_client_id_here/YOUR_ACTUAL_CLIENT_ID/g' apps/server/.env apps/frontend/.env"
echo "   sed -i '' 's/your_github_client_secret_here/YOUR_ACTUAL_CLIENT_SECRET/g' apps/server/.env apps/frontend/.env"
echo