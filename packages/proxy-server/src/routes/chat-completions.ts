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
  // Single shared session per proxy instance - prevents memory leaks
  // Each request sets its own history (OpenAI clients send full conversation each time)
  let sharedSession: Awaited<
    ReturnType<typeof sessionManager.getOrCreate>
  > | null = null;
  const includeThinking = process.env['INCLUDE_THINKING'] !== 'false';

  fastify.post<RequestBody>(
    '/v1/chat/completions',
    {
      schema: {
        description:
          'Creates a model response for the given chat conversation.',
        tags: ['chat'],
        // No body schema validation - OpenAI clients send various formats
        // Validation is handled by the route handler and message converter
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
                        reasoning_content: { type: 'string', nullable: true },
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

      if (!body.model) {
        return reply.status(400).send({
          error: {
            message: 'model is required',
            type: 'invalid_request_error',
            code: 'invalid_model',
          },
        });
      }

      try {
        // Reuse shared session or create one (singleton pattern prevents memory leaks)
        if (!sharedSession) {
          sharedSession = await sessionManager.getOrCreate({
            model: body.model,
            workingDirectory: options.config?.workingDirectory,
          });
        }

        // Convert OpenAI messages to Gemini format including system instruction
        const { contents, systemInstruction } = await openaiToGemini(
          body.messages,
        );

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

        // Set conversation history (all messages except the last one)
        // This enables multi-turn conversations - critical for OpenAI API compatibility
        const historyContents = contents.slice(0, -1);
        sharedSession.client.setHistory(historyContents);

        // TODO: Apply systemInstruction if available (requires GeminiClient API support)
        // For now, systemInstruction is extracted but not used until API supports it
        if (systemInstruction) {
          request.log.debug(
            { systemInstruction },
            'System instruction extracted but not applied (pending API support)',
          );
        }

        const promptId = uuid();
        const abortController = new AbortController();

        // Handle client disconnect
        request.raw.on('close', () => {
          abortController.abort();
        });

        // Build per-request config overrides from OpenAI parameters
        const configOverrides: Record<string, unknown> = {};
        // Map OpenAI max_tokens/max_completion_tokens to Gemini maxOutputTokens
        // max_completion_tokens takes precedence (new standard for reasoning models)
        if (body.max_completion_tokens !== undefined) {
          configOverrides['maxOutputTokens'] = body.max_completion_tokens;
        } else if (body.max_tokens !== undefined) {
          configOverrides['maxOutputTokens'] = body.max_tokens;
        }
        if (body.temperature !== undefined) {
          configOverrides['temperature'] = body.temperature;
        }
        if (body.top_p !== undefined) {
          configOverrides['topP'] = body.top_p;
        }
        if (body.stop !== undefined) {
          configOverrides['stopSequences'] = Array.isArray(body.stop)
            ? body.stop
            : [body.stop];
        }

        // Log config overrides for debugging
        if (Object.keys(configOverrides).length > 0) {
          request.log.debug(
            { configOverrides },
            'Applying config overrides from OpenAI request',
          );
        }

        const geminiStream = sharedSession.client.sendMessageStream(
          lastUserContent.parts ?? [],
          abortController.signal,
          promptId,
          undefined, // turns (use default)
          false, // isInvalidStreamRetry
          Object.keys(configOverrides).length > 0 ? configOverrides : undefined,
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

          try {
            for await (const event of sseStream) {
              const data =
                typeof event.data === 'string'
                  ? event.data
                  : JSON.stringify(event.data);
              reply.raw.write(`data: ${data}\n\n`);
            }
          } catch (streamError) {
            // After headers are sent, send error as SSE event (can't use reply.status)
            request.log.error(streamError, 'Error during streaming');
            const errorChunk = {
              id: `chatcmpl-${uuid()}`,
              object: 'chat.completion.chunk',
              created: Math.floor(Date.now() / 1000),
              model: body.model,
              choices: [
                {
                  index: 0,
                  delta: {
                    content: `\n\n[Error: ${
                      streamError instanceof Error
                        ? streamError.message
                        : 'Stream error'
                    }]`,
                  },
                  finish_reason: 'stop',
                  logprobs: null,
                },
              ],
            };
            reply.raw.write(`data: ${JSON.stringify(errorChunk)}\n\n`);
            reply.raw.write(`data: [DONE]\n\n`);
          }

          reply.raw.end();
          return;
        } else {
          // Non-streaming response - collect all chunks
          const chunks: OpenAI.ChatCompletionChunk[] = [];
          let usage: OpenAI.CompletionUsage | undefined;
          let streamError: Error | null = null;

          try {
            for await (const event of geminiToOpenAIStream(
              geminiStream,
              body.model,
              includeThinking,
            )) {
              if (typeof event.data !== 'string') {
                const chunk = event.data as OpenAI.ChatCompletionChunk & {
                  usage?: OpenAI.CompletionUsage;
                };
                if (chunk.usage) {
                  usage = chunk.usage;
                }
                chunks.push(chunk);
              }
            }
          } catch (err) {
            // Capture stream error to propagate it properly
            streamError = err instanceof Error ? err : new Error(String(err));
            request.log.error(streamError, 'Error during Gemini stream');
          }

          // If we got an error from the stream, re-throw it
          if (streamError) {
            throw streamError;
          }

          // Check if we actually got any content from the stream
          // (prevents returning null content when API fails silently)
          const hasContent = chunks.some(
            (c) =>
              c.choices[0]?.delta?.content ||
              c.choices[0]?.delta?.tool_calls?.length,
          );
          if (!hasContent && chunks.length <= 1) {
            throw new Error(
              'No content received from the model. The request may have been rejected.',
            );
          }

          const response = buildNonStreamingResponse(chunks, body.model, usage);
          return await reply.send(response);
        }
      } catch (error) {
        request.log.error(error, 'Error processing chat completion');
        // Re-throw to let the global error handler format the response
        throw error;
      }
    },
  );
};

function buildNonStreamingResponse(
  chunks: OpenAI.ChatCompletionChunk[],
  model: string,
  usage?: OpenAI.CompletionUsage,
): ChatCompletion {
  // Aggregated content from chunks
  let content = '';
  let reasoningContent = '';
  const toolCalls: OpenAI.ChatCompletionMessageToolCall[] = [];

  for (const chunk of chunks) {
    const delta = chunk.choices[0]?.delta;
    if (delta) {
      if (delta.content) content += delta.content;
      if (
        (
          delta as OpenAI.ChatCompletionChunk.Choice.Delta & {
            reasoning_content?: string;
          }
        ).reasoning_content
      ) {
        reasoningContent += (
          delta as OpenAI.ChatCompletionChunk.Choice.Delta & {
            reasoning_content?: string;
          }
        ).reasoning_content!;
      }
      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          if (tc.index !== undefined) {
            // Reconstruct tool calls based on index
            if (!toolCalls[tc.index]) {
              toolCalls[tc.index] = {
                id: tc.id ?? `call_${uuid()}`,
                type: 'function',
                function: { name: '', arguments: '' },
              };
            }
            if (tc.function?.name)
              toolCalls[tc.index].function.name += tc.function.name;
            if (tc.function?.arguments)
              toolCalls[tc.index].function.arguments += tc.function.arguments;
          }
        }
      }
    }
  }

  const finishReason =
    chunks.find((c) => c.choices[0]?.finish_reason)?.choices[0]
      ?.finish_reason ?? 'stop';

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
          reasoning_content: reasoningContent || undefined,
          tool_calls:
            toolCalls.length > 0 ? toolCalls.filter(Boolean) : undefined,
          refusal: null,
        } as OpenAI.ChatCompletionMessage,
        finish_reason:
          finishReason,
        logprobs: null,
      },
    ],
    usage: usage ?? {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    },
  };
}
