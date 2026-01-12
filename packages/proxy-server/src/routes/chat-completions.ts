/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import type OpenAI from 'openai';
import { v4 as uuid } from 'uuid';
import { SessionManager } from '../session/session-manager.js';
import { openaiToGemini } from '../converters/message-converter.js';
import { geminiToOpenAIStream } from '../streaming/stream-adapter.js';
import type { ServerConfig } from '../types.js';

type ChatCompletionCreateParams = OpenAI.ChatCompletionCreateParams;
type ChatCompletion = OpenAI.ChatCompletion;

interface RouteOptions {
  readonly config?: Partial<ServerConfig>;
}

interface RequestBody {
  Body: ChatCompletionCreateParams;
}

export const chatCompletionsRoute: FastifyPluginAsync<RouteOptions> = async (
  fastify,
  options,
) => {
  const sessionManager = new SessionManager();
  const includeThinking = process.env['INCLUDE_THINKING'] === 'true';

  fastify.post<RequestBody>(
    '/v1/chat/completions',
    { sse: true },
    async (request: FastifyRequest<RequestBody>, reply: FastifyReply) => {
      const body = request.body;

      if (!body.messages || body.messages.length === 0) {
        return reply.status(400).send({
          error: {
            message: 'messages is required and must not be empty',
            type: 'invalid_request_error',
            code: 'invalid_messages',
          },
        });
      }

      try {
        const session = await sessionManager.getOrCreate({
          model: body.model,
          workingDirectory: options.config?.workingDirectory,
        });

        // Convert OpenAI messages to Gemini format
        const { contents } = openaiToGemini(body.messages);

        // Get the last user message content for streaming
        const lastUserContent = contents[contents.length - 1];
        if (!lastUserContent) {
          return await reply.status(400).send({
            error: {
              message: 'No user message found',
              type: 'invalid_request_error',
              code: 'invalid_messages',
            },
          });
        }

        const promptId = uuid();
        const abortController = new AbortController();

        // Handle client disconnect
        request.raw.on('close', () => {
          abortController.abort();
        });

        const geminiStream = session.client.sendMessageStream(
          lastUserContent.parts ?? [],
          abortController.signal,
          promptId,
        );

        if (body.stream) {
          // Streaming response using @fastify/sse
          const sseStream = geminiToOpenAIStream(
            geminiStream,
            body.model,
            includeThinking,
          );
          await reply.sse.send(sseStream);
        } else {
          // Non-streaming response - collect all chunks
          const chunks: OpenAI.ChatCompletionChunk[] = [];
          for await (const event of geminiToOpenAIStream(
            geminiStream,
            body.model,
            includeThinking,
          )) {
            if (typeof event.data !== 'string') {
              chunks.push(event.data as OpenAI.ChatCompletionChunk);
            }
          }

          const response = buildNonStreamingResponse(chunks, body.model);
          return await reply.send(response);
        }
      } catch (error) {
        request.log.error(error, 'Error processing chat completion');
        return reply.status(500).send({
          error: {
            message:
              error instanceof Error ? error.message : 'Internal server error',
            type: 'api_error',
            code: 'internal_error',
          },
        });
      }
    },
  );
};

function buildNonStreamingResponse(
  chunks: OpenAI.ChatCompletionChunk[],
  model: string,
): ChatCompletion {
  const content = chunks
    .map((c) => c.choices[0]?.delta?.content ?? '')
    .join('');

  const toolCalls = chunks
    .flatMap((c) => c.choices[0]?.delta?.tool_calls ?? [])
    .filter(
      (tc): tc is OpenAI.ChatCompletionChunk.Choice.Delta.ToolCall => !!tc,
    );

  return {
    id: chunks[0]?.id ?? `chatcmpl-${uuid()}`,
    object: 'chat.completion',
    created: chunks[0]?.created ?? Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: content || null,
          tool_calls:
            toolCalls.length > 0
              ? toolCalls.map((tc) => ({
                  id: tc.id ?? `call_${uuid()}`,
                  type: 'function' as const,
                  function: {
                    name: tc.function?.name ?? '',
                    arguments: tc.function?.arguments ?? '{}',
                  },
                }))
              : undefined,
          refusal: null,
        },
        finish_reason: 'stop',
        logprobs: null,
      },
    ],
    usage: {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    },
  };
}
