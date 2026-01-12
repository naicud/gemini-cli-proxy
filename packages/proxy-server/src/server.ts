/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import Fastify, { type FastifyInstance } from 'fastify';
import fastifySSE from '@fastify/sse';
import { chatCompletionsRoute } from './routes/chat-completions.js';
import { modelsRoute } from './routes/models.js';
import type { ServerConfig } from './types.js';

export async function createServer(
  config: Partial<ServerConfig> = {},
): Promise<FastifyInstance> {
  const fastify = Fastify({
    logger: true,
  });

  // Register @fastify/sse plugin
  await fastify.register(fastifySSE.default ?? fastifySSE);

  // Register routes
  await fastify.register(chatCompletionsRoute, { config });
  await fastify.register(modelsRoute);

  return fastify;
}

export async function main(): Promise<void> {
  const port = parseInt(process.env['PORT'] ?? '3000', 10);
  const host = process.env['HOST'] ?? '0.0.0.0';
  const workingDirectory = process.env['WORKING_DIR'] ?? process.cwd();

  const config: ServerConfig = {
    port,
    host,
    workingDirectory,
  };

  const server = await createServer(config);

  try {
    await server.listen({ port: config.port, host: config.host });
    server.log.info(
      `Gemini CLI Proxy Server running at http://${config.host}:${config.port}`,
    );
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

// Run if executed directly
if (process.argv[1]?.includes('server')) {
  main().catch((err: unknown) => {
    // eslint-disable-next-line no-console
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}
