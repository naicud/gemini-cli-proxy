/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  GeminiEventType,
  type ServerGeminiContentEvent,
  type ServerGeminiThoughtEvent,
  type ServerGeminiToolCallRequestEvent,
  type ServerGeminiFinishedEvent,
} from '@google/gemini-cli-core';

/**
 * Creates a mock content stream event.
 */
export function createContentEvent(text: string): ServerGeminiContentEvent {
  return {
    type: GeminiEventType.Content,
    value: text,
  };
}

/**
 * Creates a mock thought/reasoning event.
 */
export function createThoughtEvent(text: string): ServerGeminiThoughtEvent {
  return {
    type: GeminiEventType.Thought,
    value: { subject: 'Thinking', description: text },
  };
}

/**
 * Creates a mock tool call request event.
 */
export function createToolCallEvent(
  name: string,
  args: Record<string, unknown>,
  callId?: string,
): ServerGeminiToolCallRequestEvent {
  return {
    type: GeminiEventType.ToolCallRequest,
    value: {
      callId: callId ?? `call_${Math.random().toString(36).slice(2)}`,
      name,
      args,
      isClientInitiated: false,
      prompt_id: 'test-prompt-id',
    },
  };
}

/**
 * Creates a mock finished event with optional usage metadata.
 */
export function createFinishedEvent(usage?: {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
}): ServerGeminiFinishedEvent {
  return {
    type: GeminiEventType.Finished,
    value: {
      reason: undefined,
      usageMetadata: usage,
    },
  };
}

/**
 * Creates an async generator from an array of events.
 */
export async function* arrayToAsyncGenerator<T>(items: T[]): AsyncGenerator<T> {
  for (const item of items) {
    yield item;
  }
}
