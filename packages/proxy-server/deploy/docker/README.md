# Docker Deployment

Deploy Gemini CLI Proxy Server as a Docker container for VPS hosting.

## Quick Start

```bash
# Build and run with API Key
cd packages/proxy-server/deploy/docker
cp .env.example .env
# Edit .env and add your GEMINI_API_KEY

docker compose up -d
```

## Authentication Methods

| Method        | Setup                                  | Notes                        |
| ------------- | -------------------------------------- | ---------------------------- |
| **API Key**   | `GEMINI_API_KEY=xxx` in `.env`         | Recommended for Docker       |
| **Vertex AI** | `GOOGLE_CLOUD_PROJECT=xxx` in `.env`   | Requires GCP auth            |
| **OAuth**     | `docker compose --profile oauth up -d` | Mounts `~/.gemini` from host |

## Build & Run

### Using Docker Compose (recommended)

```bash
# From repo root
cd packages/proxy-server/deploy/docker

# API Key auth
GEMINI_API_KEY=your-key docker compose up -d

# Or with OAuth tokens from host
docker compose --profile oauth up -d

# Check logs
docker compose logs -f

# Stop
docker compose down
```

### Manual Docker Build

```bash
# From repo root
docker build -f packages/proxy-server/deploy/docker/Dockerfile -t gemini-proxy .

# Run with API key
docker run -d -p 3000:3000 \
  -e GEMINI_API_KEY=your-key \
  --name gemini-proxy \
  gemini-proxy

# Run with OAuth (mount tokens from host)
docker run -d -p 3000:3000 \
  -v ~/.gemini:/home/gemini/.gemini:ro \
  --name gemini-proxy \
  gemini-proxy
```

## Configuration

Environment variables:

| Variable               | Default | Description                    |
| ---------------------- | ------- | ------------------------------ |
| `PORT`                 | `3000`  | Server port                    |
| `GEMINI_API_KEY`       | -       | Gemini API key                 |
| `GOOGLE_CLOUD_PROJECT` | -       | GCP project for Vertex AI      |
| `CORS_ORIGINS`         | `*`     | CORS origins (comma-separated) |
| `INCLUDE_THINKING`     | `true`  | Include reasoning in responses |

## Verify Deployment

```bash
# Health check
curl http://localhost:3000/v1/models

# Test chat
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"gemini-2.5-flash","messages":[{"role":"user","content":"Hi"}]}'
```

## VPS Deployment Tips

1. **Reverse Proxy**: Use nginx/traefik for SSL termination
2. **Restart Policy**: Already set to `unless-stopped`
3. **Logs**: `docker compose logs -f gemini-proxy`
4. **Updates**: `docker compose pull && docker compose up -d`
