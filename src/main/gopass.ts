import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export interface SecretData {
  password: string;
  metadata: Record<string, string>;
  rawBody: string;
}

let configuredGopassPath = 'gopass';

export function setGopassPath(exePath: string) {
  configuredGopassPath = exePath;
}

export function getGopassPath(): string {
  return configuredGopassPath;
}

/**
 * Execute gopass process and return output
 */
export function executeGopass(args: string[], stdinData?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const processPath = getGopassPath();
    // Force non-interactive by setting env variables
    const env = { ...process.env, GOPASS_NO_COLOR: 'true', GOPASS_NON_INTERACTIVE: 'true' };
    const child = spawn(processPath, args, { env, shell: true });

    let stdout = '';
    let stderr = '';

    if (stdinData && child.stdin) {
      child.stdin.write(stdinData);
      child.stdin.end();
    }

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`gopass exited with code ${code}. Error: ${stderr.trim() || stdout.trim()}`));
      }
    });

    child.on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Lists all secrets flat
 */
export async function listSecrets(): Promise<string[]> {
  try {
    const output = await executeGopass(['list', '--flat']);
    return output
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line.length > 0);
  } catch (err) {
    console.error('Error listing secrets:', err);
    throw err;
  }
}

/**
 * Parse the raw secret output from gopass
 */
export function parseSecret(rawOutput: string): SecretData {
  const lines = rawOutput.split(/\r?\n/);
  const password = lines[0] || '';
  const metadata: Record<string, string> = {};
  const remainingLines: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;

    // Check if line matches "key: value" pattern
    const colonIndex = line.indexOf(':');
    if (colonIndex > 0 && colonIndex < line.length - 1) {
      const key = line.substring(0, colonIndex).trim();
      const value = line.substring(colonIndex + 1).trim();
      // Ensure key looks like a valid variable name (no spaces, alphanumeric/dash/underscore)
      if (/^[a-zA-Z0-9_\-]+$/.test(key)) {
        metadata[key] = value;
        continue;
      }
    }
    remainingLines.push(line);
  }

  return {
    password,
    metadata,
    rawBody: remainingLines.join('\n')
  };
}

/**
 * Retrieves a single secret
 */
export async function showSecret(secretPath: string): Promise<SecretData> {
  // Use --unsafe/--force to get actual password content without prompting
  const output = await executeGopass(['show', '--unsafe', '--noparsing', secretPath]);
  return parseSecret(output);
}

/**
 * Inserts or updates a secret
 */
export async function insertSecret(
  secretPath: string,
  password: string,
  metadata: Record<string, string> = {},
  rawBody = ''
): Promise<void> {
  let stdinData = password;

  // Append metadata keys and values
  for (const [key, value] of Object.entries(metadata)) {
    if (key.trim()) {
      stdinData += `\n${key.trim()}: ${value}`;
    }
  }

  if (rawBody.trim()) {
    stdinData += `\n${rawBody.trim()}`;
  }

  // Use insert --force to avoid confirmation prompts
  await executeGopass(['insert', '--force', secretPath], stdinData);
}

/**
 * Deletes a secret
 */
export async function deleteSecret(secretPath: string): Promise<void> {
  await executeGopass(['rm', '--force', secretPath]);
}

/**
 * Syncs the secret store
 */
export async function syncSecrets(): Promise<void> {
  await executeGopass(['sync']);
}

/**
 * Generates a random one-time password
 */
export async function generatePassword(args: string[]): Promise<string> {
  const output = await executeGopass(['pwgen', ...args]);
  return output.trim();
}
