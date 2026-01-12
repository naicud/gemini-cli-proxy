#!/bin/bash
set -e

# ============================================
# Gemini Proxy - VPS Image Builder
# ============================================
#
# Builds a self-contained Docker image with embedded OAuth credentials.
# Uses Docker BuildKit secrets for security (credentials not in image layers).
#
# Usage:
#   ./build-vps.sh                    # Build with ~/.gemini credentials
#   ./build-vps.sh /path/to/creds     # Build with custom credentials path
#   ./build-vps.sh --api-key          # Build without credentials (API key mode)
#
# After building:
#   docker save gemini-proxy:vps | gzip > gemini-proxy-vps.tar.gz
#   scp gemini-proxy-vps.tar.gz user@vps:/tmp/
#   ssh user@vps "docker load < /tmp/gemini-proxy-vps.tar.gz"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
DOCKERFILE="$SCRIPT_DIR/docker/Dockerfile.vps"

# Credential source
CRED_PATH="${1:-$HOME/.gemini}"
API_KEY_MODE=false

if [ "$1" = "--api-key" ]; then
  API_KEY_MODE=true
  CRED_PATH=""
fi

echo "🐳 Building Gemini Proxy VPS Image"
echo "   Repository: $REPO_ROOT"
echo "   Dockerfile: $DOCKERFILE"

cd "$REPO_ROOT"

if [ "$API_KEY_MODE" = true ]; then
  echo "   Mode: API Key (no credentials embedded)"
  echo ""
  
  DOCKER_BUILDKIT=1 docker build \
    -f "$DOCKERFILE" \
    -t gemini-proxy:vps \
    .
else
  if [ ! -d "$CRED_PATH" ]; then
    echo "❌ Credentials not found at: $CRED_PATH"
    echo "   Run 'gemini' CLI first to generate OAuth tokens, or use --api-key mode"
    exit 1
  fi
  
  echo "   Credentials: $CRED_PATH"
  echo ""
  
  DOCKER_BUILDKIT=1 docker build \
    --secret id=gemini,src="$CRED_PATH" \
    -f "$DOCKERFILE" \
    -t gemini-proxy:vps \
    .
fi

echo ""
echo "✅ Build complete: gemini-proxy:vps"
echo ""
echo "📦 To export for VPS:"
echo "   docker save gemini-proxy:vps | gzip > gemini-proxy-vps.tar.gz"
echo ""
echo "🚀 To run locally:"
echo "   docker run -d -p 3000:3000 -e PROXY_API_KEY=your-key gemini-proxy:vps"
