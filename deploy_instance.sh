#!/bin/bash
# deploy_instance.sh
# Deployment helper script to run the Express backend on EC2 instance 43.204.218.180

echo "🚀 Starting Z-Hajirii Backend Deployment on 43.204.218.180..."

# 1. Install Node.js dependencies
npm install

# 2. Check PM2 installation for process management
if ! command -v pm2 &> /dev/null; then
    echo "📦 Installing PM2 globally for background process management..."
    sudo npm install -g pm2
fi

# 3. Start or restart Express backend with PM2
echo "⚙️ Starting Express server on port 3001..."
pm2 stop zhajirii-backend 2>/dev/null || true
pm2 start server/index.js --name "zhajirii-backend" --watch

# 4. Save PM2 state to autostart on system reboot
pm2 save

echo ""
echo "✅ Express Backend deployed successfully on 43.204.218.180!"
echo "👉 Health Check: http://43.204.218.180:3001/health"
echo "👉 PM2 Status: Run 'pm2 status' or 'pm2 logs zhajirii-backend'"
