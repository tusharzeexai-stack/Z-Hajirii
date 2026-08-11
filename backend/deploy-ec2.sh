#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# deploy-ec2.sh — Z-Hajirii Backend Deployment Script for AWS EC2
#
# USAGE: Run this script on your EC2 instance after SSH-ing in.
#        bash deploy-ec2.sh
#
# PREREQUISITES:
#   - EC2 instance running Amazon Linux 2 or Ubuntu 22.04
#   - Security Group inbound rules: Port 22 (SSH), Port 5000 (API), Port 443 (HTTPS)
#   - Your .env file created from .env.example with real values
# ═══════════════════════════════════════════════════════════════════════════════

set -e  # Exit on any error

echo "════════════════════════════════════════"
echo " Z-Hajirii Backend — EC2 Setup Script  "
echo "════════════════════════════════════════"

# ── 1. Install Node.js 20 (LTS) ──────────────────────────────────────────────
echo "▸ Installing Node.js 20..."
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -  2>/dev/null || \
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo yum install -y nodejs 2>/dev/null || sudo apt-get install -y nodejs

echo "  Node: $(node -v)"
echo "  npm:  $(npm -v)"

# ── 2. Install PM2 globally ───────────────────────────────────────────────────
echo "▸ Installing PM2..."
sudo npm install -g pm2

# ── 3. Create log directory ───────────────────────────────────────────────────
mkdir -p ~/logs

# ── 4. Clone / Pull latest code ──────────────────────────────────────────────
REPO_DIR=~/zhajirii
if [ -d "$REPO_DIR/.git" ]; then
  echo "▸ Pulling latest code..."
  cd $REPO_DIR && git pull origin main
else
  echo "▸ Cloning repository..."
  # Replace with your GitHub repository URL
  git clone https://github.com/tusharzeexai-stack/Z-Hajirii.git $REPO_DIR
  cd $REPO_DIR
fi

# ── 5. Install backend dependencies ──────────────────────────────────────────
echo "▸ Installing backend dependencies..."
cd $REPO_DIR/backend
npm install --production

# ── 6. Set up .env file ───────────────────────────────────────────────────────
if [ ! -f "$REPO_DIR/backend/.env" ]; then
  echo ""
  echo "⚠️  .env file not found!"
  echo "   Please create it from .env.example:"
  echo "   cp $REPO_DIR/backend/.env.example $REPO_DIR/backend/.env"
  echo "   nano $REPO_DIR/backend/.env"
  echo ""
  echo "   Then run this script again."
  exit 1
fi

# ── 7. Start / Restart with PM2 ──────────────────────────────────────────────
echo "▸ Starting backend with PM2..."
pm2 delete zhajirii-backend 2>/dev/null || true
pm2 start $REPO_DIR/backend/ecosystem.config.js
pm2 save

# ── 8. Auto-start PM2 on reboot ──────────────────────────────────────────────
echo "▸ Setting up PM2 auto-start on reboot..."
pm2 startup | tail -1 | bash 2>/dev/null || echo "  (Run the pm2 startup command manually if needed)"

# ── 9. Final Status ──────────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════"
echo " ✅ Deployment complete!"
echo ""
pm2 status
echo ""
echo " Test your backend:"
EC2_IP=$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || echo "YOUR_EC2_IP")
echo "   curl http://$EC2_IP:5000/health"
echo ""
echo " PM2 Commands:"
echo "   pm2 logs zhajirii-backend   — View live logs"
echo "   pm2 status                  — Check status"
echo "   pm2 restart zhajirii-backend — Restart server"
echo "════════════════════════════════════════"
