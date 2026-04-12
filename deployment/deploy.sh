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
# We use the local tsx from node_modules to avoid PATH issues
# Using absolute path for PM2 reliability
TSX_PATH="$(pwd)/node_modules/.bin/tsx"

if pm2 list | grep -q "safefood-haccp"; then
    echo "🔄 Restarting existing process..."
    NODE_ENV=production pm2 restart "safefood-haccp" --update-env
else
    echo "🆕 Starting new process..."
    NODE_ENV=production pm2 start server.ts --name "safefood-haccp" --interpreter "$TSX_PATH"
fi

# 6. Save PM2 process list
pm2 save

echo "⏳ Waiting for application to start..."
sleep 5

echo "📋 Checking application status..."
pm2 status "safefood-haccp"

echo "📝 Recent logs:"
pm2 logs "safefood-haccp" --lines 20 --no-daemon

echo "✅ Deployment complete! Your app is now running."
echo "🔗 Check your domain to see the changes."
