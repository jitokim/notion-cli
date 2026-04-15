/**
 * L0: SDK Error → DomainException mapping.
 * Converts @notionhq/client errors into L1 domain exceptions.
 */

import { APIResponseError, RequestTimeoutError } from '@notionhq/client'
import { extractRetryAfterSeconds } from './retry-after.js'
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

const HTTP_STATUS = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  TOO_MANY_REQUESTS: 429,
} as const

// invalid_cursor is not in the APIErrorCode enum, so we match by string
const INVALID_CURSOR_CODE = 'invalid_cursor'

/**
 * Converts a Notion SDK error into a DomainException.
 * Unknown errors are wrapped in UnexpectedError.
 */
export function mapSdkError(error: unknown): DomainException {
  if (error instanceof DomainException) {
    return error
  }

  if (error instanceof RequestTimeoutError) {
    return new TimeoutError(`Request timed out: ${error.message}`)
  }

  if (error instanceof APIResponseError) {
    return mapApiResponseError(error)
  }

  // Node.js network errors (ECONNREFUSED, ENOTFOUND, etc.)
  if (isNodeNetworkError(error)) {
    const message = error instanceof Error ? error.message : String(error)
    return new NetworkError(`Network error: ${message}`)
  }

  const message = error instanceof Error ? error.message : String(error)
  return new UnexpectedError(`Unexpected error: ${message}`)
}

function mapApiResponseError(error: APIResponseError): DomainException {
  const { status, message, code } = error

  switch (status) {
    case HTTP_STATUS.BAD_REQUEST:
      if ((code as string) === INVALID_CURSOR_CODE) {
        return new CursorExpiredError(
          'Pagination cursor has expired. Re-run without --start-cursor.'
        )
      }
      return new ValidationError(`Bad request: ${message}`)

    case HTTP_STATUS.UNAUTHORIZED:
      return new AuthenticationError(
        `Authentication failed: ${message}. Check your NOTION_TOKEN.`
      )

    case HTTP_STATUS.FORBIDDEN:
      return new PermissionError(
        `Permission denied: ${message}. Check integration access in Notion settings.`
      )

    case HTTP_STATUS.NOT_FOUND:
      return new NotFoundError(`Resource not found: ${message}`)

    case HTTP_STATUS.TOO_MANY_REQUESTS: {
      const retryAfter = extractRetryAfterSeconds(error)
      return new RateLimitError(
        `Rate limit exceeded: ${message}. Retry after ${retryAfter ?? '?'} seconds.`,
        retryAfter
      )
    }

    default:
      if (status >= 500) {
        return new ApiError(`Notion API server error (${status}): ${message}`, status)
      }
      return new ValidationError(`API error (${status}): ${message}`)
  }
}

function isNodeNetworkError(error: unknown): error is Error {
  if (!(error instanceof Error)) return false
  const networkCodes = ['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET', 'EPIPE']
  const nodeError = error as NodeJS.ErrnoException
  return nodeError.code !== undefined && networkCodes.includes(nodeError.code)
}
