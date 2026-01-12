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
  SessionManager () {
    return {
      getOrCreate: async () => ({
        id: 'test-session-id',
        client: {
          async *sendMessageStream () {
            yield { type: GeminiEventType.Content, value: 'Test response' };
          },
        },
        config: {},
        createdAt: new Date(),
      }),
      get: vi.fn(),
      delete: vi.fn(),
    };
  },
}));

describe('chatCompletionsRoute', () => {
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
      expect(body.usage).toEqual({
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
      });
    });
  });

  describe('streaming completion', () => {
    it('returns SSE stream with proper format', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/v1/chat/completions',
        payload: {
          model: 'gemini-2.5-flash',
          messages: [{ role: 'user', content: 'Hello' }],
          stream: true,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('text/event-stream');

      // Parse SSE events
      const events = response.body
        .split('\n\n')
        .filter((line: string) => line.startsWith('data: '))
        .map((line: string) => line.replace('data: ', ''));

      // Should have content chunks + final + [DONE]
      expect(events.length).toBeGreaterThanOrEqual(2);

      // First event should be a JSON chunk
      const firstEvent = JSON.parse(events[0]);
      expect(firstEvent.object).toBe('chat.completion.chunk');
      expect(firstEvent.choices[0].delta.role).toBe('assistant');

      // Last event should be [DONE]
      expect(events[events.length - 1]).toBe('[DONE]');
    });

    it('returns proper SSE content-type header', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/v1/chat/completions',
        payload: {
          model: 'gemini-2.5-flash',
          messages: [{ role: 'user', content: 'Hello' }],
          stream: true,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('text/event-stream');
    });
  });
});
