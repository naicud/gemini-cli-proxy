/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import Fastify, { type FastifyInstance } from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifySSE from '@fastify/sse';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import { chatCompletionsRoute } from './routes/chat-completions.js';
import { modelsRoute } from './routes/models.js';
import type { ServerConfig } from './types.js';

import { loggerPlugin } from './plugins/logger.js';

export async function createServer(
  config: Partial<ServerConfig> = {},
): Promise<FastifyInstance> {
  const fastify = Fastify({
    logger: true,
  });

  // Register Logger Plugin (Custom request/response logging)
  await fastify.register(loggerPlugin);

  // Register CORS
  const corsOrigins = process.env['CORS_ORIGINS'];
  await fastify.register(fastifyCors, {
    origin: corsOrigins
      ? corsOrigins === '*'
        ? true
        : corsOrigins.split(',').map((o) => o.trim())
      : true, // Allow all by default for dev
  });

  // Register Swagger
  await fastify.register(fastifySwagger, {
    openapi: {
      openapi: '3.0.0',
      info: {
        title: 'Gemini CLI Proxy Server',
        description: 'OpenAI-compatible REST API for Gemini CLI',
        version: '0.1.0',
      },
      servers: [
        {
          url: 'http://localhost:3000',
          description: 'Local development server',
        },
      ],
      tags: [
        { name: 'chat', description: 'Chat completions endpoints' },
        { name: 'models', description: 'Model management endpoints' },
      ],
    },
  });

  // Register Swagger UI
  await fastify.register(fastifySwaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
    },
  });

  // Register @fastify/sse plugin
  await fastify.register(fastifySSE.default ?? fastifySSE);

  // Register routes
  await fastify.register(chatCompletionsRoute, { config });
  await fastify.register(modelsRoute);

  return fastify;
}

export async function main(): Promise<void> {
  // Import CLI module dynamically to avoid circular dependencies
  const { parseCliArgs, printHelp, printVersion } = await import('./cli.js');

  const cliOptions = parseCliArgs();

  if (cliOptions.help) {
    printHelp();
    process.exit(0);
  }

  if (cliOptions.version) {
    printVersion();
    process.exit(0);
  }

  const config: ServerConfig = {
    port: cliOptions.port,
    host: cliOptions.host,
    workingDirectory: cliOptions.workingDir,
  };

  // Set environment variables for downstream modules that read from env
  if (cliOptions.corsOrigins) {
    process.env['CORS_ORIGINS'] = cliOptions.corsOrigins;
  }
  if (cliOptions.includeThinking) {
    process.env['INCLUDE_THINKING'] = 'true';
  }

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
