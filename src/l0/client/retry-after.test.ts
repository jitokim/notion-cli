/**
 * Tests for extractRetryAfterSeconds
 */

import { describe, it, expect } from 'vitest'
import { APIResponseError } from '@notionhq/client'
import { extractRetryAfterSeconds } from './retry-after.js'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeApiErrorWithRetryAfter(seconds: number): APIResponseError {
  return new APIResponseError({
    status: 429,
    message: 'rate limited',
    code: 'rate_limited' as never,
    headers: { 'retry-after': String(seconds) } as never,
    rawBodyText: '',
  })
}

function makeApiErrorWithoutRetryAfter(): APIResponseError {
  return new APIResponseError({
    status: 429,
    message: 'rate limited',
    code: 'rate_limited' as never,
    headers: {} as never,
    rawBodyText: '',
  })
}

// ─── Success cases ────────────────────────────────────────────────────────────

describe('extractRetryAfterSeconds: success cases', () => {
  it('returns seconds from Retry-After header', () => {
    const error = makeApiErrorWithRetryAfter(30)
    expect(extractRetryAfterSeconds(error)).toBe(30)
  })

  it('returns 1 for Retry-After: 1', () => {
    const error = makeApiErrorWithRetryAfter(1)
    expect(extractRetryAfterSeconds(error)).toBe(1)
  })

  it('returns large values without capping (capping is caller responsibility)', () => {
    const error = makeApiErrorWithRetryAfter(120)
    expect(extractRetryAfterSeconds(error)).toBe(120)
  })

  it('returns fractional seconds', () => {
    const error = new APIResponseError({
      status: 429,
      message: 'rate limited',
      code: 'rate_limited' as never,
      headers: { 'retry-after': '1.5' } as never,
      rawBodyText: '',
    })
    expect(extractRetryAfterSeconds(error)).toBe(1.5)
  })
})

// ─── Failure / early exit cases ───────────────────────────────────────────────

describe('extractRetryAfterSeconds: failure cases', () => {
  it('returns undefined for non-APIResponseError (plain Error)', () => {
    expect(extractRetryAfterSeconds(new Error('network error'))).toBeUndefined()
  })

  it('returns undefined for null', () => {
    expect(extractRetryAfterSeconds(null)).toBeUndefined()
  })

  it('returns undefined for undefined', () => {
    expect(extractRetryAfterSeconds(undefined)).toBeUndefined()
  })

  it('returns undefined for a plain object', () => {
    expect(extractRetryAfterSeconds({ status: 429 })).toBeUndefined()
  })

  it('returns undefined when Retry-After header is absent', () => {
    const error = makeApiErrorWithoutRetryAfter()
    expect(extractRetryAfterSeconds(error)).toBeUndefined()
  })

  it('returns undefined when Retry-After header is not a number', () => {
    const error = new APIResponseError({
      status: 429,
      message: 'rate limited',
      code: 'rate_limited' as never,
      headers: { 'retry-after': 'not-a-number' } as never,
      rawBodyText: '',
    })
    expect(extractRetryAfterSeconds(error)).toBeUndefined()
  })

  it('returns undefined when headers object is missing entirely', () => {
    const error = new APIResponseError({
      status: 429,
      message: 'rate limited',
      code: 'rate_limited' as never,
      headers: undefined as never,
      rawBodyText: '',
    })
    expect(extractRetryAfterSeconds(error)).toBeUndefined()
  })
})
