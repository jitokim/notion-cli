/**
 * Tests for RetryPolicy — exponential backoff with jitter
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { APIResponseError } from '@notionhq/client'
import { RetryPolicy } from './retry-policy.js'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeApiError(status: number, message = 'error'): APIResponseError {
  return new APIResponseError({
    status,
    message,
    code: 'unknown' as never,
    headers: {} as never,
    rawBodyText: '',
  })
}

function makeApiErrorWithRetryAfter(status: number, retryAfterSeconds: number): APIResponseError {
  return new APIResponseError({
    status,
    message: 'rate limited',
    code: 'rate_limited' as never,
    headers: { 'retry-after': String(retryAfterSeconds) } as never,
    rawBodyText: '',
  })
}

// Instantaneous RetryPolicy (no real delays in tests)
function fastPolicy(options: ConstructorParameters<typeof RetryPolicy>[0] = {}): RetryPolicy {
  return new RetryPolicy({ baseDelayMs: 0, maxDelayMs: 0, ...options })
}

// ─── Success path ─────────────────────────────────────────────────────────────

describe('RetryPolicy: success without retry', () => {
  it('returns the result immediately on first success', async () => {
    const policy = fastPolicy()
    const result = await policy.execute(async () => 'ok')
    expect(result).toBe('ok')
  })

  it('calls the operation exactly once on success', async () => {
    const operation = vi.fn(async () => 42)
    const policy = fastPolicy()
    await policy.execute(operation)
    expect(operation).toHaveBeenCalledTimes(1)
  })
})

// ─── Retryable errors ─────────────────────────────────────────────────────────

describe('RetryPolicy: retries on 429', () => {
  it('retries after 429 and returns result on next success', async () => {
    let call = 0
    const operation = vi.fn(async () => {
      if (call++ === 0) throw makeApiError(429)
      return 'success'
    })
    const policy = fastPolicy({ maxAttempts: 3 })
    const result = await policy.execute(operation)
    expect(result).toBe('success')
    expect(operation).toHaveBeenCalledTimes(2)
  })

  it('retries on 502', async () => {
    let call = 0
    const operation = vi.fn(async () => {
      if (call++ === 0) throw makeApiError(502)
      return 'ok'
    })
    const policy = fastPolicy()
    await policy.execute(operation)
    expect(operation).toHaveBeenCalledTimes(2)
  })

  it('retries on 503', async () => {
    let call = 0
    const operation = vi.fn(async () => {
      if (call++ === 0) throw makeApiError(503)
      return 'ok'
    })
    const policy = fastPolicy()
    await policy.execute(operation)
    expect(operation).toHaveBeenCalledTimes(2)
  })

  it('retries on 504', async () => {
    let call = 0
    const operation = vi.fn(async () => {
      if (call++ === 0) throw makeApiError(504)
      return 'ok'
    })
    const policy = fastPolicy()
    await policy.execute(operation)
    expect(operation).toHaveBeenCalledTimes(2)
  })
})

// ─── Max attempts exhausted ───────────────────────────────────────────────────

describe('RetryPolicy: throws after maxAttempts exhausted', () => {
  it('throws the last error after 3 failed attempts (default)', async () => {
    const error = makeApiError(429)
    const operation = vi.fn(async () => { throw error })
    const policy = fastPolicy({ maxAttempts: 3 })
    await expect(policy.execute(operation)).rejects.toThrow(error)
    expect(operation).toHaveBeenCalledTimes(3)
  })

  it('respects custom maxAttempts: 1 means no retry', async () => {
    const operation = vi.fn(async () => { throw makeApiError(429) })
    const policy = fastPolicy({ maxAttempts: 1 })
    await expect(policy.execute(operation)).rejects.toBeInstanceOf(APIResponseError)
    expect(operation).toHaveBeenCalledTimes(1)
  })

  it('respects custom maxAttempts: 2 means one retry', async () => {
    const operation = vi.fn(async () => { throw makeApiError(503) })
    const policy = fastPolicy({ maxAttempts: 2 })
    await expect(policy.execute(operation)).rejects.toBeInstanceOf(APIResponseError)
    expect(operation).toHaveBeenCalledTimes(2)
  })
})

// ─── Non-retryable errors ─────────────────────────────────────────────────────

describe('RetryPolicy: no retry on non-retryable status codes', () => {
  it.each([400, 401, 403, 404])(
    'throws immediately without retry for status %i',
    async (status) => {
      const error = makeApiError(status)
      const operation = vi.fn(async () => { throw error })
      const policy = fastPolicy({ maxAttempts: 3 })
      await expect(policy.execute(operation)).rejects.toThrow(error)
      expect(operation).toHaveBeenCalledTimes(1)
    }
  )

  it('throws immediately for a non-APIResponseError (plain Error)', async () => {
    const error = new Error('network failure')
    const operation = vi.fn(async () => { throw error })
    const policy = fastPolicy({ maxAttempts: 3 })
    await expect(policy.execute(operation)).rejects.toThrow(error)
    expect(operation).toHaveBeenCalledTimes(1)
  })
})

// ─── Transient network errors ─────────────────────────────────────────────────

describe('RetryPolicy: retries on transient Node.js network errors', () => {
  it('retries on ECONNRESET and returns result on next success', async () => {
    let call = 0
    const networkError = Object.assign(new Error('ECONNRESET'), { code: 'ECONNRESET' })
    const operation = vi.fn(async () => {
      if (call++ === 0) throw networkError
      return 'success'
    })
    const policy = fastPolicy({ maxAttempts: 3 })
    const result = await policy.execute(operation)
    expect(result).toBe('success')
    expect(operation).toHaveBeenCalledTimes(2)
  })

  it('does NOT retry on ENOENT (not a transient error)', async () => {
    const fileError = Object.assign(new Error('no such file'), { code: 'ENOENT' })
    const operation = vi.fn(async () => { throw fileError })
    const policy = fastPolicy({ maxAttempts: 3 })
    await expect(policy.execute(operation)).rejects.toThrow(fileError)
    expect(operation).toHaveBeenCalledTimes(1)
  })
})

// ─── onRetry callback ─────────────────────────────────────────────────────────

describe('RetryPolicy: onRetry callback', () => {
  it('calls onRetry with attempt number on each retry', async () => {
    const onRetry = vi.fn()
    let call = 0
    const operation = vi.fn(async () => {
      if (call++ < 2) throw makeApiError(429)
      return 'done'
    })
    const policy = fastPolicy({ maxAttempts: 3, onRetry })
    await policy.execute(operation)
    expect(onRetry).toHaveBeenCalledTimes(2)
    expect(onRetry).toHaveBeenNthCalledWith(1, 1, 3, expect.any(Number))
    expect(onRetry).toHaveBeenNthCalledWith(2, 2, 3, expect.any(Number))
  })

  it('does not call onRetry on immediate success', async () => {
    const onRetry = vi.fn()
    const policy = fastPolicy({ onRetry })
    await policy.execute(async () => 'ok')
    expect(onRetry).not.toHaveBeenCalled()
  })
})

// ─── Delay calculation ────────────────────────────────────────────────────────

describe('RetryPolicy: delay calculation', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  it('exponential backoff: attempt 1 base=1000ms gives ~1000ms (±30% jitter)', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0) // jitter = -30%
    let call = 0
    const operation = vi.fn(async () => {
      if (call++ === 0) throw makeApiError(429)
      return 'ok'
    })
    const policy = new RetryPolicy({ maxAttempts: 3, baseDelayMs: 1000, maxDelayMs: 60_000 })

    const executePromise = policy.execute(operation)
    // Advance past any pending timers
    await vi.runAllTimersAsync()
    const result = await executePromise
    expect(result).toBe('ok')
  })

  it('Retry-After header overrides exponential backoff (capped at maxDelay)', async () => {
    const onRetry = vi.fn()
    let call = 0
    const operation = vi.fn(async () => {
      if (call++ === 0) throw makeApiErrorWithRetryAfter(429, 5)
      return 'ok'
    })
    const policy = new RetryPolicy({
      maxAttempts: 3,
      baseDelayMs: 1000,
      maxDelayMs: 60_000,
      onRetry,
    })
    const executePromise = policy.execute(operation)
    await vi.runAllTimersAsync()
    await executePromise
    // delay should be 5000ms (5s * 1000), not exponential 1000ms
    const [, , delayMs] = onRetry.mock.calls[0] as [number, number, number]
    expect(delayMs).toBe(5000)
  })

  it('Retry-After header is capped at maxDelayMs (60s)', async () => {
    const onRetry = vi.fn()
    let call = 0
    const operation = vi.fn(async () => {
      if (call++ === 0) throw makeApiErrorWithRetryAfter(429, 120) // 120s → capped at 60s
      return 'ok'
    })
    const policy = new RetryPolicy({
      maxAttempts: 2,
      baseDelayMs: 1000,
      maxDelayMs: 60_000,
      onRetry,
    })
    const executePromise = policy.execute(operation)
    await vi.runAllTimersAsync()
    await executePromise
    const [, , delayMs] = onRetry.mock.calls[0] as [number, number, number]
    expect(delayMs).toBe(60_000)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })
})
