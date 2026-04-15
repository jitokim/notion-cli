/**
 * L0: Retry-After header parsing utility.
 * Shared by error-mapper and retry-policy.
 */

import { APIResponseError } from '@notionhq/client'

/**
 * Extracts the retry delay in seconds from an APIResponseError's Retry-After header.
 * Returns undefined if the header is missing or unparseable.
 */
export function extractRetryAfterSeconds(error: unknown): number | undefined {
  if (!(error instanceof APIResponseError)) return undefined

  const headers = (error as unknown as Record<string, unknown>)['headers']
  if (!headers || typeof headers !== 'object') return undefined

  const retryAfter = (headers as Record<string, unknown>)['retry-after']
  if (!retryAfter) return undefined

  const seconds = Number(retryAfter)
  if (isNaN(seconds) || seconds <= 0) return undefined

  return seconds
}
