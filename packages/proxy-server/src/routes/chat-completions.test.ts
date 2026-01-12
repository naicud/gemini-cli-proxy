/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import fastifySSE from '@fastify/sse';
import { chatCompletionsRoute } from './chat-completions.js';
import { GeminiEventType } from '@google/gemini-cli-core';

// Mock the session manager module - uses a simple content generator
vi.mock('../session/session-manager.js', () => ({
  SessionManager: class {
    getOrCreate = async () => ({
      id: 'test-session-id',
      client: {
        async *sendMessageStream() {
          yield {
            type: GeminiEventType.Thought,
            value: { description: 'Thinking process...' },
          };
          yield { type: GeminiEventType.Content, value: 'Test response' };
          yield {
            type: GeminiEventType.Finished,
            value: {
              reason: undefined,
              usageMetadata: {
                promptTokenCount: 100,
                candidatesTokenCount: 50,
                totalTokenCount: 150,
              },
            },
          };
        },
        setHistory: vi.fn(),
      },
      config: {},
      createdAt: new Date(),
    });
    get = vi.fn();
    delete = vi.fn();
  },
}));

describe('chatCompletionsRoute - Unit Tests', () => {
  let fastify: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    vi.clearAllMocks();
    fastify = Fastify({ logger: false });
    await fastify.register(fastifySSE.default ?? fastifySSE);
    await fastify.register(chatCompletionsRoute, {});
    await fastify.ready();
  });

  afterEach(async () => {
    await fastify.close();
  });

  describe('input validation', () => {
    it('returns 400 when messages array is empty', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/v1/chat/completions',
        payload: {
          model: 'gemini-2.5-flash',
          messages: [],
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('invalid_messages');
    });

    it('returns 400 when messages is missing', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/v1/chat/completions',
        payload: {
          model: 'gemini-2.5-flash',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 400 when model is missing', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/v1/chat/completions',
        payload: {
          messages: [{ role: 'user', content: 'Hello' }],
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('non-streaming completion', () => {
    it('returns a complete ChatCompletion response', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/v1/chat/completions',
        payload: {
          model: 'gemini-2.5-flash',
          messages: [{ role: 'user', content: 'Hello' }],
          stream: false,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.object).toBe('chat.completion');
      expect(body.model).toBe('gemini-2.5-flash');
      expect(body.choices).toHaveLength(1);
      expect(body.choices[0].message.role).toBe('assistant');
      expect(body.choices[0].message.content).toBe('Test response');
      expect(body.choices[0].finish_reason).toBe('stop');
    });

    it('includes required response fields', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/v1/chat/completions',
        payload: {
          model: 'gemini-2.5-flash',
          messages: [{ role: 'user', content: 'Hello' }],
          stream: false,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.id).toMatch(/^chatcmpl-/);
      expect(body.created).toBeTypeOf('number');
      expect(body.usage).toBeDefined();
    });

    it('includes usage metadata from Gemini response', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/v1/chat/completions',
        payload: {
          model: 'gemini-2.5-flash',
          messages: [{ role: 'user', content: 'Hello' }],
          stream: false,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.usage).toEqual({
        prompt_tokens: 100,
        completion_tokens: 50,
        total_tokens: 150,
      });
    });

    it('includes reasoning_content when thinking is available', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/v1/chat/completions',
        payload: {
          model: 'gemini-2.5-flash',
          messages: [{ role: 'user', content: 'Hello' }],
          stream: false,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.choices[0].message.reasoning_content).toBe(
        'Thinking process...',
      );
    });
  });

  // Note: Streaming and function calling are tested in e2e.test.ts
  // with a real proxy server for more reliable results.
});
