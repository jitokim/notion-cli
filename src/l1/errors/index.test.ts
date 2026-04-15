/**
 * Tests for L1 DomainException hierarchy
 */

import { describe, it, expect } from 'vitest'
import {
  DomainException,
  AuthenticationError,
  PermissionError,
  NotFoundError,
  RateLimitError,
  NetworkError,
  TimeoutError,
  ValidationError,
  CursorExpiredError,
  ApiError,
  ConfigError,
  UnexpectedError,
} from './index.js'

// ─── DomainException base class ───────────────────────────────────────────────

describe('DomainException base class', () => {
  it('cannot be instantiated directly (abstract)', () => {
    // Using a concrete subclass to verify base class behaviour
    const err = new ValidationError('test')
    expect(err).toBeInstanceOf(DomainException)
    expect(err).toBeInstanceOf(Error)
  })

  it('sets this.name to the constructor name', () => {
    expect(new AuthenticationError().name).toBe('AuthenticationError')
    expect(new ValidationError('v').name).toBe('ValidationError')
    expect(new ApiError('a', 500).name).toBe('ApiError')
  })

  it('preserves the error message', () => {
    const msg = 'custom message'
    expect(new ValidationError(msg).message).toBe(msg)
  })
})

// ─── exitCode values ──────────────────────────────────────────────────────────

describe('exitCode values', () => {
  it('UnexpectedError has exitCode 1', () => {
    expect(new UnexpectedError('x').exitCode).toBe(1)
  })

  it('AuthenticationError has exitCode 2', () => {
    expect(new AuthenticationError().exitCode).toBe(2)
  })

  it('PermissionError has exitCode 2', () => {
    expect(new PermissionError().exitCode).toBe(2)
  })

  it('NotFoundError has exitCode 3', () => {
    expect(new NotFoundError().exitCode).toBe(3)
  })

  it('RateLimitError has exitCode 4', () => {
    expect(new RateLimitError().exitCode).toBe(4)
  })

  it('NetworkError has exitCode 5', () => {
    expect(new NetworkError().exitCode).toBe(5)
  })

  it('TimeoutError has exitCode 5 (inherits from NetworkError)', () => {
    expect(new TimeoutError().exitCode).toBe(5)
  })

  it('ValidationError has exitCode 6', () => {
    expect(new ValidationError('v').exitCode).toBe(6)
  })

  it('CursorExpiredError has exitCode 6 (inherits from ValidationError)', () => {
    expect(new CursorExpiredError().exitCode).toBe(6)
  })

  it('ApiError has exitCode 7', () => {
    expect(new ApiError('a', 500).exitCode).toBe(7)
  })

  it('ConfigError has exitCode 8', () => {
    expect(new ConfigError('c').exitCode).toBe(8)
  })
})

// ─── inheritance chain ────────────────────────────────────────────────────────

describe('inheritance chain', () => {
  it('TimeoutError is instanceof NetworkError', () => {
    expect(new TimeoutError()).toBeInstanceOf(NetworkError)
  })

  it('TimeoutError is instanceof DomainException', () => {
    expect(new TimeoutError()).toBeInstanceOf(DomainException)
  })

  it('CursorExpiredError is instanceof ValidationError', () => {
    expect(new CursorExpiredError()).toBeInstanceOf(ValidationError)
  })

  it('CursorExpiredError is instanceof DomainException', () => {
    expect(new CursorExpiredError()).toBeInstanceOf(DomainException)
  })
})

// ─── default messages ─────────────────────────────────────────────────────────

describe('default messages', () => {
  it('AuthenticationError has a default message', () => {
    expect(new AuthenticationError().message).toContain('Authentication failed')
  })

  it('PermissionError has a default message', () => {
    expect(new PermissionError().message).toContain('Permission denied')
  })

  it('NotFoundError has a default message', () => {
    expect(new NotFoundError().message).toContain('not found')
  })

  it('RateLimitError has a default message', () => {
    expect(new RateLimitError().message).toContain('Rate limit')
  })

  it('NetworkError has a default message', () => {
    expect(new NetworkError().message).toContain('Network error')
  })

  it('TimeoutError has a default message', () => {
    expect(new TimeoutError().message).toContain('timed out')
  })

  it('CursorExpiredError default message mentions --start-cursor', () => {
    expect(new CursorExpiredError().message).toContain('--start-cursor')
  })
})

// ─── RateLimitError.retryAfterSeconds ────────────────────────────────────────

describe('RateLimitError.retryAfterSeconds', () => {
  it('retryAfterSeconds is undefined when not provided', () => {
    expect(new RateLimitError().retryAfterSeconds).toBeUndefined()
  })

  it('retryAfterSeconds stores provided value', () => {
    expect(new RateLimitError('msg', 42).retryAfterSeconds).toBe(42)
  })
})

// ─── ApiError.statusCode ──────────────────────────────────────────────────────

describe('ApiError.statusCode', () => {
  it('stores the HTTP status code', () => {
    expect(new ApiError('Server error', 503).statusCode).toBe(503)
  })

  it('preserves the message alongside statusCode', () => {
    const err = new ApiError('Internal Server Error', 500)
    expect(err.message).toBe('Internal Server Error')
    expect(err.statusCode).toBe(500)
  })
})

// ─── custom messages override defaults ───────────────────────────────────────

describe('custom messages override defaults', () => {
  it('AuthenticationError accepts custom message', () => {
    const msg = 'Token is invalid'
    expect(new AuthenticationError(msg).message).toBe(msg)
  })

  it('ValidationError requires a message (no default)', () => {
    expect(new ValidationError('bad input').message).toBe('bad input')
  })
})
