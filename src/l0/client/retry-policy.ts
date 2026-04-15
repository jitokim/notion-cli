/**
 * L0: RetryPolicy
 * Exponential backoff with jitter; honors Retry-After header.
 * Retryable status codes: 429, 500, 502, 503, 504.
 */

import { APIResponseError } from '@notionhq/client'
import { logger } from '../logger/index.js'
import { extractRetryAfterSeconds } from './retry-after.js'

const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504])
const TRANSIENT_NETWORK_CODES = new Set(['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'ENOTFOUND', 'EPIPE', 'EAI_AGAIN'])

function isTransientNetworkError(error: unknown): boolean {
  if (error instanceof Error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code && TRANSIENT_NETWORK_CODES.has(code)) return true
  }
  return false
}
const NON_RETRYABLE_STATUS_CODES = new Set([400, 401, 403, 404])

const DEFAULT_MAX_ATTEMPTS = 3
const DEFAULT_BASE_DELAY_MS = 1000
const DEFAULT_MAX_DELAY_MS = 60_000
const JITTER_FACTOR = 0.3

export interface RetryPolicyOptions {
  maxAttempts?: number
  baseDelayMs?: number
  maxDelayMs?: number
  /** Callback on retry — used for stderr progress output in TTY */
  onRetry?: (attempt: number, maxAttempts: number, delayMs: number) => void
}

export class RetryPolicy {
  private readonly maxAttempts: number
  private readonly baseDelayMs: number
  private readonly maxDelayMs: number
  private readonly onRetry?: (attempt: number, maxAttempts: number, delayMs: number) => void

  constructor(options: RetryPolicyOptions = {}) {
    this.maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS
    this.baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS
    this.maxDelayMs = options.maxDelayMs ?? DEFAULT_MAX_DELAY_MS
    this.onRetry = options.onRetry
  }

  /**
   * Executes the given operation with retry logic.
   * Non-retryable errors are re-thrown immediately.
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: unknown

    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      try {
        return await operation()
      } catch (error) {
        lastError = error

        if (!this.shouldRetry(error) || attempt === this.maxAttempts) {
          throw error
        }

        const delayMs = this.calculateDelay(attempt, error)
        logger.debug({ attempt, maxAttempts: this.maxAttempts, delayMs }, 'Retrying request')

        this.onRetry?.(attempt, this.maxAttempts, delayMs)

        await this.sleep(delayMs)
      }
    }

    throw lastError
  }

  private shouldRetry(error: unknown): boolean {
    if (error instanceof APIResponseError) {
      if (NON_RETRYABLE_STATUS_CODES.has(error.status)) return false
      return RETRYABLE_STATUS_CODES.has(error.status)
    }
    return isTransientNetworkError(error)
  }

  private calculateDelay(attempt: number, error: unknown): number {
    // Honor Retry-After header from rate-limit responses
    const retryAfterSeconds = extractRetryAfterSeconds(error)
    if (retryAfterSeconds !== undefined) {
      return Math.min(retryAfterSeconds * 1000, this.maxDelayMs)
    }

    // Exponential backoff: 1s, 2s, 4s, ...
    const exponentialDelay = this.baseDelayMs * Math.pow(2, attempt - 1)
    const cappedDelay = Math.min(exponentialDelay, this.maxDelayMs)

    // ±30% jitter
    const jitter = cappedDelay * JITTER_FACTOR * (Math.random() * 2 - 1)
    return Math.max(0, Math.round(cappedDelay + jitter))
  }

  private sleep(milliseconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, milliseconds))
  }
}

