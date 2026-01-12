/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { FastifyPluginAsync } from 'fastify';
import type OpenAI from 'openai';

type Model = OpenAI.Model;

const AVAILABLE_MODELS: readonly Model[] = [
  {
    id: 'gemini-2.5-pro',
    object: 'model',
    created: Date.now(),
    owned_by: 'google',
  },
  {
    id: 'gemini-2.5-flash',
    object: 'model',
    created: Date.now(),
    owned_by: 'google',
  },
  {
    id: 'gemini-2.5-flash-lite',
    object: 'model',
    created: Date.now(),
    owned_by: 'google',
  },
  {
    id: 'gemini-3-pro-preview',
    object: 'model',
    created: Date.now(),
    owned_by: 'google',
  },
  {
    id: 'gemini-3-flash-preview',
    object: 'model',
    created: Date.now(),
    owned_by: 'google',
  },
  {
    id: 'auto',
    object: 'model',
    created: Date.now(),
    owned_by: 'google',
  },
];

export const modelsRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get('/v1/models', async (_request, reply) => reply.send({
      object: 'list',
      data: AVAILABLE_MODELS,
    }));

  fastify.get<{ Params: { model: string } }>(
    '/v1/models/:model',
    async (request, reply) => {
      const { model } = request.params;
      const foundModel = AVAILABLE_MODELS.find((m) => m.id === model);

      if (!foundModel) {
        return reply.status(404).send({
          error: {
            message: `Model '${model}' not found`,
            type: 'invalid_request_error',
            code: 'model_not_found',
          },
        });
      }

      return reply.send(foundModel);
    },
  );
};
