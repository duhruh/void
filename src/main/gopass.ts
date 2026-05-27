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

function quoteArgIfNeeded(arg: string): string {
  if (arg.startsWith('-')) return arg;
  if (arg === '' || /[\s"'&|<>\(\)\^%!#\*]/.test(arg)) {
    return `"${arg.replace(/"/g, '\\"')}"`;
  }
  return arg;
}

/**
 * Execute gopass process and return output
 */
export function executeGopass(args: string[], stdinData?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const processPath = getGopassPath();
    // Force non-interactive by setting env variables
    const env = { ...process.env, GOPASS_NO_COLOR: 'true', GOPASS_NON_INTERACTIVE: 'true' };
    const quotedArgs = args.map(quoteArgIfNeeded);
    const child = spawn(processPath, quotedArgs, { env, shell: true });

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
  try {
    // Use --unsafe/--force to get actual password content without prompting
    const output = await executeGopass(['show', '--unsafe', '--noparsing', secretPath]);
    return parseSecret(output);
  } catch (err: any) {
    const errMsg = err.message || '';
    const isBinaryError = errMsg.toLowerCase().includes('binary') || 
                          errMsg.toLowerCase().includes('fscopy') || 
                          errMsg.toLowerCase().includes('cat');
    
    const ext = path.extname(secretPath).toLowerCase();
    const isBinaryExt = ['.png', '.jpg', '.jpeg', '.gif', '.pdf', '.zip', '.tar', '.gz', '.dmg', '.exe', '.bin', '.tar.gz'].includes(ext);
    
    if (isBinaryError || isBinaryExt) {
      const filename = path.basename(secretPath);
      let mimeType = 'application/octet-stream';
      if (ext === '.png') mimeType = 'image/png';
      else if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
      else if (ext === '.gif') mimeType = 'image/gif';
      else if (ext === '.pdf') mimeType = 'application/pdf';
      else if (ext === '.txt' || ext === '.log') mimeType = 'text/plain';

      return {
        password: '[Void Secure File]',
        metadata: {
          'Content-Disposition': `attachment; filename="${filename}"`,
          'mimeType': mimeType,
          'filename': filename,
        },
        rawBody: '',
      };
    }
    throw err;
  }
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

export interface MountInfo {
  alias: string;
  path: string;
  isRoot: boolean;
}

/**
 * Execute gopass process and return raw stdout buffer
 */
export function executeGopassBinary(args: string[], stdinData?: string | Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const processPath = getGopassPath();
    const env = { ...process.env, GOPASS_NO_COLOR: 'true', GOPASS_NON_INTERACTIVE: 'true' };
    const quotedArgs = args.map(quoteArgIfNeeded);
    const child = spawn(processPath, quotedArgs, { env, shell: true });

    let chunks: Buffer[] = [];
    let stderr = '';

    if (child.stdin) {
      if (stdinData) {
        child.stdin.write(stdinData);
      }
      child.stdin.end();
    }

    child.stdout.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve(Buffer.concat(chunks));
      } else {
        reject(new Error(`gopass exited with code ${code}. Error: ${stderr.trim()}`));
      }
    });

    child.on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Retrieve mounts list
 */
export async function listMounts(): Promise<MountInfo[]> {
  const mounts: MountInfo[] = [];

  // Get root path from gopass config mounts.path
  let rootPath = '';
  try {
    const configOut = await executeGopass(['config']);
    const pathLine = configOut.split(/\r?\n/).find(l => l.startsWith('mounts.path = '));
    if (pathLine) {
      rootPath = pathLine.replace('mounts.path = ', '').trim();
    }
  } catch (err) {
    console.error('Failed to get root store path:', err);
  }

  mounts.push({
    alias: 'root',
    path: rootPath || path.join(process.env.HOME || process.env.USERPROFILE || '', '.password-store'),
    isRoot: true,
  });

  // Parse other mounts
  try {
    const mountsOut = await executeGopass(['mounts']);
    if (mountsOut.trim() !== 'No mounts') {
      const lines = mountsOut.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      for (const line of lines) {
        // Skip root if it's printed as first line (if any)
        if (!line.includes('├──') && !line.includes('└──') && !line.includes('│')) {
          continue;
        }
        // Extract alias and path
        const clean = line.replace(/[├└│─\s\-]/g, ' ').trim();
        const match = clean.match(/^([^(]+)\s+\(([^)]+)\)$/);
        if (match) {
          mounts.push({
            alias: match[1].trim(),
            path: match[2].trim(),
            isRoot: false,
          });
        }
      }
    }
  } catch (err) {
    console.error('Failed to list mounts:', err);
  }

  return mounts;
}

/**
 * Add a new mount store
 */
export async function addMount(alias: string, storePath: string): Promise<void> {
  await executeGopass(['mounts', 'add', alias, storePath]);
}

/**
 * Remove a mount store
 */
export async function removeMount(alias: string): Promise<void> {
  await executeGopass(['mounts', 'remove', alias]);
}
