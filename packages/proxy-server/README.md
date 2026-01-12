# Gemini CLI Proxy Server

> **OpenAI-compatible API wrapper for Google's Gemini models.**

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Status](https://img.shields.io/badge/Status-Beta-orange.svg)]()

This proxy allows you to use Google's Gemini models with any tool, library, or
script designed for OpenAI's API. It handles authentication, stream adaptation,
and multimodal input conversion automatically.

---

## 📚 Documentation

We have comprehensive documentation available in the [`docs/`](./docs/)
directory:

### 🚀 [**Introduction**](./docs/intro.md)

_What is this project and why should I use it?_

### 🔐 [**Authentication**](./docs/authentication.md)

_How do I secure my proxy and connect to Google?_

- **Consumer Auth**: Protect your proxy with `PROXY_API_KEY`.
- **Provider Auth**: Use API Keys, OAuth (Local), or Vertex AI.

### 🔌 [**API Reference**](./docs/api.md)

_Endpoints, parameters, and cURL examples._

### 🐳 [**Deployment**](./docs/deployment.md)

_How to host this server anywhere._

- **[VPS Guide](./deploy/deploy_instruction.md)**: Secure deployment with
  BuildKit secrets.
- **[Local Docker](./deploy/docker/README.md)**: Quick start for development.

### 🏗️ [**Architecture**](./docs/architecture.md)

_Deep dive into how the proxy works internally._

### 🔧 [**Troubleshooting**](./docs/troubleshooting.md)

_Common errors and solutions._

---

## Quick Start (Local)

1.  **Install & Build**:

    ```bash
    npm install
    npm run build
    ```

2.  **Run**:

    ```bash
    # With Google AI Studio Key
    export GEMINI_API_KEY="AIzaSy..."
    npm run start
    ```

3.  **Test**:
    ```bash
    curl http://localhost:3000/v1/models
    ```
