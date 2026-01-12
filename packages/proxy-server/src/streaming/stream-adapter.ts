/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type OpenAI from 'openai';
import type { ServerGeminiStreamEvent } from '@google/gemini-cli-core';
import { v4 as uuid } from 'uuid';
import type { SSEMessage } from '@fastify/sse';

type ChatCompletionChunk = OpenAI.ChatCompletionChunk;
type ChatCompletionChunkChoice = ChatCompletionChunk['choices'][0];

/**
 * Adapts Gemini stream events to OpenAI SSE format.
 */
export async function* geminiToOpenAIStream(
  geminiStream: AsyncGenerator<ServerGeminiStreamEvent>,
  model: string,
  includeThinking: boolean = false,
): AsyncGenerator<SSEMessage> {
  const id = `chatcmpl-${uuid()}`;
  const created = Math.floor(Date.now() / 1000);
  let isFirstChunk = true;

  for await (const event of geminiStream) {
    const chunk = processEvent(
      event,
      id,
      created,
      model,
      isFirstChunk,
      includeThinking,
    );
    if (chunk) {
      yield { data: chunk };
      isFirstChunk = false;
    }
  }

  // Final chunk with finish_reason
  const finalChunk: ChatCompletionChunk = {
    id,
    object: 'chat.completion.chunk',
    created,
    model,
    choices: [
      {
        index: 0,
        delta: {},
        finish_reason: 'stop',
        logprobs: null,
      },
    ],
  };
  yield { data: finalChunk };
  yield { data: '[DONE]' };
}

interface GeminiPart {
  text?: string;
  thought?: string;
  functionCall?: {
    name?: string;
    args?: Record<string, unknown>;
  };
}

interface GeminiContent {
  candidates?: Array<{
    content?: {
      parts?: GeminiPart[];
    };
  }>;
}

function processEvent(
  event: ServerGeminiStreamEvent,
  id: string,
  created: number,
  model: string,
  isFirstChunk: boolean,
  includeThinking: boolean,
): ChatCompletionChunk | null {
  // Handle content events from Gemini
  if (event.type !== 'content' || !event.value) {
    return null;
  }

  const geminiContent = event.value as GeminiContent;
  const parts = geminiContent.candidates?.[0]?.content?.parts ?? [];
  const delta: ChatCompletionChunkChoice['delta'] & {
    reasoning_content?: string;
  } = {};

  if (isFirstChunk) {
    delta.role = 'assistant';
  }

  // Extract text content
  for (const part of parts) {
    if (part.text) {
      delta.content = part.text;
    }

    // Extract thinking/reasoning content (custom extension)
    if (includeThinking && part.thought) {
      delta.reasoning_content = part.thought;
    }

    // Handle function calls
    if (part.functionCall) {
      delta.tool_calls = [
        {
          index: 0,
          id: `call_${uuid()}`,
          type: 'function',
          function: {
            name: part.functionCall.name ?? '',
            arguments: JSON.stringify(part.functionCall.args ?? {}),
          },
        },
      ];
    }
  }

  // Only emit if we have content
  if (Object.keys(delta).length === 0) {
    return null;
  }

  return {
    id,
    object: 'chat.completion.chunk',
    created,
    model,
    choices: [
      {
        index: 0,
        delta,
        finish_reason: null,
        logprobs: null,
      },
    ],
  };
}
