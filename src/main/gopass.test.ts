import { describe, it, expect, vi, beforeEach } from 'vitest';
import { spawn } from 'child_process';
import {
  setGopassPath,
  getGopassPath,
  parseSecret,
  executeGopass,
  listSecrets,
  showSecret,
  insertSecret,
  deleteSecret,
  syncSecrets,
  generatePassword
} from './gopass';

// Mock child_process
vi.mock('child_process', () => {
  const mockSpawnFn = vi.fn();
  return {
    spawn: mockSpawnFn,
    default: {
      spawn: mockSpawnFn
    }
  };
});

describe('gopass CLI wrapper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setGopassPath('gopass');
  });

  describe('path settings', () => {
    it('should set and get custom gopass path', () => {
      setGopassPath('/custom/path/to/gopass');
      expect(getGopassPath()).toBe('/custom/path/to/gopass');
    });
  });

  describe('parseSecret', () => {
    it('should parse simple password only', () => {
      const output = 'mypassword123';
      const parsed = parseSecret(output);
      expect(parsed.password).toBe('mypassword123');
      expect(parsed.metadata).toEqual({});
      expect(parsed.rawBody).toBe('');
    });

    it('should parse password and simple metadata keys', () => {
      const output = 'secretpass\nusername: admin\nurl: https://example.com';
      const parsed = parseSecret(output);
      expect(parsed.password).toBe('secretpass');
      expect(parsed.metadata).toEqual({
        username: 'admin',
        url: 'https://example.com'
      });
      expect(parsed.rawBody).toBe('');
    });

    it('should parse password, metadata keys, and raw body lines', () => {
      const output = 'secretpass\nusername: admin\nport: 5432\nsome other custom comments\nline 2 of comments';
      const parsed = parseSecret(output);
      expect(parsed.password).toBe('secretpass');
      expect(parsed.metadata).toEqual({
        username: 'admin',
        port: '5432'
      });
      expect(parsed.rawBody).toBe('some other custom comments\nline 2 of comments');
    });
  });

  describe('executeGopass', () => {
    it('should resolve output on exit code 0', async () => {
      const mockChild = {
        stdout: { on: vi.fn((event, cb) => cb(Buffer.from('hello world'))) },
        stderr: { on: vi.fn() },
        on: vi.fn((event, cb) => {
          if (event === 'close') cb(0);
        }),
        stdin: { write: vi.fn(), end: vi.fn() }
      };
      vi.mocked(spawn).mockReturnValue(mockChild as any);

      const result = await executeGopass(['version']);
      expect(result).toBe('hello world');
      expect(spawn).toHaveBeenCalledWith('gopass', ['version'], expect.any(Object));
    });

    it('should reject on non-zero exit code', async () => {
      const mockChild = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn((event, cb) => cb(Buffer.from('failed to execute'))) },
        on: vi.fn((event, cb) => {
          if (event === 'close') cb(1);
        })
      };
      vi.mocked(spawn).mockReturnValue(mockChild as any);

      await expect(executeGopass(['show', 'invalid'])).rejects.toThrow('gopass exited with code 1. Error: failed to execute');
    });
  });

  describe('gopass command wrappers', () => {
    // Helper to mock successful spawn
    function mockSpawnSuccess(output: string) {
      const mockChild = {
        stdout: { on: vi.fn((event, cb) => cb(Buffer.from(output))) },
        stderr: { on: vi.fn() },
        on: vi.fn((event, cb) => {
          if (event === 'close') cb(0);
        }),
        stdin: { write: vi.fn(), end: vi.fn() }
      };
      vi.mocked(spawn).mockReturnValue(mockChild as any);
    }

    it('listSecrets should return array of paths', async () => {
      mockSpawnSuccess('path/to/sec1\npath/to/sec2\n');
      const list = await listSecrets();
      expect(list).toEqual(['path/to/sec1', 'path/to/sec2']);
      expect(spawn).toHaveBeenCalledWith('gopass', ['list', '--flat'], expect.any(Object));
    });

    it('showSecret should parse and return secret data', async () => {
      mockSpawnSuccess('pwd123\nusername: user1');
      const secret = await showSecret('my/path');
      expect(secret.password).toBe('pwd123');
      expect(secret.metadata).toEqual({ username: 'user1' });
      expect(spawn).toHaveBeenCalledWith('gopass', ['show', '--unsafe', '--noparsing', 'my/path'], expect.any(Object));
    });

    it('insertSecret should send formatted stdin', async () => {
      const mockStdinWrite = vi.fn();
      const mockStdinEnd = vi.fn();
      const mockChild = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn((event, cb) => {
          if (event === 'close') cb(0);
        }),
        stdin: { write: mockStdinWrite, end: mockStdinEnd }
      };
      vi.mocked(spawn).mockReturnValue(mockChild as any);

      await insertSecret('my/path', 'newpwd', { user: 'bob' }, 'some notes');
      expect(mockStdinWrite).toHaveBeenCalledWith('newpwd\nuser: bob\nsome notes');
      expect(spawn).toHaveBeenCalledWith('gopass', ['insert', '--force', 'my/path'], expect.any(Object));
    });

    it('deleteSecret should run rm command', async () => {
      mockSpawnSuccess('');
      await deleteSecret('my/path');
      expect(spawn).toHaveBeenCalledWith('gopass', ['rm', '--force', 'my/path'], expect.any(Object));
    });

    it('syncSecrets should run sync command', async () => {
      mockSpawnSuccess('');
      await syncSecrets();
      expect(spawn).toHaveBeenCalledWith('gopass', ['sync'], expect.any(Object));
    });

    it('generatePassword should run pwgen command', async () => {
      mockSpawnSuccess('random_generated_pwd');
      const pwd = await generatePassword(['20', '-n']);
      expect(pwd).toBe('random_generated_pwd');
      expect(spawn).toHaveBeenCalledWith('gopass', ['pwgen', '20', '-n'], expect.any(Object));
    });
  });
});
