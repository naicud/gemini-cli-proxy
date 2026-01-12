/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { authPlugin } from './auth.js';

describe('authPlugin', () => {
  let fastify: FastifyInstance;
  const originalEnv = process.env['PROXY_API_KEY'];

  beforeEach(() => {
    vi.resetAllMocks();
    fastify = Fastify({ logger: false });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    process.env['PROXY_API_KEY'] = originalEnv;
    await fastify.close();
  });

  describe('when PROXY_API_KEY is not set', () => {
    beforeEach(async () => {
      delete process.env['PROXY_API_KEY'];
      await fastify.register(authPlugin);
      fastify.get('/test', async () => ({ success: true }));
      await fastify.ready();
    });

    it('should allow requests without authorization header', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/test',
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ success: true });
    });
  });

  describe('when PROXY_API_KEY is set', () => {
    const testApiKey = 'test-api-key-12345';

    beforeEach(async () => {
      process.env['PROXY_API_KEY'] = testApiKey;
      await fastify.register(authPlugin);
      fastify.get('/test', async () => ({ success: true }));
      fastify.get('/health', async () => ({ status: 'ok' }));
      fastify.get('/docs', async () => ({ docs: true }));
      await fastify.ready();
    });

    it('should return 401 when authorization header is missing', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/test',
      });

      expect(response.statusCode).toBe(401);
      expect(response.json().error.code).toBe('missing_api_key');
    });

    it('should return 401 when authorization header is invalid format', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/test',
        headers: { authorization: 'Basic invalid' },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json().error.code).toBe('missing_api_key');
    });

    it('should return 401 when API key is invalid', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/test',
        headers: { authorization: 'Bearer wrong-key' },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json().error.code).toBe('invalid_api_key');
    });

    it('should allow request with valid API key', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/test',
        headers: { authorization: `Bearer ${testApiKey}` },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ success: true });
    });

    it('should allow /health without authentication', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.statusCode).toBe(200);
    });

    it('should allow /docs without authentication', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/docs',
      });

      expect(response.statusCode).toBe(200);
    });
  });
});
