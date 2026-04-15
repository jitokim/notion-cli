/**
 * Tests for mapSdkError() — SDK Error → DomainException mapping
 */

import { describe, it, expect } from 'vitest'
import { APIResponseError, RequestTimeoutError } from '@notionhq/client'
import { mapSdkError } from './error-mapper.js'
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
  UnexpectedError,
} from '../../l1/errors/index.js'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeApiResponseError(status: number, message = 'error', code = 'unknown'): APIResponseError {
  return new APIResponseError({
    status,
    message,
    code: code as never,
    headers: {} as never,
    rawBodyText: '',
  })
}

function makeApiResponseErrorWithRetryAfter(retryAfterSeconds: number): APIResponseError {
  const err = new APIResponseError({
    status: 429,
    message: 'rate limited',
    code: 'rate_limited' as never,
    headers: { 'retry-after': String(retryAfterSeconds) } as never,
    rawBodyText: '',
  })
  return err
}

function makeNodeNetworkError(code: string): Error & { code: string } {
  const err = new Error(`${code} error`) as Error & { code: string }
  err.code = code
  return err
}

// ─── RequestTimeoutError ──────────────────────────────────────────────────────

describe('mapSdkError: RequestTimeoutError', () => {
  it('maps RequestTimeoutError → TimeoutError', () => {
    const err = new RequestTimeoutError()
    expect(mapSdkError(err)).toBeInstanceOf(TimeoutError)
  })

  it('TimeoutError is also instanceof NetworkError', () => {
    const result = mapSdkError(new RequestTimeoutError())
    expect(result).toBeInstanceOf(NetworkError)
  })

  it('preserves original message in TimeoutError', () => {
    const err = new RequestTimeoutError()
    const result = mapSdkError(err)
    expect(result.message).toBeTruthy()
  })
})

// ─── APIResponseError HTTP status mapping ─────────────────────────────────────

describe('mapSdkError: APIResponseError 401 → AuthenticationError', () => {
  it('returns AuthenticationError', () => {
    expect(mapSdkError(makeApiResponseError(401))).toBeInstanceOf(AuthenticationError)
  })

  it('exitCode is 2', () => {
    expect(mapSdkError(makeApiResponseError(401)).exitCode).toBe(2)
  })
})

describe('mapSdkError: APIResponseError 403 → PermissionError', () => {
  it('returns PermissionError', () => {
    expect(mapSdkError(makeApiResponseError(403))).toBeInstanceOf(PermissionError)
  })

  it('exitCode is 2', () => {
    expect(mapSdkError(makeApiResponseError(403)).exitCode).toBe(2)
  })
})

describe('mapSdkError: APIResponseError 404 → NotFoundError', () => {
  it('returns NotFoundError', () => {
    expect(mapSdkError(makeApiResponseError(404))).toBeInstanceOf(NotFoundError)
  })

  it('exitCode is 3', () => {
    expect(mapSdkError(makeApiResponseError(404)).exitCode).toBe(3)
  })
})

describe('mapSdkError: APIResponseError 429 → RateLimitError', () => {
  it('returns RateLimitError', () => {
    expect(mapSdkError(makeApiResponseError(429))).toBeInstanceOf(RateLimitError)
  })

  it('exitCode is 4', () => {
    expect(mapSdkError(makeApiResponseError(429)).exitCode).toBe(4)
  })

  it('extracts Retry-After header into retryAfterSeconds', () => {
    const result = mapSdkError(makeApiResponseErrorWithRetryAfter(30)) as RateLimitError
    expect(result.retryAfterSeconds).toBe(30)
  })

  it('retryAfterSeconds is undefined when no Retry-After header', () => {
    const result = mapSdkError(makeApiResponseError(429)) as RateLimitError
    expect(result.retryAfterSeconds).toBeUndefined()
  })
})

describe('mapSdkError: APIResponseError 400 → ValidationError', () => {
  it('returns ValidationError for generic 400', () => {
    expect(mapSdkError(makeApiResponseError(400))).toBeInstanceOf(ValidationError)
  })

  it('exitCode is 6', () => {
    expect(mapSdkError(makeApiResponseError(400)).exitCode).toBe(6)
  })
})

describe('mapSdkError: APIResponseError 400 + invalid_cursor → CursorExpiredError', () => {
  it('returns CursorExpiredError when code is invalid_cursor', () => {
    const err = makeApiResponseError(400, 'cursor expired', 'invalid_cursor')
    expect(mapSdkError(err)).toBeInstanceOf(CursorExpiredError)
  })

  it('CursorExpiredError is instanceof ValidationError', () => {
    const err = makeApiResponseError(400, 'cursor expired', 'invalid_cursor')
    expect(mapSdkError(err)).toBeInstanceOf(ValidationError)
  })

  it('exitCode is 6', () => {
    const err = makeApiResponseError(400, 'cursor expired', 'invalid_cursor')
    expect(mapSdkError(err).exitCode).toBe(6)
  })
})

describe('mapSdkError: APIResponseError 500 → ApiError', () => {
  it('returns ApiError for status 500', () => {
    expect(mapSdkError(makeApiResponseError(500))).toBeInstanceOf(ApiError)
  })

  it('returns ApiError for status 503', () => {
    expect(mapSdkError(makeApiResponseError(503))).toBeInstanceOf(ApiError)
  })

  it('stores statusCode on ApiError', () => {
    const result = mapSdkError(makeApiResponseError(503)) as ApiError
    expect(result.statusCode).toBe(503)
  })

  it('exitCode is 7', () => {
    expect(mapSdkError(makeApiResponseError(500)).exitCode).toBe(7)
  })
})

// ─── Node.js network errors ───────────────────────────────────────────────────

describe('mapSdkError: Node.js network errors → NetworkError', () => {
  it.each(['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET', 'EPIPE'])(
    'maps %s → NetworkError',
    (code) => {
      expect(mapSdkError(makeNodeNetworkError(code))).toBeInstanceOf(NetworkError)
    }
  )

  it('exitCode is 5', () => {
    expect(mapSdkError(makeNodeNetworkError('ECONNREFUSED')).exitCode).toBe(5)
  })

  it('does not map a plain Error without .code → NetworkError', () => {
    const plain = new Error('generic error')
    const result = mapSdkError(plain)
    expect(result).not.toBeInstanceOf(NetworkError)
    expect(result).toBeInstanceOf(UnexpectedError)
  })
})

// ─── DomainException pass-through ────────────────────────────────────────────

describe('mapSdkError: DomainException pass-through', () => {
  it('returns the same DomainException when already a DomainException', () => {
    const original = new NotFoundError('already mapped')
    const result = mapSdkError(original)
    expect(result).toBe(original)
  })
})

// ─── Unknown errors ───────────────────────────────────────────────────────────

describe('mapSdkError: unknown errors → UnexpectedError', () => {
  it('wraps a plain Error as UnexpectedError', () => {
    expect(mapSdkError(new Error('unknown'))).toBeInstanceOf(UnexpectedError)
  })

  it('wraps a string as UnexpectedError', () => {
    expect(mapSdkError('something went wrong')).toBeInstanceOf(UnexpectedError)
  })

  it('wraps null as UnexpectedError', () => {
    expect(mapSdkError(null)).toBeInstanceOf(UnexpectedError)
  })

  it('wraps an object as UnexpectedError', () => {
    expect(mapSdkError({ code: 'weird' })).toBeInstanceOf(UnexpectedError)
  })

  it('exitCode is 1 for UnexpectedError', () => {
    expect(mapSdkError(new Error('?')).exitCode).toBe(1)
  })
})
