/**
 * L0: ConfigLoader
 * XDG-compliant configuration file manager.
 * - atomic write: .tmp → chmod 600 → rename
 * - Rejects symlink chains for security.
 * - File locking: 1s timeout × 3 retries.
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { ConfigError } from '../../l1/errors/index.js'
import { logger } from '../logger/index.js'

const CONFIG_DIR_NAME = 'notion-cli'
const CONFIG_FILE_NAME = 'config.json'
const CONFIG_DIR_MODE = 0o700
const CONFIG_FILE_MODE = 0o600
const FLOCK_MAX_ATTEMPTS = 3
const FLOCK_RETRY_DELAY_MS = 1000

export interface NotionCliConfig {
  token?: string
  defaultFormat?: 'table' | 'json' | 'markdown'
  [key: string]: unknown
}

function getConfigDir(): string {
  const xdgConfigHome = process.env['XDG_CONFIG_HOME']
  const baseDir = xdgConfigHome ?? path.join(os.homedir(), '.config')
  return path.join(baseDir, CONFIG_DIR_NAME)
}

function getConfigFilePath(): string {
  return path.join(getConfigDir(), CONFIG_FILE_NAME)
}

/**
 * Detects and rejects symlink chains.
 * A path is considered a symlink if its real path differs from the computed absolute path.
 */
function assertNotSymlink(filePath: string): void {
  try {
    const realPath = fs.realpathSync(filePath)
    const absolutePath = path.resolve(filePath)
    if (realPath !== absolutePath) {
      throw new ConfigError(
        `Security: config path resolves through a symlink. ` +
          `Expected: ${absolutePath}, Got: ${realPath}`
      )
    }
  } catch (error) {
    if (error instanceof ConfigError) throw error
    // File does not exist yet — OK, will be created
  }
}

async function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

/** Checks whether the .lock file references a PID that is no longer running. */
function isLockStale(lockPath: string): boolean {
  try {
    const pidStr = fs.readFileSync(lockPath, 'utf-8').trim()
    const pid = Number(pidStr)
    if (!Number.isInteger(pid) || pid <= 0) return true
    // process.kill(pid, 0) throws if the process does not exist
    process.kill(pid, 0)
    return false // process is still alive
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ESRCH') return true   // process does not exist → stale
    if (code === 'EPERM') return false  // process exists but not owned by us
    return true // lock file unreadable → treat as stale
  }
}

export class ConfigLoader {
  /**
   * Loads the configuration file.
   * Returns an empty config if the file does not exist.
   */
  static async load(): Promise<NotionCliConfig> {
    const configPath = getConfigFilePath()

    if (!fs.existsSync(configPath)) {
      logger.debug({ configPath }, 'Config file not found, using empty config')
      return {}
    }

    assertNotSymlink(configPath)

    try {
      const raw = fs.readFileSync(configPath, 'utf-8')
      const parsed = JSON.parse(raw) as NotionCliConfig
      logger.debug({ configPath }, 'Config loaded')
      return parsed
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new ConfigError(`Config file is corrupted (invalid JSON): ${configPath}`)
      }
      throw new ConfigError(`Failed to read config: ${String(error)}`)
    }
  }

  /**
   * Saves the configuration to disk.
   * Uses atomic write (tmp + rename) to prevent data loss.
   */
  static async save(config: NotionCliConfig): Promise<void> {
    const configDir = getConfigDir()
    const configPath = getConfigFilePath()

    // Create directory if it does not exist
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true, mode: CONFIG_DIR_MODE })
    } else {
      // Verify and fix existing directory permissions
      try {
        fs.chmodSync(configDir, CONFIG_DIR_MODE)
      } catch {
        // Permission change failure is non-fatal (read still works)
        logger.warn({ configDir }, 'Could not set directory permissions to 700')
      }
    }

    assertNotSymlink(configPath)

    const tmpPath = `${configPath}.tmp.${process.pid}`
    let acquired = false

    // flock simulation: exclusive lock via .lock file
    const lockPath = `${configPath}.lock`

    for (let attempt = 1; attempt <= FLOCK_MAX_ATTEMPTS; attempt++) {
      try {
        // O_EXCL: fails if already exists (atomic lock)
        fs.writeFileSync(lockPath, String(process.pid), { flag: 'wx' })
        acquired = true
        break
      } catch {
        // Check for stale lock: if the PID in the lock file is no longer alive, remove it
        if (isLockStale(lockPath)) {
          logger.debug({ lockPath }, 'Stale lock detected, removing')
          try { fs.unlinkSync(lockPath) } catch { /* ignore */ }
          // Retry this attempt
          try {
            fs.writeFileSync(lockPath, String(process.pid), { flag: 'wx' })
            acquired = true
            break
          } catch { /* fall through to retry delay */ }
        }
        if (attempt === FLOCK_MAX_ATTEMPTS) {
          throw new ConfigError(
            `Could not acquire config lock after ${FLOCK_MAX_ATTEMPTS} attempts. ` +
              `Another process may be writing. Remove: ${lockPath}`
          )
        }
        logger.debug({ attempt, lockPath }, 'Config lock busy, retrying...')
        await sleep(FLOCK_RETRY_DELAY_MS)
      }
    }

    try {
      // atomic write: .tmp → chmod → rename
      const content = JSON.stringify(config, null, 2)
      fs.writeFileSync(tmpPath, content, { encoding: 'utf-8', mode: CONFIG_FILE_MODE })
      fs.renameSync(tmpPath, configPath)
      logger.debug({ configPath }, 'Config saved')
    } catch (error) {
      // Clean up .tmp on failure
      try {
        if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath)
      } catch {
        // Ignore cleanup failure
      }
      throw new ConfigError(`Failed to write config: ${String(error)}`)
    } finally {
      if (acquired) {
        try {
          fs.unlinkSync(lockPath)
        } catch {
          logger.warn({ lockPath }, 'Could not remove config lock file')
        }
      }
    }
  }

  /**
   * Resolves the authentication token by priority.
   * Priority: --token flag > NOTION_TOKEN env var > config.json file.
   */
  static async getToken(flagToken?: string): Promise<string | undefined> {
    if (flagToken) return flagToken

    const envToken = process.env['NOTION_TOKEN']
    if (envToken) return envToken

    const config = await ConfigLoader.load()
    return config.token
  }

  /**
   * Resets configuration by deleting the config file.
   */
  static async reset(): Promise<void> {
    const configPath = getConfigFilePath()

    if (!fs.existsSync(configPath)) {
      return
    }

    assertNotSymlink(configPath)

    try {
      fs.unlinkSync(configPath)
      logger.debug({ configPath }, 'Config reset')
    } catch (error) {
      throw new ConfigError(`Failed to reset config: ${String(error)}`)
    }
  }

  /**
   * Returns the path to the configuration file.
   */
  static getConfigPath(): string {
    return getConfigFilePath()
  }
}
