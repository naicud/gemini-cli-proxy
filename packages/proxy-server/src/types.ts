/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export interface ServerConfig {
  readonly port: number;
  readonly host: string;
  readonly workingDirectory: string;
}

export interface StreamEvent {
  readonly id?: string;
  readonly event?: string;
  readonly data: unknown;
  readonly retry?: number;
}

export interface CliOptions {
  readonly port: number;
  readonly host: string;
  readonly corsOrigins: string | undefined;
  readonly workingDir: string;
  readonly includeThinking: boolean;
  readonly help: boolean;
  readonly version: boolean;
}
