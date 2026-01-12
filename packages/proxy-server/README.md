# @google/gemini-cli-proxy-server

OpenAI-compatible HTTP SSE proxy server for Gemini CLI.

## Quick Start

```bash
# Prerequisites: Authenticate with Gemini CLI first
gemini  # This opens browser for Google OAuth

# Start proxy server
gemini-proxy
```

## CLI Usage

### Command Line Options

| Flag                 | Short | Default   | Description                    |
| -------------------- | ----- | --------- | ------------------------------ |
| `--port`             | `-p`  | `3000`    | Server port                    |
| `--host`             | `-H`  | `0.0.0.0` | Bind address                   |
| `--cors-origins`     |       | `*`       | CORS origins (comma-separated) |
| `--working-dir`      | `-w`  | `cwd`     | Working directory              |
| `--include-thinking` |       | `false`   | Include reasoning in response  |
| `--help`             | `-h`  |           | Show help                      |
| `--version`          | `-v`  |           | Show version                   |

### Examples

```bash
# Start with defaults
gemini-proxy

# Custom port and host
gemini-proxy --port 8080 --host 127.0.0.1

# Docker deployment
gemini-proxy -p 3000 -H 0.0.0.0 --include-thinking

# Using environment variables (CLI flags take precedence)
PORT=8080 HOST=127.0.0.1 gemini-proxy
```

### Development Mode

```bash
# Run with tsx for development
npm run dev

# Or with environment variables
PORT=3000 HOST=127.0.0.1 INCLUDE_THINKING=true npm run dev
```

## Authentication Methods

| Method           | Setup                                   | Bearer Token |
| ---------------- | --------------------------------------- | ------------ |
| **Google OAuth** | Run `gemini` CLI once                   | Not needed   |
| **API Key**      | `GEMINI_API_KEY=xxx gemini-proxy`       | Optional     |
| **Vertex AI**    | `GOOGLE_CLOUD_PROJECT=xxx gemini-proxy` | Not needed   |

## API Usage

### cURL (Streaming)

```bash
curl http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"gemini-2.5-flash","messages":[{"role":"user","content":"Hi"}],"stream":true}' \
  --no-buffer
```

### OpenAI SDK

```typescript
import OpenAI from 'openai';

const client = new OpenAI({
  baseURL: 'http://localhost:3000/v1',
  apiKey: 'not-needed', // Required by SDK but not used for Google OAuth
});

const stream = await client.chat.completions.create({
  model: 'gemini-2.5-flash',
  messages: [{ role: 'user', content: 'Hello!' }],
  stream: true,
});

for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content || '');
}
```

## API Endpoints

| Endpoint               | Method | Description                                  |
| ---------------------- | ------ | -------------------------------------------- |
| `/v1/chat/completions` | POST   | Chat completions (streaming + non-streaming) |
| `/v1/models`           | GET    | List available models                        |
| `/docs`                | GET    | Swagger UI documentation                     |

## Environment Variables

| Variable               | Default   | Description                      |
| ---------------------- | --------- | -------------------------------- |
| `PORT`                 | `3000`    | Server port                      |
| `HOST`                 | `0.0.0.0` | Bind address                     |
| `CORS_ORIGINS`         | `*`       | CORS origins (comma-separated)   |
| `WORKING_DIR`          | `cwd`     | Working directory                |
| `INCLUDE_THINKING`     | `false`   | Include reasoning in response    |
| `GEMINI_API_KEY`       | -         | API key (for API key auth)       |
| `GOOGLE_CLOUD_PROJECT` | -         | GCP project (for Vertex AI auth) |

## Docker Deployment

```dockerfile
FROM node:20-slim

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .

EXPOSE 3000
CMD ["gemini-proxy", "-p", "3000", "-H", "0.0.0.0"]
```

```bash
docker build -t gemini-proxy .
docker run -p 3000:3000 gemini-proxy
```

## Available Models

- `gemini-2.5-pro`
- `gemini-2.5-flash`
- `gemini-2.5-flash-lite`
- `gemini-3-pro-preview`
- `gemini-3-flash-preview`
- `auto`

## Tool Calls

Tools are auto-approved using `ApprovalMode.YOLO`. No user confirmation
required.

## License

Apache-2.0
