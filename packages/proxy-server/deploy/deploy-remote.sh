#!/bin/bash
set -e

# Description: Automates the deployment of Gemini Proxy to a remote server.
# It handles secure credential transfer (SCP) and container startup.
#
# Prerequisites on Remote Server:
# 1. SSH access (preferably key-based)
# 2. Docker installed and running
# 3. The 'gemini-proxy' image must be available (built locally or pulled)
#
# Usage: ./deploy-remote.sh user@host [port]
# Example: ./deploy-remote.sh ubuntu@203.0.113.1 8080

REMOTE_HOST="$1"
REMOTE_PORT="${2:-3000}"

if [ -z "$REMOTE_HOST" ]; then
  echo "Usage: $0 user@host [port]"
  echo "Example: $0 ubuntu@1.2.3.4"
  exit 1
fi

echo "🚀 Deploying to $REMOTE_HOST..."

# 1. Check for local credentials
LOCAL_AUTH_DIR="$HOME/.gemini"
REMOTE_AUTH_DIR="/home/$(echo $REMOTE_HOST | cut -d@ -f1)/.gemini"

if [ -d "$LOCAL_AUTH_DIR" ]; then
  echo "🔒 Found local credentials at $LOCAL_AUTH_DIR"
  echo "📦 Copying credentials to $REMOTE_HOST:$REMOTE_AUTH_DIR..."
  
  # Ensure parent dir exists (ignoring errors if it exists)
  ssh "$REMOTE_HOST" "mkdir -p $REMOTE_AUTH_DIR"
  
  # Secure copy
  scp -r "$LOCAL_AUTH_DIR/"* "$REMOTE_HOST:$REMOTE_AUTH_DIR/"
else
  echo "⚠️  No local credentials found at $LOCAL_AUTH_DIR. Skipping auth copy."
  echo "   (Ensure you have run 'gemini' CLI locally first if you need OAuth)"
fi

# 2. Deploy/Restart Container
echo "🐳 Starting Gemini Proxy on remote server..."
ssh "$REMOTE_HOST" "
  docker pull gemini-proxy:latest 2>/dev/null || echo '⚠️  Image gemini-proxy:latest found/not pulled (ensure it exists or use a registry)'
  
  # Stop existing
  docker stop gemini-proxy 2>/dev/null || true
  docker rm gemini-proxy 2>/dev/null || true
  
  # Run new
  docker run -d \
    -p $REMOTE_PORT:3000 \
    -e PROXY_API_KEY="${PROXY_API_KEY}" \
    -v $REMOTE_AUTH_DIR:/home/gemini/.gemini \
    --restart unless-stopped \
    --name gemini-proxy \
    gemini-proxy
"

echo "✅ Deployment complete! Server running at http://${REMOTE_HOST#*@}:$REMOTE_PORT"
