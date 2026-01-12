/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { geminiToOpenAIStream } from './stream-adapter.js';
import {
  createContentEvent,
  createThoughtEvent,
  createToolCallEvent,
  arrayToAsyncGenerator,
} from '../__tests__/test-utils.js';

describe('geminiToOpenAIStream', () => {
  describe('content streaming', () => {
    it('converts content events to SSE chunks with delta.content', async () => {
      const events = [
        createContentEvent('Hello'),
        createContentEvent(' world'),
        createContentEvent('!'),
      ];

      const chunks: unknown[] = [];
      for await (const sse of geminiToOpenAIStream(
        arrayToAsyncGenerator(events),
        'gemini-2.5-flash',
      )) {
        chunks.push(sse.data);
      }

      // Should have: 3 content chunks + 1 final chunk + 1 [DONE]
      expect(chunks).toHaveLength(5);

      // First chunk should have role
      const firstChunk = chunks[0] as {
        choices: Array<{ delta: { role?: string; content?: string } }>;
      };
      expect(firstChunk.choices[0]?.delta.role).toBe('assistant');
      expect(firstChunk.choices[0]?.delta.content).toBe('Hello');

      // Subsequent chunks should have content only
      const secondChunk = chunks[1] as {
        choices: Array<{ delta: { content?: string } }>;
      };
      expect(secondChunk.choices[0]?.delta.content).toBe(' world');

      // Last data chunk should be [DONE]
      expect(chunks[4]).toBe('[DONE]');
    });

    it('emits final chunk with finish_reason stop', async () => {
      const events = [createContentEvent('Test')];

      const chunks: unknown[] = [];
      for await (const sse of geminiToOpenAIStream(
        arrayToAsyncGenerator(events),
        'gemini-2.5-flash',
      )) {
        chunks.push(sse.data);
      }

      // Penultimate chunk should have finish_reason: 'stop'
      const finalChunk = chunks[1] as {
        choices: Array<{ finish_reason: string | null }>;
      };
      expect(finalChunk.choices[0]?.finish_reason).toBe('stop');
    });

    it('includes correct metadata in chunks', async () => {
      const events = [createContentEvent('Test')];

      const chunks: unknown[] = [];
      for await (const sse of geminiToOpenAIStream(
        arrayToAsyncGenerator(events),
        'gemini-2.5-pro',
      )) {
        chunks.push(sse.data);
      }

      const chunk = chunks[0] as {
        id: string;
        object: string;
        model: string;
        created: number;
      };
      expect(chunk.id).toMatch(/^chatcmpl-/);
      expect(chunk.object).toBe('chat.completion.chunk');
      expect(chunk.model).toBe('gemini-2.5-pro');
      expect(chunk.created).toBeTypeOf('number');
    });
  });

  describe('thought/reasoning streaming', () => {
    it('includes reasoning_content when includeThinking is true', async () => {
      const events = [
        createThoughtEvent('Let me think...'),
        createContentEvent('The answer is 42'),
      ];

      const chunks: unknown[] = [];
      for await (const sse of geminiToOpenAIStream(
        arrayToAsyncGenerator(events),
        'gemini-2.5-flash',
        true, // includeThinking
      )) {
        chunks.push(sse.data);
      }

      const thoughtChunk = chunks[0] as {
        choices: Array<{ delta: { reasoning_content?: string } }>;
      };
      expect(thoughtChunk.choices[0]?.delta.reasoning_content).toBe(
        'Let me think...',
      );

      const contentChunk = chunks[1] as {
        choices: Array<{ delta: { content?: string } }>;
      };
      expect(contentChunk.choices[0]?.delta.content).toBe('The answer is 42');
    });

    it('excludes thought events when includeThinking is false', async () => {
      const events = [
        createThoughtEvent('Internal reasoning'),
        createContentEvent('Visible response'),
      ];

      const chunks: unknown[] = [];
      for await (const sse of geminiToOpenAIStream(
        arrayToAsyncGenerator(events),
        'gemini-2.5-flash',
        false, // includeThinking
      )) {
        chunks.push(sse.data);
      }

      // Should have: thought chunk (just role, first) + content chunk + final + [DONE]
      // Note: thought event produces a chunk with just role on first iteration
      expect(chunks).toHaveLength(4);

      // First chunk has just role (from thought event processing, but no reasoning_content)
      const firstChunk = chunks[0] as {
        choices: Array<{
          delta: {
            role?: string;
            content?: string;
            reasoning_content?: string;
          };
        }>;
      };
      expect(firstChunk.choices[0]?.delta.role).toBe('assistant');
      expect(firstChunk.choices[0]?.delta.reasoning_content).toBeUndefined();

      // Second chunk has the content
      const contentChunk = chunks[1] as {
        choices: Array<{
          delta: { content?: string; reasoning_content?: string };
        }>;
      };
      expect(contentChunk.choices[0]?.delta.content).toBe('Visible response');
      expect(contentChunk.choices[0]?.delta.reasoning_content).toBeUndefined();
    });
  });

  describe('tool call streaming', () => {
    it('converts tool_call_request events to delta.tool_calls', async () => {
      const events = [
        createToolCallEvent(
          'get_weather',
          { location: 'Paris' },
          'call_abc123',
        ),
      ];

      const chunks: unknown[] = [];
      for await (const sse of geminiToOpenAIStream(
        arrayToAsyncGenerator(events),
        'gemini-2.5-flash',
      )) {
        chunks.push(sse.data);
      }

      const toolChunk = chunks[0] as {
        choices: Array<{
          delta: {
            tool_calls?: Array<{
              id: string;
              type: string;
              function: { name: string; arguments: string };
            }>;
          };
        }>;
      };

      expect(toolChunk.choices[0]?.delta.tool_calls).toHaveLength(1);
      expect(toolChunk.choices[0]?.delta.tool_calls?.[0]).toEqual({
        index: 0,
        id: 'call_abc123',
        type: 'function',
        function: {
          name: 'get_weather',
          arguments: '{"location":"Paris"}',
        },
      });
    });

    it('serializes complex tool arguments to JSON', async () => {
      const complexArgs = {
        query: 'test',
        options: { limit: 10, offset: 0 },
        filters: ['active', 'public'],
      };
      const events = [createToolCallEvent('search', complexArgs)];

      const chunks: unknown[] = [];
      for await (const sse of geminiToOpenAIStream(
        arrayToAsyncGenerator(events),
        'gemini-2.5-flash',
      )) {
        chunks.push(sse.data);
      }

      const toolChunk = chunks[0] as {
        choices: Array<{
          delta: {
            tool_calls?: Array<{ function: { arguments: string } }>;
          };
        }>;
      };

      const argsJson =
        toolChunk.choices[0]?.delta.tool_calls?.[0]?.function.arguments;
      expect(JSON.parse(argsJson ?? '{}')).toEqual(complexArgs);
    });
  });

  describe('edge cases', () => {
    it('handles empty stream gracefully', async () => {
      const events: never[] = [];

      const chunks: unknown[] = [];
      for await (const sse of geminiToOpenAIStream(
        arrayToAsyncGenerator(events),
        'gemini-2.5-flash',
      )) {
        chunks.push(sse.data);
      }

      // Should only have final chunk + [DONE]
      expect(chunks).toHaveLength(2);
      expect(chunks[1]).toBe('[DONE]');
    });

    it('maintains consistent id across all chunks', async () => {
      const events = [
        createContentEvent('First'),
        createContentEvent('Second'),
      ];

      const ids = new Set<string>();
      for await (const sse of geminiToOpenAIStream(
        arrayToAsyncGenerator(events),
        'gemini-2.5-flash',
      )) {
        if (typeof sse.data === 'object' && 'id' in sse.data) {
          ids.add((sse.data as { id: string }).id);
        }
      }

      // All chunks should share the same id
      expect(ids.size).toBe(1);
    });
  });
});
