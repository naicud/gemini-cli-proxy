# @google/gemini-cli-proxy-server

OpenAI-compatible HTTP SSE proxy server for Gemini CLI.

## Quick Start

```bash
# Prerequisites: Authenticate with Gemini CLI first
gemini  # This opens browser for Google OAuth

# Start proxy server
npm run dev
```

## Authentication Methods

| Method           | Setup                                  | Bearer Token |
| ---------------- | -------------------------------------- | ------------ |
| **Google OAuth** | Run `gemini` CLI once                  | Not needed   |
| **API Key**      | `GEMINI_API_KEY=xxx npm run dev`       | Optional     |
| **Vertex AI**    | `GOOGLE_CLOUD_PROJECT=xxx npm run dev` | Not needed   |

## Usage

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

## Environment Variables

| Variable               | Default   | Description                      |
| ---------------------- | --------- | -------------------------------- |
| `PORT`                 | `3000`    | Server port                      |
| `HOST`                 | `0.0.0.0` | Bind address                     |
| `GEMINI_API_KEY`       | -         | API key (for USE_GEMINI auth)    |
| `GOOGLE_CLOUD_PROJECT` | -         | GCP project (for Vertex AI auth) |
| `INCLUDE_THINKING`     | `false`   | Include reasoning in response    |

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
