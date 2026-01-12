/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { FastifyInstance, FastifyError, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';

/**
 * OpenAI-compatible error response structure.
 */
interface OpenAIErrorResponse {
  readonly error: {
    readonly message: string;
    readonly type: string;
    readonly code: string;
  };
}

/**
 * Maps HTTP status codes to OpenAI error types and codes.
 */
function mapStatusToErrorType(status: number): { type: string; code: string } {
  if (status === 400) {
    return { type: 'invalid_request_error', code: 'bad_request' };
  }
  if (status === 401) {
    return { type: 'authentication_error', code: 'invalid_api_key' };
  }
  if (status === 403) {
    return { type: 'permission_error', code: 'insufficient_permissions' };
  }
  if (status === 404) {
    return { type: 'invalid_request_error', code: 'model_not_found' };
  }
  if (status === 429) {
    return { type: 'rate_limit_error', code: 'rate_limit_exceeded' };
  }
  if (status >= 500) {
    return { type: 'api_error', code: 'server_error' };
  }
  return { type: 'api_error', code: 'internal_error' };
}

/**
 * Represents extracted error information from various error types.
 */
interface ExtractedError {
  readonly status: number;
  readonly message: string;
}

/**
 * Extracts status and message from Gaxios-style errors (Google API client).
 * Handles both direct status and nested response.status patterns.
 */
function extractGaxiosError(error: unknown): ExtractedError | null {
  if (typeof error !== 'object' || error === null) {
    return null;
  }

  const err = error as {
    status?: number;
    message?: string;
    response?: {
      status?: number;
      statusText?: string;
      data?: string | { error?: { message?: string; status?: string } };
    };
  };

  let status: number | undefined;
  let message: string | undefined;

  // Extract status - prefer direct status, fall back to response.status
  if (typeof err.status === 'number') {
    status = err.status;
  } else if (typeof err.response?.status === 'number') {
    status = err.response.status;
  }

  // If no status found, this isn't a Gaxios error
  if (status === undefined) {
    return null;
  }

  // Extract message - try response.data first, then error.message
  if (err.response?.data) {
    const data = err.response.data;
    if (typeof data === 'string') {
      try {
        const parsed = JSON.parse(data) as {
          error?: { message?: string };
          message?: string;
        };
        message = parsed.error?.message ?? parsed.message;
      } catch {
        message = data;
      }
    } else if (typeof data === 'object') {
      message = data.error?.message;
    }
  }

  // Fall back to error message or status text
  if (!message) {
    message = err.message ?? err.response?.statusText ?? `HTTP ${status} error`;
  }

  return { status, message };
}

/**
 * Checks if the error response is already in OpenAI format.
 */
function isOpenAIErrorFormat(obj: unknown): boolean {
  if (typeof obj !== 'object' || obj === null) {
    return false;
  }
  const response = obj as { error?: { message?: unknown; type?: unknown } };
  return (
    typeof response.error === 'object' &&
    response.error !== null &&
    typeof response.error.message === 'string' &&
    typeof response.error.type === 'string'
  );
}

/**
 * Creates an OpenAI-compatible error response.
 */
function createOpenAIError(
  status: number,
  message: string,
): OpenAIErrorResponse {
  const { type, code } = mapStatusToErrorType(status);
  return {
    error: {
      message,
      type,
      code,
    },
  };
}

/**
 * Global error handler plugin that transforms all errors to OpenAI-compatible format.
 *
 * Handles:
 * - Fastify validation errors (FST_ERR_VALIDATION)
 * - Gaxios errors from Google API client
 * - Generic application errors
 */
async function errorHandlerPluginHandler(
  fastify: FastifyInstance,
): Promise<void> {
  fastify.setErrorHandler(
    (error: FastifyError, _request, reply: FastifyReply) => {
      fastify.log.error(error, 'Error caught by global handler');

      // Check if this is a Fastify validation error
      if (error.code === 'FST_ERR_VALIDATION') {
        const status = error.statusCode ?? 400;
        return reply
          .status(status)
          .send(createOpenAIError(status, error.message));
      }

      // Try to extract Gaxios error info
      const gaxiosError = extractGaxiosError(error);
      if (gaxiosError) {
        return reply
          .status(gaxiosError.status)
          .send(createOpenAIError(gaxiosError.status, gaxiosError.message));
      }

      // Handle errors that already have a statusCode (Fastify-style)
      const statusCode = error.statusCode ?? 500;
      const message = error.message || 'Internal server error';

      return reply
        .status(statusCode)
        .send(createOpenAIError(statusCode, message));
    },
  );
}

export const errorHandlerPlugin = fp(errorHandlerPluginHandler, {
  name: 'error-handler-plugin',
  fastify: '5.x',
});

// Export utilities for testing
export {
  mapStatusToErrorType,
  extractGaxiosError,
  createOpenAIError,
  isOpenAIErrorFormat,
};
export type { OpenAIErrorResponse, ExtractedError };
