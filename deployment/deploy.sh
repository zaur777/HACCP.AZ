#!/bin/bash

# Deployment Script for SafeFood HACCP
# Usage: ./deploy.sh

# 1. Stop script on error
set -e

echo "🚀 Starting deployment..."

# 2. Pull latest changes (if using git)
# git pull origin main

# 3. Install dependencies
echo "📦 Installing dependencies..."
npm install

# 4. Build the frontend
echo "🏗️ Building frontend..."
npm run build

# 5. Restart the application using PM2
# PM2 is recommended for Node.js production environments
echo "🔄 Restarting application..."

# Check if PM2 is installed
if ! command -v pm2 &> /dev/null
then
    echo "⚠️ PM2 not found. Installing globally..."
    npm install -g pm2
fi

# Start or restart the app
# We use tsx to run the server.ts directly in production as well, 
# or you can compile it to JS if preferred.
# The server.ts handles serving the 'dist' folder in production.
pm2 start server.ts --name "safefood-haccp" --interpreter tsx || pm2 restart "safefood-haccp"

# 6. Save PM2 process list
pm2 save

echo "✅ Deployment complete! Your app is now running."
echo "🔗 Check your domain to see the changes."
