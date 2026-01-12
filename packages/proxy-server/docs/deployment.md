# Deployment Guide 🚀

Deploying the proxy server for production or local use.

## Which method should I use?

| Scenario             | Recommend Method              | Guide Link                                   |
| -------------------- | ----------------------------- | -------------------------------------------- |
| **Local / Dev**      | Docker Compose or `npm start` | [Docker README](../deploy/docker/README.md)  |
| **VPS (Production)** | BuildKit Secret Injection     | [VPS Guide](../deploy/deploy_instruction.md) |
| **Google Cloud**     | Cloud Run (Vertex Auth)       | _See generic Docker docs_                    |

---

## 1. VPS Deployment (The SOTA Way)

We have a dedicated workflow for VPS that injects credentials safely at build
time.

**Key Files:**

- `packages/proxy-server/deploy/docker/Dockerfile.vps`
- `packages/proxy-server/deploy/build-vps.sh`
- `packages/proxy-server/deploy/deploy_instruction.md`

[👉 **Go to the Full VPS Guide**](../deploy/deploy_instruction.md)

---

## 2. Local Docker

For running locally with minimal fuss.

**Command:**

```bash
cd packages/proxy-server/deploy/docker
docker compose up -d
```

**Features:**

- Mounts your local `~/.gemini` folder automatically (if configured in compose
  file).
- Great for testing before deploying.

[👉 **Go to Local Docker README**](../deploy/docker/README.md)

---

## 3. Remote Deploy Script (Legacy/Automated)

We also provide a helper script `deploy-remote.sh` that automates `scp` and
`docker run` commands over SSH.

**Usage:**

```bash
./packages/proxy-server/deploy/deploy-remote.sh user@host
```

This script will:

1. Copy your local OAuth keys to the remote server securely.
2. Start the standard Docker container.
3. Validate connection.
