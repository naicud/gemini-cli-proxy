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
    {
      schema: {
        description:
          'Creates a model response for the given chat conversation.',
        tags: ['chat'],
        body: {
          type: 'object',
          required: ['messages', 'model'],
          properties: {
            model: {
              type: 'string',
              description: 'ID of the model to use.',
              enum: [
                'gemini-2.5-pro',
                'gemini-2.5-flash',
                'gemini-2.5-flash-lite',
                'gemini-3-pro-preview',
                'gemini-3-flash-preview',
                'auto',
              ],
            },
            messages: {
              type: 'array',
              description:
                'A list of messages comprising the conversation so far.',
              items: {
                type: 'object',
                required: ['role', 'content'],
                properties: {
                  role: {
                    type: 'string',
                    enum: ['system', 'user', 'assistant', 'tool'],
                  },
                  content: {
                    anyOf: [
                      { type: 'string' },
                      {
                        type: 'array',
                        items: {
                          anyOf: [
                            {
                              type: 'object',
                              properties: {
                                type: { type: 'string', const: 'text' },
                                text: { type: 'string' },
                              },
                              required: ['type', 'text'],
                            },
                            {
                              type: 'object',
                              properties: {
                                type: { type: 'string', const: 'image_url' },
                                image_url: {
                                  type: 'object',
                                  properties: {
                                    url: {
                                      type: 'string',
                                      description:
                                        'URL or base64 data URL (data:image/jpeg;base64,...)',
                                    },
                                    detail: {
                                      type: 'string',
                                      enum: ['auto', 'low', 'high'],
                                      description:
                                        'Image detail level (defaults to auto)',
                                    },
                                  },
                                  required: ['url'],
                                },
                              },
                              required: ['type', 'image_url'],
                            },
                          ],
                        },
                      },
                    ],
                  },
                  name: { type: 'string' },
                  tool_call_id: { type: 'string' },
                },
              },
            },
            stream: { type: 'boolean', default: false },
            temperature: { type: 'number', minimum: 0, maximum: 2, default: 1 },
            top_p: { type: 'number', minimum: 0, maximum: 1, default: 1 },
            max_tokens: { type: 'integer' },
            presence_penalty: {
              type: 'number',
              minimum: -2,
              maximum: 2,
              default: 0,
            },
            frequency_penalty: {
              type: 'number',
              minimum: -2,
              maximum: 2,
              default: 0,
            },
            stop: {
              anyOf: [
                { type: 'string' },
                { type: 'array', items: { type: 'string' } },
              ],
            },
          },
        },
        response: {
          200: {
            description: 'Successful response',
            // Note: SSE responses aren't well-modeled in standard JSON schema
            // but we provide the non-streaming object structure
            type: 'object',
            properties: {
              id: { type: 'string' },
              object: { type: 'string', example: 'chat.completion' },
              created: { type: 'number' },
              model: { type: 'string' },
              choices: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    index: { type: 'number' },
                    message: {
                      type: 'object',
                      properties: {
                        role: { type: 'string' },
                        content: { type: 'string', nullable: true },
                      },
                    },
                    finish_reason: { type: 'string' },
                  },
                },
              },
              usage: {
                type: 'object',
                properties: {
                  prompt_tokens: { type: 'number' },
                  completion_tokens: { type: 'number' },
                  total_tokens: { type: 'number' },
                },
              },
            },
          },
        },
      },
    },
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
        const { contents } = await openaiToGemini(body.messages);

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
          // Streaming response - write SSE manually
          reply.raw.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
          });

          const sseStream = geminiToOpenAIStream(
            geminiStream,
            body.model,
            includeThinking,
          );

          for await (const event of sseStream) {
            const data =
              typeof event.data === 'string'
                ? event.data
                : JSON.stringify(event.data);
            reply.raw.write(`data: ${data}\n\n`);
          }

          reply.raw.end();
          return;
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
