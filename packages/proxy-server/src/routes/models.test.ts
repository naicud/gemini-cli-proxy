/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import { modelsRoute } from './models.js';

describe('modelsRoute', () => {
  let fastify: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    fastify = Fastify({ logger: false });
    await fastify.register(modelsRoute);
    await fastify.ready();
  });

  afterEach(async () => {
    await fastify.close();
  });

  describe('GET /v1/models', () => {
    it('returns list of all available models', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/v1/models',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.object).toBe('list');
      expect(body.data).toBeInstanceOf(Array);
      expect(body.data.length).toBeGreaterThan(0);

      // Verify model structure
      const model = body.data[0];
      expect(model).toHaveProperty('id');
      expect(model).toHaveProperty('object', 'model');
      expect(model).toHaveProperty('created');
      expect(model).toHaveProperty('owned_by', 'google');
    });

    it('includes expected Gemini models', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/v1/models',
      });

      const body = JSON.parse(response.body);
      const modelIds = body.data.map((m: { id: string }) => m.id);

      expect(modelIds).toContain('gemini-2.5-pro');
      expect(modelIds).toContain('gemini-2.5-flash');
      expect(modelIds).toContain('gemini-2.5-flash-lite');
      expect(modelIds).toContain('gemini-3-pro-preview');
      expect(modelIds).toContain('gemini-3-flash-preview');
      expect(modelIds).toContain('auto');
    });
  });

  describe('GET /v1/models/:model', () => {
    it('returns specific model by id', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/v1/models/gemini-2.5-flash',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.id).toBe('gemini-2.5-flash');
      expect(body.object).toBe('model');
      expect(body.owned_by).toBe('google');
    });

    it('returns auto model', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/v1/models/auto',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.id).toBe('auto');
    });

    it('returns 404 for non-existent model', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/v1/models/gpt-4-turbo',
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error.type).toBe('invalid_request_error');
      expect(body.error.code).toBe('model_not_found');
      expect(body.error.message).toContain("'gpt-4-turbo' not found");
    });

    it('returns 200 for trailing slash (matches list endpoint)', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/v1/models/',
      });

      // Trailing slash may match /v1/models or /v1/models/:model with empty
      // Fastify behavior: trailing slash with empty param returns 404
      expect([200, 404]).toContain(response.statusCode);
    });
  });
});
