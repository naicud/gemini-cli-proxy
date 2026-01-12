/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  GeminiClient} from '@google/gemini-cli-core';
import {
  Config,
  AuthType,
  createContentGenerator,
  createContentGeneratorConfig,
  ApprovalMode,
} from '@google/gemini-cli-core';
import { v4 as uuid } from 'uuid';

interface SessionEntry {
  readonly id: string;
  readonly client: GeminiClient;
  readonly config: Config;
  readonly createdAt: Date;
}

interface CreateSessionOptions {
  readonly model?: string;
  readonly authType?: AuthType;
  readonly workingDirectory?: string;
}

export class SessionManager {
  private readonly sessions = new Map<string, SessionEntry>();

  async getOrCreate(options: CreateSessionOptions = {}): Promise<SessionEntry> {
    const sessionId = uuid();
    const workingDirectory = options.workingDirectory ?? process.cwd();

    // Determine auth type from environment or options
    const authType = this.resolveAuthType(options.authType);

    // Create minimal config for proxy use
    const config = new Config({
      sessionId,
      targetDir: workingDirectory,
      debugMode: false,
      cwd: workingDirectory,
      model: options.model ?? 'gemini-2.5-flash',
      approvalMode: ApprovalMode.YOLO, // Auto-approve all tools for API
    });

    // Create content generator using core's auth system
    const contentGenConfig = await createContentGeneratorConfig(
      config,
      authType,
    );
    await createContentGenerator(contentGenConfig, config);

    // Initialize config (this sets up tools, clients, etc.)
    await config.initialize();

    const session: SessionEntry = {
      id: sessionId,
      client: config.getGeminiClient(),
      config,
      createdAt: new Date(),
    };

    this.sessions.set(sessionId, session);
    return session;
  }

  get(sessionId: string): SessionEntry | undefined {
    return this.sessions.get(sessionId);
  }

  delete(sessionId: string): boolean {
    return this.sessions.delete(sessionId);
  }

  private resolveAuthType(authType?: AuthType): AuthType {
    if (authType) {
      return authType;
    }

    // Check for API key in environment
    if (process.env['GEMINI_API_KEY']) {
      return AuthType.USE_GEMINI;
    }

    if (process.env['GOOGLE_CLOUD_PROJECT']) {
      return AuthType.USE_VERTEX_AI;
    }

    // Default to Google login
    return AuthType.LOGIN_WITH_GOOGLE;
  }
}
