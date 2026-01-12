/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type OpenAI from 'openai';
import type { Content, Part } from '@google/genai';

type ChatCompletionMessageParam = OpenAI.ChatCompletionMessageParam;

// OpenAI content types:
// - { type: 'text', text: string }
// - { type: 'image_url', image_url: { url: string, detail?: 'auto' | 'low' | 'high' } }
// Runtime uses unknown for flexibility with OpenAI SDK's broad union types.

/**
 * Converts OpenAI message format to Gemini Content format.
 * Supports text, images (base64 and URLs), and tool calls.
 */
export async function openaiToGemini(
  messages: ChatCompletionMessageParam[],
): Promise<{
  systemInstruction: string | undefined;
  contents: Content[];
}> {
  let systemInstruction: string | undefined;
  const contents: Content[] = [];

  for (const message of messages) {
    if (message.role === 'system') {
      systemInstruction = extractTextContent(message.content);
      continue;
    }

    if (message.role === 'user') {
      const parts = await convertContentToParts(message.content);
      if (parts.length > 0) {
        contents.push({ role: 'user', parts });
      }
      continue;
    }

    if (message.role === 'assistant') {
      const parts: Part[] = [];

      if (message.content) {
        parts.push({ text: extractTextContent(message.content) });
      }

      if (message.tool_calls) {
        for (const toolCall of message.tool_calls) {
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
        contents.push({ role: 'model', parts });
      }
      continue;
    }

    if (message.role === 'tool') {
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
 * Converts OpenAI content (string or array) to Gemini Part array.
 * Handles text, image_url (base64 and HTTP URLs).
 *
 * Note: External HTTP URLs are converted to inline base64 by fetching.
 * This ensures compatibility as Gemini's fileData only works with GCS URIs.
 */
async function convertContentToParts(content: unknown): Promise<Part[]> {
  if (!content) return [];

  if (typeof content === 'string') {
    return [{ text: content }];
  }

  if (!Array.isArray(content)) return [];

  const parts: Part[] = [];

  for (const part of content) {
    if (typeof part !== 'object' || part === null) continue;

    const typedPart = part as {
      type?: string;
      text?: string;
      image_url?: { url?: string };
    };

    if (typedPart.type === 'text' && typedPart.text) {
      parts.push({ text: typedPart.text });
    } else if (typedPart.type === 'image_url' && typedPart.image_url?.url) {
      const imageUrl = typedPart.image_url.url;

      // Handle base64 data URLs: data:image/jpeg;base64,/9j/4AAQ...
      if (imageUrl.startsWith('data:')) {
        const match = imageUrl.match(/^data:([^;]+);base64,(.+)$/);
        if (match) {
          const [, mimeType, base64Data] = match;
          parts.push({
            inlineData: {
              mimeType,
              data: base64Data,
            },
          });
        }
      } else {
        // HTTP/HTTPS URLs - fetch and convert to base64
        // Gemini's fileData only works with GCS URIs, so we must fetch external URLs
        try {
          const response = await fetch(imageUrl);
          if (response.ok) {
            const arrayBuffer = await response.arrayBuffer();
            const base64Data = Buffer.from(arrayBuffer).toString('base64');
            const mimeType =
              response.headers.get('content-type') ||
              inferMimeTypeFromUrl(imageUrl);
            parts.push({
              inlineData: {
                mimeType,
                data: base64Data,
              },
            });
          }
        } catch {
          // If fetch fails, skip this image
        }
      }
    }
  }

  return parts;
}

/**
 * Extracts text-only content from OpenAI message content.
 */
function extractTextContent(content: unknown): string {
  if (!content) return '';

  if (typeof content === 'string') return content;

  if (!Array.isArray(content)) return '';

  return content
    .filter(
      (part): part is { type: 'text'; text: string } =>
        typeof part === 'object' &&
        part !== null &&
        (part as { type?: string }).type === 'text' &&
        typeof (part as { text?: string }).text === 'string',
    )
    .map((part) => part.text)
    .join('\n');
}

/**
 * Infers MIME type from image URL extension.
 */
function inferMimeTypeFromUrl(url: string): string {
  const lowercaseUrl = url.toLowerCase();
  if (lowercaseUrl.includes('.png')) return 'image/png';
  if (lowercaseUrl.includes('.gif')) return 'image/gif';
  if (lowercaseUrl.includes('.webp')) return 'image/webp';
  if (lowercaseUrl.includes('.svg')) return 'image/svg+xml';
  return 'image/jpeg'; // Default
}
