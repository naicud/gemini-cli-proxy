# API Reference

The proxy implements a subset of the OpenAI API standard.

## Base URL

```
http://localhost:3000/v1
```

## Endpoints

### 1. Chat Completions

**POST** `/chat/completions`

Main endpoint for text and image generation.

**Parameters:**

| Param         | Type    | Description                                                     |
| ------------- | ------- | --------------------------------------------------------------- |
| `model`       | string  | **Required**. E.g., `gemini-1.5-flash`, `gemini-2.0-flash-exp`. |
| `messages`    | array   | **Required**. List of message objects.                          |
| `stream`      | boolean | If `true`, streams response as SSE.                             |
| `temperature` | float   | 0.0 to 2.0. Creativity.                                         |
| `max_tokens`  | int     | Max output limit.                                               |
| `tools`       | array   | OpenAI-compatible tool definitions.                             |

**Example Request:**

```json
{
  "model": "gemini-1.5-flash",
  "messages": [
    { "role": "system", "content": "You are a helper." },
    { "role": "user", "content": "Hello!" }
  ],
  "stream": true
}
```

**Reasoning (Thinking) Models:** If using Gemini 2.0 models, "thinking" content
is automatically included or hidden based on the server's `INCLUDE_THINKING` env
var.

### 2. List Models

**GET** `/models`

Returns list of available models detected from the Gemini core.

**Response:**

```json
{
  "object": "list",
  "data": [
    {"id": "gemini-1.5-flash", "object": "model", ...},
    {"id": "gemini-1.5-pro", "object": "model", ...}
  ]
}
```

## cURL Cheatsheet

**Simple Chat:**

```bash
curl http://localhost:3000/v1/chat/completions \
  -H "Authorization: Bearer $PROXY_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-1.5-flash",
    "messages": [{"role": "user", "content": "Tell me a joke"}]
  }'
```

**Vision (Image):**

```bash
curl http://localhost:3000/v1/chat/completions \
  -H "Authorization: Bearer $PROXY_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-1.5-pro",
    "messages": [
      {
        "role": "user",
        "content": [
          {"type": "text", "text": "What is this?"},
          {"type": "image_url", "image_url": {"url": "https://example.com/image.jpg"}}
        ]
      }
    ]
  }'
```
