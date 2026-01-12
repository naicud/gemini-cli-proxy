# Authentication Guide 🔐

Secure your proxy and authenticate with Google.

## Dual Authentication Layer

There are two layers of authentication to understand:

1.  **Consumer Auth**: Protection for **your proxy** (Client -> Proxy).
2.  **Provider Auth**: Authentication with **Google** (Proxy -> Gemini).

---

## 1. Consumer Auth (Protecting the Proxy)

If you expose this proxy to the internet (e.g., on a VPS), you **must** protect
it.

### **The PROXY_API_KEY**

Set this environment variable to a strong secret string.

```bash
export PROXY_API_KEY="sk-my-secret-proxy-key-123"
```

**Client usage:** Any client connecting to your proxy must send this key in the
header: `Authorization: Bearer sk-my-secret-proxy-key-123`

> If `PROXY_API_KEY` is unset, the proxy is **OPEN**. Anyone can use it. Only
> safe for localhost.

---

## 2. Provider Auth (Connecting to Google)

The proxy needs permission to call Google's API. Choose **ONE** method.

### Method A: API Key (Simplest) ⭐️

_Best for: VPS, Docker, Production_

1.  Get a key from [Google AI Studio](https://aistudio.google.com/).
2.  Set `GEMINI_API_KEY` in environment.

```bash
export GEMINI_API_KEY="AIzaSy..."
```

### Method B: OAuth (Local Development) 💻

_Best for: Localhost, Desktop usage_

If you use the `gemini` CLI tool locally, you are already logged in! The proxy
can re-use these tokens.

1.  Run `gemini` and login in browser.
2.  Tokens are saved in `~/.gemini/`.
3.  Start the proxy locally - it auto-detects them.

**Docker Trick**: To use this in Docker, mount the credentials:

```yaml
volumes:
  - ~/.gemini:/home/gemini/.gemini
```

### Method C: OAuth (Embedded in VPS) 🚀

_Best for: Secure VPS deployment without API Keys_

See the [Deployment Guide](./deployment.md) for how we inject these credentials
at build time using `build-vps.sh`.

### Method D: Vertex AI (GCP) ☁️

_Best for: Google Cloud Run, GKE_

1.  Set `GOOGLE_CLOUD_PROJECT`.
2.  The proxy uses the environment's Service Account automatically.

```bash
export GOOGLE_CLOUD_PROJECT="my-project-id"
```
