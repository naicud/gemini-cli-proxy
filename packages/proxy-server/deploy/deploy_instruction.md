# VPS Deployment Guide

Complete guide for deploying Gemini CLI Proxy on a VPS.

## Quick Start

```bash
# 1. Build the VPS image (from repo root)
./packages/proxy-server/deploy/build-vps.sh

# 2. Export and transfer to VPS
docker save gemini-proxy:vps | gzip > gemini-proxy-vps.tar.gz
scp gemini-proxy-vps.tar.gz user@your-vps:/tmp/

# 3. Load and run on VPS
ssh user@your-vps
docker load < /tmp/gemini-proxy-vps.tar.gz
docker run -d -p 3000:3000 \
  -e PROXY_API_KEY="your-secret-key" \
  --restart unless-stopped \
  --name gemini-proxy \
  gemini-proxy:vps
```

---

## Deployment Strategy: VPS vs Local

| Feature         | **VPS Deployment** (This Guide)     | **Local / Docker Compose**              |
| :-------------- | :---------------------------------- | :-------------------------------------- |
| **Goal**        | Run on remote server                | Development / Local usage               |
| **Credentials** | **Embedded at build time** (Secure) | **Mounted volume** (`-v ~/.gemini:...`) |
| **File**        | `Dockerfile.vps`                    | `Dockerfile` / `docker-compose.yml`     |
| **Pros**        | No runtime socket mounting setup    | Instant updates to tokens               |
| **Cons**        | Rebuild needed if tokens expire     | Requires local file access              |

> [!IMPORTANT] This guide focuses on **VPS Deployment**. For local development,
> see `docker-compose.yml` in the parent directory.

---

## Authentication Options

| Method               | Build Command              | Runtime Env                     |
| -------------------- | -------------------------- | ------------------------------- |
| **OAuth** (embedded) | `./build-vps.sh`           | None required                   |
| **API Key**          | `./build-vps.sh --api-key` | `GEMINI_API_KEY=xxx`            |
| **Both**             | `./build-vps.sh`           | `GEMINI_API_KEY=xxx` (override) |

### Option 1: OAuth Credentials (Recommended)

Build with your local OAuth tokens embedded:

```bash
# Ensure you're logged in locally
gemini  # Follow browser login

# Build with credentials
./packages/proxy-server/deploy/build-vps.sh
```

### Option 2: API Key Only

```bash
# Build without OAuth
./packages/proxy-server/deploy/build-vps.sh --api-key

# Run with API key
docker run -d -p 3000:3000 \
  -e GEMINI_API_KEY="AIzaSy..." \
  gemini-proxy:vps
```

---

## Consumer API Key (Protect Your Proxy)

Add `PROXY_API_KEY` to require Bearer token authentication:

```bash
docker run -d -p 3000:3000 \
  -e PROXY_API_KEY="super-secret-consumer-key" \
  gemini-proxy:vps
```

Clients must include:

```bash
curl http://your-vps:3000/v1/chat/completions \
  -H "Authorization: Bearer super-secret-consumer-key" \
  -H "Content-Type: application/json" \
  -d '{"model":"gemini-2.5-flash","messages":[...]}'
```

---

## VPS Deployment Steps

### 1. Build Locally

```bash
cd /path/to/gemini-cli-proxy
./packages/proxy-server/deploy/build-vps.sh
```

### 2. Export Image

```bash
docker save gemini-proxy:vps | gzip > gemini-proxy-vps.tar.gz
# ~200-300MB compressed
```

### 3. Transfer to VPS

```bash
scp gemini-proxy-vps.tar.gz user@vps-ip:/tmp/
```

### 4. Load on VPS

```bash
ssh user@vps-ip
docker load < /tmp/gemini-proxy-vps.tar.gz
```

### 5. Run Container

```bash
docker run -d \
  -p 3000:3000 \
  -e PROXY_API_KEY="your-consumer-key" \
  --restart unless-stopped \
  --name gemini-proxy \
  gemini-proxy:vps
```

### 6. Verify

```bash
curl http://localhost:3000/v1/models
```

---

## Production Checklist

- [ ] Set `PROXY_API_KEY` to protect from unauthorized access
- [ ] Use HTTPS with reverse proxy (nginx/caddy)
- [ ] Set up firewall (ufw allow 3000 or reverse proxy port only)
- [ ] Use `--restart unless-stopped` for auto-restart
- [ ] Monitor logs: `docker logs -f gemini-proxy`

---

## Reverse Proxy (nginx)

```nginx
server {
    listen 443 ssl;
    server_name api.yourdomain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;

        # SSE support
        proxy_buffering off;
        proxy_read_timeout 86400s;
    }
}
```

---

## Troubleshooting

| Issue              | Solution                                              |
| ------------------ | ----------------------------------------------------- |
| 401 Unauthorized   | Check `PROXY_API_KEY` and Bearer header               |
| Auth Failed        | Rebuild image with fresh OAuth (`gemini` login first) |
| Connection refused | Check firewall and Docker port mapping                |
| Container exits    | Check logs: `docker logs gemini-proxy`                |

---

## Security Notes

1. **BuildKit Secrets**: Credentials are injected via `--secret` mount, NOT
   baked into image layers
2. **PROXY_API_KEY**: Always set this for public-facing deployments
3. **Non-root user**: Container runs as `gemini` user, not root
4. **Read-only tokens**: OAuth tokens have 600 permissions inside container
