/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { openaiToGemini } from './message-converter.js';
import type OpenAI from 'openai';

type ChatCompletionMessageParam = OpenAI.ChatCompletionMessageParam;

describe('openaiToGemini', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('text messages', () => {
    it('converts a simple user text message', async () => {
      const messages: ChatCompletionMessageParam[] = [
        { role: 'user', content: 'Hello, world!' },
      ];

      const result = await openaiToGemini(messages);

      expect(result.systemInstruction).toBeUndefined();
      expect(result.contents).toHaveLength(1);
      expect(result.contents[0]).toEqual({
        role: 'user',
        parts: [{ text: 'Hello, world!' }],
      });
    });

    it('extracts system instruction from system message', async () => {
      const messages: ChatCompletionMessageParam[] = [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Hi!' },
      ];

      const result = await openaiToGemini(messages);

      expect(result.systemInstruction).toBe('You are a helpful assistant.');
      expect(result.contents).toHaveLength(1);
      expect(result.contents[0]?.role).toBe('user');
    });

    it('converts assistant text message to model role', async () => {
      const messages: ChatCompletionMessageParam[] = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
      ];

      const result = await openaiToGemini(messages);

      expect(result.contents).toHaveLength(2);
      expect(result.contents[1]).toEqual({
        role: 'model',
        parts: [{ text: 'Hi there!' }],
      });
    });
  });

  describe('multipart content', () => {
    it('converts text content array', async () => {
      const messages: ChatCompletionMessageParam[] = [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Describe this:' },
            { type: 'text', text: 'More context' },
          ],
        },
      ];

      const result = await openaiToGemini(messages);

      expect(result.contents[0]?.parts).toHaveLength(2);
      expect(result.contents[0].parts![0]).toEqual({ text: 'Describe this:' });
      expect(result.contents[0].parts![1]).toEqual({ text: 'More context' });
    });

    it('converts base64 image data URL to inlineData', async () => {
      const base64Data =
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      const messages: ChatCompletionMessageParam[] = [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'What is this?' },
            {
              type: 'image_url',
              image_url: { url: `data:image/png;base64,${base64Data}` },
            },
          ],
        },
      ];

      const result = await openaiToGemini(messages);

      expect(result.contents[0]?.parts).toHaveLength(2);
      expect(result.contents[0].parts![1]).toEqual({
        inlineData: {
          mimeType: 'image/png',
          data: base64Data,
        },
      });
    });

    it('fetches HTTP image URL and converts to base64', async () => {
      const mockImageData = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
      const mockResponse = {
        ok: true,
        arrayBuffer: vi.fn().mockResolvedValue(mockImageData.buffer),
        headers: new Map([['content-type', 'image/png']]),
      };
      const headersObj = {
        get: (key: string) => (key === 'content-type' ? 'image/png' : null),
      };
      Object.assign(mockResponse, { headers: headersObj });

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

      const messages: ChatCompletionMessageParam[] = [
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: 'https://example.com/image.png' },
            },
          ],
        },
      ];

      const result = await openaiToGemini(messages);

      expect(fetch).toHaveBeenCalledWith('https://example.com/image.png');
      expect(result.contents[0].parts![0]).toEqual({
        inlineData: {
          mimeType: 'image/png',
          data: Buffer.from(mockImageData).toString('base64'),
        },
      });

      vi.unstubAllGlobals();
    });
  });

  describe('tool calls', () => {
    it('converts assistant message with tool_calls to functionCall parts', async () => {
      const messages: ChatCompletionMessageParam[] = [
        { role: 'user', content: 'Get the weather' },
        {
          role: 'assistant',
          content: null,
          tool_calls: [
            {
              id: 'call_123',
              type: 'function',
              function: {
                name: 'get_weather',
                arguments: '{"location":"Paris"}',
              },
            },
          ],
        },
      ];

      const result = await openaiToGemini(messages);

      expect(result.contents[1]?.role).toBe('model');
      expect(result.contents[1]?.parts).toContainEqual({
        functionCall: {
          name: 'get_weather',
          args: { location: 'Paris' },
        },
      });
    });

    it('converts tool response message to functionResponse', async () => {
      const messages: ChatCompletionMessageParam[] = [
        {
          role: 'tool',
          tool_call_id: 'get_weather',
          content: '{"temperature": 20, "unit": "celsius"}',
        },
      ];

      const result = await openaiToGemini(messages);

      expect(result.contents[0]).toEqual({
        role: 'user',
        parts: [
          {
            functionResponse: {
              name: 'get_weather',
              response: { result: '{"temperature": 20, "unit": "celsius"}' },
            },
          },
        ],
      });
    });

    it('handles assistant message with both content and tool_calls', async () => {
      const messages: ChatCompletionMessageParam[] = [
        {
          role: 'assistant',
          content: 'Let me check the weather for you.',
          tool_calls: [
            {
              id: 'call_456',
              type: 'function',
              function: {
                name: 'get_weather',
                arguments: '{"location":"London"}',
              },
            },
          ],
        },
      ];

      const result = await openaiToGemini(messages);

      expect(result.contents[0]?.parts).toHaveLength(2);
      expect(result.contents[0].parts![0]).toEqual({
        text: 'Let me check the weather for you.',
      });
      expect(result.contents[0].parts![1]).toEqual({
        functionCall: {
          name: 'get_weather',
          args: { location: 'London' },
        },
      });
    });
  });

  describe('edge cases', () => {
    it('handles empty messages array', async () => {
      const result = await openaiToGemini([]);

      expect(result.systemInstruction).toBeUndefined();
      expect(result.contents).toHaveLength(0);
    });

    it('handles null/undefined content gracefully', async () => {
      const messages: ChatCompletionMessageParam[] = [
        { role: 'user', content: '' },
      ];

      const result = await openaiToGemini(messages);

      expect(result.contents).toHaveLength(0);
    });

    it('handles multiple system messages (uses last one)', async () => {
      const messages: ChatCompletionMessageParam[] = [
        { role: 'system', content: 'First instruction' },
        { role: 'system', content: 'Second instruction' },
        { role: 'user', content: 'Hi' },
      ];

      const result = await openaiToGemini(messages);

      expect(result.systemInstruction).toBe('Second instruction');
    });
  });
});
