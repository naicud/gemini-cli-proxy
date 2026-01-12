/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';

const loggerPluginCallback: FastifyPluginAsync = async (fastify) => {
  // Log Request Body
  fastify.addHook('preHandler', async (request) => {
    // console.log('DEBUG: preHandler running', request.body);
    if (request.body) {
      // Create a shallow copy to avoid mutating the original body if we sanitize
      request.log.info({ body: request.body }, 'Incoming Request Body');
    } else {
      request.log.info('Incoming Request Body: <empty>');
    }
  });

  // Log Response Body (non-streaming)
  fastify.addHook('onSend', async (request, reply, payload) => {
    // Determine content type
    const contentType = reply.getHeader('content-type');

    // Handle Streaming/SSE - Do not log full stream content to avoid noise/memory issues
    if (
      typeof contentType === 'string' &&
      (contentType.includes('text/event-stream') ||
        contentType.includes('application/x-ndjson'))
    ) {
      request.log.info('Starting Streaming Response...');
      return payload;
    }

    // Handle JSON/Text responses
    if (typeof payload === 'string') {
      try {
        // Try parsing JSON to log it as object
        const json = JSON.parse(payload);
        request.log.info({ response: json }, 'Response Body');
      } catch {
        // Fallback to text logging (truncated)
        const truncated =
          payload.length > 2000 ? `${payload.slice(0, 2000)}...` : payload;
        request.log.info({ response: truncated }, 'Response Body (Text)');
      }
    }

    return payload;
  });
};

export const loggerPlugin = fp(loggerPluginCallback, {
  name: 'logger-plugin',
});
