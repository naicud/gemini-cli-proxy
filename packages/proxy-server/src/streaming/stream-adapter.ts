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
  let toolCallIndex = 0;

  for await (const event of geminiStream) {
    const result = processEvent(
      event,
      id,
      created,
      model,
      isFirstChunk,
      includeThinking,
      toolCallIndex,
    );
    if (result !== null) {
      yield { data: result.chunk };
      isFirstChunk = false;
      if (result.isToolCall) {
        toolCallIndex++;
      }
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

interface ProcessEventResult {
  readonly chunk: ChatCompletionChunk;
  readonly isToolCall: boolean;
}

function processEvent(
  event: ServerGeminiStreamEvent,
  id: string,
  created: number,
  model: string,
  isFirstChunk: boolean,
  includeThinking: boolean,
  toolCallIndex: number,
): ProcessEventResult | null {
  const delta: ChatCompletionChunkChoice['delta'] & {
    reasoning_content?: string;
  } = {};

  let isToolCall = false;

  if (isFirstChunk) {
    delta.role = 'assistant';
  }

  // Handle content events - value is directly a string
  if (event.type === 'content' && event.value) {
    delta.content = event.value;
  }

  // Handle thought events - value is ThoughtSummary with subject and description
  if (includeThinking && event.type === 'thought' && event.value) {
    const thought = event.value as { subject?: string; description?: string };
    if (thought.description) {
      delta.reasoning_content = thought.description;
    }
  }

  // Handle tool call request events
  if (event.type === 'tool_call_request' && event.value) {
    const toolCall = event.value as {
      callId?: string;
      name?: string;
      args?: Record<string, unknown>;
    };
    delta.tool_calls = [
      {
        index: toolCallIndex,
        id: toolCall.callId ?? `call_${uuid()}`,
        type: 'function',
        function: {
          name: toolCall.name ?? '',
          arguments: JSON.stringify(toolCall.args ?? {}),
        },
      },
    ];
    isToolCall = true;
  }

  // Only emit if we have content
  if (Object.keys(delta).length === 0) {
    return null;
  }

  return {
    chunk: {
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
    },
    isToolCall,
  };
}
