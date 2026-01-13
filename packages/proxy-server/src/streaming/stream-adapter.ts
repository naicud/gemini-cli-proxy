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
  let usage: OpenAI.CompletionUsage | undefined;

  for await (const event of geminiStream) {
    // Capture usage if available in the finished event
    if (event.type === 'finished' && event.value.usageMetadata) {
      usage = {
        prompt_tokens: event.value.usageMetadata.promptTokenCount ?? 0,
        completion_tokens: event.value.usageMetadata.candidatesTokenCount ?? 0,
        total_tokens: event.value.usageMetadata.totalTokenCount ?? 0,
      };
    }

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

  // Final chunk with finish_reason and usage
  const finalChunk: ChatCompletionChunk & {
    usage?: OpenAI.CompletionUsage;
  } = {
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
    usage,
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

  // Handle finished event to map finish_reason correctly
  let finishReason: OpenAI.ChatCompletionChunk.Choice['finish_reason'] = null;
  if (event.type === 'finished') {
    const geminiReason = event.value.reason;
    if (geminiReason === 'STOP') {
      finishReason = 'stop';
    } else if (geminiReason === 'MAX_TOKENS') {
      finishReason = 'length';
    } else if (
      geminiReason === 'SAFETY' ||
      geminiReason === 'RECITATION' ||
      geminiReason === 'OTHER'
    ) {
      finishReason = 'content_filter';
    } else {
      finishReason = 'stop'; // Default fallback
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
          delta: {
            ...delta,
            refusal: delta.refusal ?? null,
          } as OpenAI.ChatCompletionChunk.Choice.Delta,
          finish_reason: finishReason,
          logprobs: null,
        },
      ],
    },
    isToolCall,
  };
}
