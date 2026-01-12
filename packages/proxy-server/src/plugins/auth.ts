/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  type FastifyInstance,
  type FastifyRequest,
  type FastifyReply,
} from 'fastify';
import fp from 'fastify-plugin';
import { timingSafeEqual } from 'node:crypto';

/**
 * Routes that bypass authentication.
 * These are public endpoints like docs and health checks.
 */
const PUBLIC_ROUTES = new Set(['/docs', '/docs/', '/health', '/']);

/**
 * Timing-safe string comparison to prevent timing attacks.
 */
function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/**
 * Extract Bearer token from Authorization header.
 */
function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader) return null;
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0]?.toLowerCase() !== 'bearer') {
    return null;
  }
  return parts[1] ?? null;
}

/**
 * Authentication plugin for validating consumer API keys.
 *
 * If PROXY_API_KEY is set, all requests (except public routes) must include
 * a valid Authorization: Bearer <token> header.
 *
 * If PROXY_API_KEY is not set, authentication is disabled (open access).
 */
async function authPluginHandler(fastify: FastifyInstance): Promise<void> {
  const apiKey = process.env['PROXY_API_KEY'];

  // If no API key configured, skip authentication entirely
  if (!apiKey) {
    fastify.log.info(
      'PROXY_API_KEY not set - consumer authentication disabled',
    );
    return;
  }

  fastify.log.info('Consumer API key authentication enabled');

  fastify.addHook(
    'onRequest',
    async (request: FastifyRequest, reply: FastifyReply) => {
      // Allow public routes without authentication
      const path = request.url.split('?')[0] ?? '';
      if (PUBLIC_ROUTES.has(path) || path.startsWith('/docs/')) {
        return;
      }

      const token = extractBearerToken(request.headers.authorization);

      if (!token) {
        reply.code(401).send({
          error: {
            message: 'Missing Authorization header. Expected: Bearer <api_key>',
            type: 'authentication_error',
            code: 'missing_api_key',
          },
        });
        return;
      }

      if (!safeCompare(token, apiKey)) {
        reply.code(401).send({
          error: {
            message: 'Invalid API key',
            type: 'authentication_error',
            code: 'invalid_api_key',
          },
        });
        return;
      }
    },
  );
}

export const authPlugin = fp(authPluginHandler, {
  name: 'auth-plugin',
  fastify: '5.x',
});
