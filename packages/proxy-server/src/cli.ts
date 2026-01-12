/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { parseArgs } from 'node:util';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { CliOptions } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function getPackageJson(): {
  version: string;
  name: string;
  description: string;
} {
  const packagePath = join(__dirname, '..', 'package.json');
  const content = readFileSync(packagePath, 'utf-8');
  return JSON.parse(content) as {
    version: string;
    name: string;
    description: string;
  };
}

export function printHelp(): void {
  const pkg = getPackageJson();
  const help = `
${pkg.name} v${pkg.version}
${pkg.description}

USAGE:
  gemini-proxy [OPTIONS]

OPTIONS:
  -p, --port <PORT>           Server port (default: 3000, env: PORT)
  -H, --host <HOST>           Bind address (default: 0.0.0.0, env: HOST)
      --cors-origins <ORIGINS> CORS origins, comma-separated or * (env: CORS_ORIGINS)
  -w, --working-dir <DIR>     Working directory for Gemini CLI (default: cwd, env: WORKING_DIR)
      --include-thinking      Include reasoning in responses (env: INCLUDE_THINKING)
  -h, --help                  Show this help message
  -v, --version               Show version number

AUTHENTICATION:
  The server uses Gemini CLI authentication. Run 'gemini' first to authenticate.
  
  Alternatively, set one of these environment variables:
    GEMINI_API_KEY            Use Gemini API key
    GOOGLE_CLOUD_PROJECT      Use Vertex AI with GCP project

EXAMPLES:
  # Start with defaults
  gemini-proxy

  # Custom port and host
  gemini-proxy --port 8080 --host 127.0.0.1

  # Docker deployment
  gemini-proxy -p 3000 -H 0.0.0.0 --include-thinking

  # Using environment variables
  PORT=8080 HOST=127.0.0.1 gemini-proxy
`;
  // eslint-disable-next-line no-console
  console.log(help.trim());
}

export function printVersion(): void {
  const pkg = getPackageJson();
  // eslint-disable-next-line no-console
  console.log(pkg.version);
}

export function parseCliArgs(): CliOptions {
  const { values } = parseArgs({
    options: {
      port: {
        type: 'string',
        short: 'p',
      },
      host: {
        type: 'string',
        short: 'H',
      },
      'cors-origins': {
        type: 'string',
      },
      'working-dir': {
        type: 'string',
        short: 'w',
      },
      'include-thinking': {
        type: 'boolean',
      },
      help: {
        type: 'boolean',
        short: 'h',
      },
      version: {
        type: 'boolean',
        short: 'v',
      },
    },
    strict: true,
    allowPositionals: false,
  });

  // CLI flags > environment variables > defaults
  const port = values.port
    ? parseInt(values.port, 10)
    : parseInt(process.env['PORT'] ?? '3000', 10);

  const host = values.host ?? process.env['HOST'] ?? '0.0.0.0';

  const corsOrigins =
    values['cors-origins'] ?? process.env['CORS_ORIGINS'] ?? undefined;

  const workingDir =
    values['working-dir'] ?? process.env['WORKING_DIR'] ?? process.cwd();

  const includeThinking =
    values['include-thinking'] ??
    (process.env['INCLUDE_THINKING'] === 'true' ||
      process.env['INCLUDE_THINKING'] === '1');

  return {
    port,
    host,
    corsOrigins,
    workingDir,
    includeThinking,
    help: values.help ?? false,
    version: values.version ?? false,
  };
}
