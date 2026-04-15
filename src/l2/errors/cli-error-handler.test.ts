/**
 * Tests for handleError() CLI error handler
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  AuthenticationError,
  NotFoundError,
  RateLimitError,
  NetworkError,
  ValidationError,
  CursorExpiredError,
  ConfigError,
  ApiError,
  UnexpectedError,
  PermissionError,
  TimeoutError,
} from '../../l1/errors/index.js'
import { handleError } from './cli-error-handler.js'

// ─── Setup ────────────────────────────────────────────────────────────────────

let stderrOutput: string
let exitCode: number | undefined

beforeEach(() => {
  stderrOutput = ''
  exitCode = undefined

  vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
    stderrOutput += String(chunk)
    return true
  })
  vi.spyOn(process, 'exit').mockImplementation((code) => {
    exitCode = code as number
    // Simulate process.exit by throwing so handleError() never returns
    throw new Error(`process.exit(${code})`)
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

function callHandleError(error: unknown): void {
  try {
    handleError(error)
  } catch {
    // swallow the thrown "process.exit(N)" simulated exception
  }
}

// ─── DomainException → exitCode + stderr ────────────────────────────────────

describe('handleError: DomainException errors', () => {
  it('exits with the error exitCode for AuthenticationError', () => {
    callHandleError(new AuthenticationError())
    expect(exitCode).toBe(2)
  })

  it('exits with exitCode 2 for PermissionError', () => {
    callHandleError(new PermissionError())
    expect(exitCode).toBe(2)
  })

  it('exits with exitCode 3 for NotFoundError', () => {
    callHandleError(new NotFoundError())
    expect(exitCode).toBe(3)
  })

  it('exits with exitCode 4 for RateLimitError', () => {
    callHandleError(new RateLimitError())
    expect(exitCode).toBe(4)
  })

  it('exits with exitCode 5 for NetworkError', () => {
    callHandleError(new NetworkError())
    expect(exitCode).toBe(5)
  })

  it('exits with exitCode 5 for TimeoutError', () => {
    callHandleError(new TimeoutError())
    expect(exitCode).toBe(5)
  })

  it('exits with exitCode 6 for ValidationError', () => {
    callHandleError(new ValidationError('bad input'))
    expect(exitCode).toBe(6)
  })

  it('exits with exitCode 6 for CursorExpiredError', () => {
    callHandleError(new CursorExpiredError())
    expect(exitCode).toBe(6)
  })

  it('exits with exitCode 7 for ApiError', () => {
    callHandleError(new ApiError('server error', 500))
    expect(exitCode).toBe(7)
  })

  it('exits with exitCode 8 for ConfigError', () => {
    callHandleError(new ConfigError('config broken'))
    expect(exitCode).toBe(8)
  })

  it('exits with exitCode 1 for UnexpectedError', () => {
    callHandleError(new UnexpectedError('oops'))
    expect(exitCode).toBe(1)
  })
})

// ─── stderr output format ────────────────────────────────────────────────────

describe('handleError: stderr output content', () => {
  it('writes "Error [N]: message" to stderr', () => {
    callHandleError(new NotFoundError('page not found'))
    expect(stderrOutput).toContain('Error [3]: page not found')
  })

  it('writes Context to stderr when applicable', () => {
    callHandleError(new AuthenticationError())
    expect(stderrOutput).toContain('Context:')
  })

  it('writes Hint to stderr for all DomainExceptions', () => {
    callHandleError(new ValidationError('invalid id'))
    expect(stderrOutput).toContain('Hint:')
  })

  it('AuthenticationError hint mentions `notion setup` or NOTION_TOKEN', () => {
    callHandleError(new AuthenticationError())
    expect(stderrOutput).toMatch(/notion setup|NOTION_TOKEN/i)
  })

  it('NotFoundError hint mentions verifying the ID', () => {
    callHandleError(new NotFoundError())
    expect(stderrOutput).toContain('Verify')
  })

  it('RateLimitError hint includes retry seconds (default 60)', () => {
    callHandleError(new RateLimitError())
    expect(stderrOutput).toContain('60')
  })

  it('RateLimitError hint includes custom retryAfterSeconds', () => {
    callHandleError(new RateLimitError('rate limited', 30))
    expect(stderrOutput).toContain('30')
  })

  it('CursorExpiredError hint mentions --start-cursor', () => {
    callHandleError(new CursorExpiredError())
    expect(stderrOutput).toContain('--start-cursor')
  })

  it('ApiError context includes status code', () => {
    callHandleError(new ApiError('server error', 503))
    expect(stderrOutput).toContain('503')
  })

  it('ConfigError context mentions configuration', () => {
    callHandleError(new ConfigError('config error'))
    expect(stderrOutput).toMatch(/config/i)
  })

  it('NetworkError context mentions network connection', () => {
    callHandleError(new NetworkError())
    expect(stderrOutput).toMatch(/network|connection/i)
  })
})

// ─── CursorExpiredError checked before ValidationError (subclass ordering) ────

describe('handleError: CursorExpiredError vs ValidationError subclass ordering', () => {
  it('CursorExpiredError gets cursor-specific hint (not generic validation hint)', () => {
    callHandleError(new CursorExpiredError())
    // Should have specific cursor hint
    expect(stderrOutput).toContain('--start-cursor')
    // Should NOT have the generic validation hint
    expect(stderrOutput).not.toContain('--help')
  })
})

// ─── Non-DomainException errors ───────────────────────────────────────────────

describe('handleError: plain Error', () => {
  it('exits with exitCode 1 for a plain Error', () => {
    callHandleError(new Error('something broke'))
    expect(exitCode).toBe(1)
  })

  it('writes the error message to stderr', () => {
    callHandleError(new Error('something broke'))
    expect(stderrOutput).toContain('something broke')
  })

  it('writes "Error:" prefix (no exitCode bracket) for plain errors', () => {
    callHandleError(new Error('plain error'))
    expect(stderrOutput).toContain('Error:')
    // Should NOT have "Error [N]:" format
    expect(stderrOutput).not.toMatch(/Error \[\d+\]:/)
  })

  it('exits with exitCode 1 for thrown string', () => {
    callHandleError('just a string error')
    expect(exitCode).toBe(1)
  })
})

// ─── EPIPE error → exit 0 ─────────────────────────────────────────────────────

describe('handleError: EPIPE error', () => {
  it('exits with code 0 for EPIPE (broken pipe)', () => {
    const epipeError = Object.assign(new Error('write EPIPE'), { code: 'EPIPE' })
    callHandleError(epipeError)
    expect(exitCode).toBe(0)
  })

  it('does not write to stderr for EPIPE', () => {
    const epipeError = Object.assign(new Error('write EPIPE'), { code: 'EPIPE' })
    callHandleError(epipeError)
    expect(stderrOutput).toBe('')
  })
})

// ─── output goes to stderr only ──────────────────────────────────────────────

describe('handleError: all output goes to stderr', () => {
  it('does not write to stdout', () => {
    const stdoutSpy = vi.spyOn(process.stdout, 'write')
    callHandleError(new NotFoundError())
    expect(stdoutSpy).not.toHaveBeenCalled()
  })
})
