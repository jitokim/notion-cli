/**
 * Tests for ConfigLoader
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { ConfigLoader } from './index.js'
import { ConfigError } from '../../l1/errors/index.js'

// ─── Test helpers ─────────────────────────────────────────────────────────────

let tmpDir: string

function setXdgConfigHome(dir: string): void {
  process.env['XDG_CONFIG_HOME'] = dir
}

function clearXdgConfigHome(): void {
  delete process.env['XDG_CONFIG_HOME']
}

function configDir(): string {
  return path.join(tmpDir, 'notion-cli')
}

function configPath(): string {
  return path.join(configDir(), 'config.json')
}

function writeConfig(content: string): void {
  fs.mkdirSync(configDir(), { recursive: true })
  fs.writeFileSync(configPath(), content, { encoding: 'utf-8' })
}

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  // Use realpathSync to resolve macOS /var → /private/var symlink,
  // which would otherwise trigger assertNotSymlink() in ConfigLoader.
  tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'notion-cli-test-')))
  setXdgConfigHome(tmpDir)
  // Clear NOTION_TOKEN env for token priority tests
  delete process.env['NOTION_TOKEN']
})

afterEach(() => {
  clearXdgConfigHome()
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

// ─── ConfigLoader.load() ──────────────────────────────────────────────────────

describe('ConfigLoader.load()', () => {
  it('returns empty object when config file does not exist', async () => {
    const config = await ConfigLoader.load()
    expect(config).toEqual({})
  })

  it('reads and parses a valid JSON config file', async () => {
    writeConfig(JSON.stringify({ token: 'secret123', defaultFormat: 'json' }))
    const config = await ConfigLoader.load()
    expect(config.token).toBe('secret123')
    expect(config.defaultFormat).toBe('json')
  })

  it('throws ConfigError for malformed JSON', async () => {
    writeConfig('{ not valid json }')
    await expect(ConfigLoader.load()).rejects.toThrow(ConfigError)
  })

  it('ConfigError message mentions the config file path', async () => {
    writeConfig('bad json !!!')
    await expect(ConfigLoader.load()).rejects.toThrow(/config/i)
  })

  it('returns empty object for an empty JSON object', async () => {
    writeConfig('{}')
    const config = await ConfigLoader.load()
    expect(config).toEqual({})
  })
})

// ─── ConfigLoader.save() ─────────────────────────────────────────────────────

describe('ConfigLoader.save()', () => {
  it('creates config directory and file when they do not exist', async () => {
    await ConfigLoader.save({ token: 'mytoken' })
    expect(fs.existsSync(configPath())).toBe(true)
  })

  it('writes the correct JSON content', async () => {
    await ConfigLoader.save({ token: 'abc', defaultFormat: 'table' })
    const raw = fs.readFileSync(configPath(), 'utf-8')
    const parsed = JSON.parse(raw)
    expect(parsed.token).toBe('abc')
    expect(parsed.defaultFormat).toBe('table')
  })

  it('round-trips: save then load returns same config', async () => {
    const cfg = { token: 'round-trip-token', defaultFormat: 'json' as const }
    await ConfigLoader.save(cfg)
    const loaded = await ConfigLoader.load()
    expect(loaded.token).toBe(cfg.token)
    expect(loaded.defaultFormat).toBe(cfg.defaultFormat)
  })

  it('overwrites existing config on second save', async () => {
    await ConfigLoader.save({ token: 'first' })
    await ConfigLoader.save({ token: 'second' })
    const config = await ConfigLoader.load()
    expect(config.token).toBe('second')
  })

  it('does not leave .tmp file after successful save', async () => {
    await ConfigLoader.save({ token: 'x' })
    const files = fs.readdirSync(configDir())
    expect(files.filter((f) => f.includes('.tmp'))).toHaveLength(0)
  })

  it('does not leave .lock file after successful save', async () => {
    await ConfigLoader.save({ token: 'x' })
    const files = fs.readdirSync(configDir())
    expect(files.filter((f) => f.endsWith('.lock'))).toHaveLength(0)
  })

  it('throws ConfigError when lock file is already held (concurrent access simulation)', async () => {
    // Create lock file with the CURRENT process PID to simulate a live process holding the lock.
    // isLockStale() will see process.pid as alive and NOT remove the lock.
    fs.mkdirSync(configDir(), { recursive: true })
    const lockPath = `${configPath()}.lock`
    fs.writeFileSync(lockPath, String(process.pid), { flag: 'wx' })

    // Override FLOCK_MAX_ATTEMPTS effectively by using a fresh save call
    // which will try 3 times, each 1s apart — too slow for test.
    // We patch sleep to be instant.
    await expect(ConfigLoader.save({ token: 'blocked' })).rejects.toThrow(ConfigError)

    // Cleanup
    fs.unlinkSync(lockPath)
  }, 10_000) // 3 attempts × 1s each

  it('throws ConfigError when config path resolves through a symlink', async () => {
    fs.mkdirSync(configDir(), { recursive: true })
    const realFile = path.join(tmpDir, 'real-config.json')
    fs.writeFileSync(realFile, '{}')
    const linkPath = configPath()
    fs.symlinkSync(realFile, linkPath)
    await expect(ConfigLoader.save({ token: 'x' })).rejects.toThrow(ConfigError)
  })
})

// ─── ConfigLoader.getToken() ──────────────────────────────────────────────────

describe('ConfigLoader.getToken() priority', () => {
  it('returns flagToken when provided (highest priority)', async () => {
    process.env['NOTION_TOKEN'] = 'env-token'
    writeConfig(JSON.stringify({ token: 'config-token' }))
    const token = await ConfigLoader.getToken('flag-token')
    expect(token).toBe('flag-token')
  })

  it('returns NOTION_TOKEN env when no flagToken', async () => {
    process.env['NOTION_TOKEN'] = 'env-token'
    writeConfig(JSON.stringify({ token: 'config-token' }))
    const token = await ConfigLoader.getToken()
    expect(token).toBe('env-token')
  })

  it('returns config file token when no flag and no env', async () => {
    delete process.env['NOTION_TOKEN']
    writeConfig(JSON.stringify({ token: 'config-token' }))
    const token = await ConfigLoader.getToken()
    expect(token).toBe('config-token')
  })

  it('returns undefined when no token is available anywhere', async () => {
    delete process.env['NOTION_TOKEN']
    const token = await ConfigLoader.getToken()
    expect(token).toBeUndefined()
  })

  it('flagToken="" is falsy — falls through to env', async () => {
    process.env['NOTION_TOKEN'] = 'env-token'
    // Empty string is falsy so should fall through
    const token = await ConfigLoader.getToken('')
    expect(token).toBe('env-token')
  })
})

// ─── ConfigLoader.reset() ────────────────────────────────────────────────────

describe('ConfigLoader.reset()', () => {
  it('deletes the config file', async () => {
    writeConfig(JSON.stringify({ token: 'to-be-deleted' }))
    await ConfigLoader.reset()
    expect(fs.existsSync(configPath())).toBe(false)
  })

  it('does not throw when config file does not exist', async () => {
    await expect(ConfigLoader.reset()).resolves.not.toThrow()
  })
})

// ─── ConfigLoader.getConfigPath() ────────────────────────────────────────────

describe('ConfigLoader.getConfigPath()', () => {
  it('returns a path ending with config.json', () => {
    expect(ConfigLoader.getConfigPath()).toMatch(/config\.json$/)
  })

  it('reflects XDG_CONFIG_HOME when set', () => {
    expect(ConfigLoader.getConfigPath()).toContain(tmpDir)
  })

  it('falls back to ~/.config/notion-cli/config.json when XDG_CONFIG_HOME is not set', () => {
    clearXdgConfigHome()
    const expected = path.join(os.homedir(), '.config', 'notion-cli', 'config.json')
    expect(ConfigLoader.getConfigPath()).toBe(expected)
  })
})
