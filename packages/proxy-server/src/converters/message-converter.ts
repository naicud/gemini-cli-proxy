/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type OpenAI from 'openai';
import type { Content, Part } from '@google/genai';

type ChatCompletionMessageParam = OpenAI.ChatCompletionMessageParam;

/**
 * Converts OpenAI message format to Gemini Content format.
 */
export function openaiToGemini(messages: ChatCompletionMessageParam[]): {
  systemInstruction: string | undefined;
  contents: Content[];
} {
  let systemInstruction: string | undefined;
  const contents: Content[] = [];

  for (const message of messages) {
    if (message.role === 'system') {
      // System messages become system instruction
      systemInstruction = extractTextContent(message.content);
      continue;
    }

    if (message.role === 'user') {
      contents.push({
        role: 'user',
        parts: [{ text: extractTextContent(message.content) }],
      });
      continue;
    }

    if (message.role === 'assistant') {
      const parts: Part[] = [];

      // Handle text content
      if (message.content) {
        parts.push({ text: extractTextContent(message.content) });
      }

      // Handle tool calls
      const assistantMessage =
        message;
      if (assistantMessage.tool_calls) {
        for (const toolCall of assistantMessage.tool_calls) {
          if (toolCall.type === 'function') {
            parts.push({
              functionCall: {
                name: toolCall.function.name,
                args: JSON.parse(toolCall.function.arguments) as Record<
                  string,
                  unknown
                >,
              },
            });
          }
        }
      }

      if (parts.length > 0) {
        contents.push({
          role: 'model',
          parts,
        });
      }
      continue;
    }

    if (message.role === 'tool') {
      // Tool response
      contents.push({
        role: 'user',
        parts: [
          {
            functionResponse: {
              name: message.tool_call_id,
              response: { result: message.content },
            },
          },
        ],
      });
    }
  }

  return { systemInstruction, contents };
}

/**
 * Extracts text content from various OpenAI content formats.
 */
function extractTextContent(
  content: string | Array<{ type: string; text?: string }> | null | undefined,
): string {
  if (content === null || content === undefined) {
    return '';
  }

  if (typeof content === 'string') {
    return content;
  }

  // Handle array content (multi-part message)
  return content
    .filter(
      (part): part is { type: 'text'; text: string } =>
        part.type === 'text' && !!part.text,
    )
    .map((part) => part.text)
    .join('\n');
}
