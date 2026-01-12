/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  errorHandlerPlugin,
  mapStatusToErrorType,
  extractGaxiosError,
  createOpenAIError,
} from '../plugins/error-handler.js';

describe('Error Handler Plugin', () => {
  let fastify: FastifyInstance;

  beforeEach(async () => {
    vi.resetAllMocks();
    fastify = Fastify({ logger: false });
    await fastify.register(errorHandlerPlugin);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fastify.close();
  });

  describe('mapStatusToErrorType', () => {
    it('should map 400 to invalid_request_error', () => {
      const result = mapStatusToErrorType(400);
      expect(result).toEqual({
        type: 'invalid_request_error',
        code: 'bad_request',
      });
    });

    it('should map 401 to authentication_error', () => {
      const result = mapStatusToErrorType(401);
      expect(result).toEqual({
        type: 'authentication_error',
        code: 'invalid_api_key',
      });
    });

    it('should map 403 to permission_error', () => {
      const result = mapStatusToErrorType(403);
      expect(result).toEqual({
        type: 'permission_error',
        code: 'insufficient_permissions',
      });
    });

    it('should map 404 to invalid_request_error/model_not_found', () => {
      const result = mapStatusToErrorType(404);
      expect(result).toEqual({
        type: 'invalid_request_error',
        code: 'model_not_found',
      });
    });

    it('should map 429 to rate_limit_error', () => {
      const result = mapStatusToErrorType(429);
      expect(result).toEqual({
        type: 'rate_limit_error',
        code: 'rate_limit_exceeded',
      });
    });

    it('should map 500 to api_error', () => {
      const result = mapStatusToErrorType(500);
      expect(result).toEqual({ type: 'api_error', code: 'server_error' });
    });

    it('should map 503 to api_error', () => {
      const result = mapStatusToErrorType(503);
      expect(result).toEqual({ type: 'api_error', code: 'server_error' });
    });

    it('should map unknown status to api_error/internal_error', () => {
      const result = mapStatusToErrorType(418);
      expect(result).toEqual({ type: 'api_error', code: 'internal_error' });
    });
  });

  describe('extractGaxiosError', () => {
    it('should extract error from direct status property', () => {
      const error = {
        status: 429,
        message: 'Rate limit exceeded',
      };
      const result = extractGaxiosError(error);
      expect(result).toEqual({ status: 429, message: 'Rate limit exceeded' });
    });

    it('should extract error from nested response.status', () => {
      const error = {
        response: {
          status: 400,
          statusText: 'Bad Request',
        },
        message: 'Request failed',
      };
      const result = extractGaxiosError(error);
      expect(result).toEqual({ status: 400, message: 'Request failed' });
    });

    it('should parse JSON string from response.data', () => {
      const error = {
        status: 400,
        response: {
          status: 400,
          data: JSON.stringify({ error: { message: 'Invalid model' } }),
        },
      };
      const result = extractGaxiosError(error);
      expect(result).toEqual({ status: 400, message: 'Invalid model' });
    });

    it('should extract message from response.data object', () => {
      const error = {
        status: 400,
        response: {
          status: 400,
          data: { error: { message: 'Invalid request body' } },
        },
      };
      const result = extractGaxiosError(error);
      expect(result).toEqual({ status: 400, message: 'Invalid request body' });
    });

    it('should return null for non-Gaxios errors', () => {
      const error = new Error('Generic error');
      const result = extractGaxiosError(error);
      expect(result).toBeNull();
    });

    it('should return null for null/undefined', () => {
      expect(extractGaxiosError(null)).toBeNull();
      expect(extractGaxiosError(undefined)).toBeNull();
    });

    it('should use statusText as fallback message', () => {
      const error = {
        response: {
          status: 503,
          statusText: 'Service Unavailable',
        },
      };
      const result = extractGaxiosError(error);
      expect(result).toEqual({ status: 503, message: 'Service Unavailable' });
    });
  });

  describe('createOpenAIError', () => {
    it('should create OpenAI error response structure', () => {
      const result = createOpenAIError(400, 'Invalid model');
      expect(result).toEqual({
        error: {
          message: 'Invalid model',
          type: 'invalid_request_error',
          code: 'bad_request',
        },
      });
    });

    it('should create rate limit error response', () => {
      const result = createOpenAIError(429, 'Too many requests');
      expect(result).toEqual({
        error: {
          message: 'Too many requests',
          type: 'rate_limit_error',
          code: 'rate_limit_exceeded',
        },
      });
    });
  });

  describe('Error Handler Integration', () => {
    it('should transform thrown errors to OpenAI format', async () => {
      fastify.get('/test-error', () => {
        throw new Error('Test error message');
      });

      await fastify.ready();
      const response = await fastify.inject({
        method: 'GET',
        url: '/test-error',
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body).toEqual({
        error: {
          message: 'Test error message',
          type: 'api_error',
          code: 'server_error',
        },
      });
    });

    it('should handle Gaxios-style errors with status', async () => {
      fastify.get('/test-gaxios', () => {
        const error = new Error('Rate limit exceeded') as Error & {
          status: number;
        };
        error.status = 429;
        throw error;
      });

      await fastify.ready();
      const response = await fastify.inject({
        method: 'GET',
        url: '/test-gaxios',
      });

      expect(response.statusCode).toBe(429);
      const body = JSON.parse(response.body);
      expect(body).toEqual({
        error: {
          message: 'Rate limit exceeded',
          type: 'rate_limit_error',
          code: 'rate_limit_exceeded',
        },
      });
    });

    it('should handle Gaxios-style errors with nested response', async () => {
      fastify.get('/test-gaxios-nested', () => {
        const error = new Error('API error') as Error & {
          response: { status: number; data: { error: { message: string } } };
        };
        error.response = {
          status: 400,
          data: { error: { message: 'Invalid request body' } },
        };
        throw error;
      });

      await fastify.ready();
      const response = await fastify.inject({
        method: 'GET',
        url: '/test-gaxios-nested',
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body).toEqual({
        error: {
          message: 'Invalid request body',
          type: 'invalid_request_error',
          code: 'bad_request',
        },
      });
    });

    it('should handle Fastify validation errors', async () => {
      fastify.post('/test-validation', {
        schema: {
          body: {
            type: 'object',
            required: ['name'],
            properties: {
              name: { type: 'string' },
            },
          },
        },
        handler: () => ({ ok: true }),
      });

      await fastify.ready();
      const response = await fastify.inject({
        method: 'POST',
        url: '/test-validation',
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBeDefined();
      expect(body.error.type).toBe('invalid_request_error');
      expect(body.error.code).toBe('bad_request');
      expect(body.error.message).toContain('name');
    });
  });
});
