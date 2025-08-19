#!/bin/bash

# GitHub OAuth App Setup Script for Shadow Application

echo "🚀 Setting up GitHub OAuth App for Shadow Application"
echo "=================================================="
echo

# Check if we're logged into GitHub CLI
if ! gh auth status &> /dev/null; then
    echo "❌ Please log into GitHub CLI first:"
    echo "   gh auth login"
    echo
    exit 1
fi

# Get user info
USERNAME=$(gh api user | jq -r .login)
echo "✅ Logged in as: $USERNAME"
echo

echo "🔧 To create a GitHub OAuth App for Shadow, please follow these steps:"
echo
echo "1. Visit: https://github.com/settings/developers"
echo "2. Click 'New OAuth App'"
echo "3. Fill in the form with these values:"
echo "   - Application name: Shadow Development"
echo "   - Homepage URL: http://localhost:3000"
echo "   - Authorization callback URL: http://localhost:3000/api/auth/callback"
echo "4. Click 'Register application'"
echo "5. Copy the Client ID and generate a new Client Secret"
echo
echo "🔐 For the Personal Access Token (already configured):"
echo "   - Using existing GitHub CLI token for repository access"
echo "   - Token has scopes: gist, read:org, repo, workflow"
echo
echo "📁 Repository for documentation:"
echo "   - Created: https://github.com/$USERNAME/shadow-oauth-app"
echo "   - Contains setup instructions"
echo
echo "🔑 AI Configuration:"
echo "   - Using OpenAI API key from environment"
echo "   - For OpenRouter, please set OPENROUTER_API_KEY in your environment"
echo
echo "✅ Next steps:"
echo "1. Create the OAuth App as described above"
echo "2. Update the .env files with your Client ID and Client Secret:"
echo "   - apps/server/.env"
echo "   - apps/frontend/.env"
echo "3. Start the development servers:"
echo "   cd apps/server && npm run dev"
echo "   cd apps/frontend && npm run dev"
echo "4. Access the application at http://localhost:3000"
echo