/**
 * L1: Domain Exception Hierarchy
 * Domain exception hierarchy.
 * Each exception maps to a specific CLI exit code.
 */

export abstract class DomainException extends Error {
  abstract readonly exitCode: number

  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = this.constructor.name
    // Preserve V8 stack trace accuracy
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor)
    }
  }
}

/** ExitCode 2: Authentication failure (401) */
export class AuthenticationError extends DomainException {
  readonly exitCode = 2

  constructor(message = 'Authentication failed. Check your Notion token.') {
    super(message)
  }
}

/** ExitCode 2: Insufficient permissions (403) */
export class PermissionError extends DomainException {
  readonly exitCode = 2

  constructor(message = 'Permission denied. Check integration access.') {
    super(message)
  }
}

/** ExitCode 3: Resource not found (404) */
export class NotFoundError extends DomainException {
  readonly exitCode = 3

  constructor(message = 'Resource not found.') {
    super(message)
  }
}

/** ExitCode 4: Rate limit exceeded (429, retries exhausted) */
export class RateLimitError extends DomainException {
  readonly exitCode = 4
  readonly retryAfterSeconds?: number

  constructor(message = 'Rate limit exceeded. Try again later.', retryAfterSeconds?: number) {
    super(message)
    this.retryAfterSeconds = retryAfterSeconds
  }
}

/** ExitCode 5: Network error (timeout, ECONNREFUSED) */
export class NetworkError extends DomainException {
  readonly exitCode = 5

  constructor(message = 'Network error. Check your connection.') {
    super(message)
  }
}

/** ExitCode 5: Request timeout */
export class TimeoutError extends NetworkError {
  constructor(message = 'Request timed out.') {
    super(message)
  }
}

/** ExitCode 6: Input validation failure */
export class ValidationError extends DomainException {
  readonly exitCode = 6

  constructor(message: string) {
    super(message)
  }
}

/** ExitCode 6: Cursor expired */
export class CursorExpiredError extends ValidationError {
  constructor(message = 'Cursor has expired. Re-run without --start-cursor.') {
    super(message)
  }
}

/** ExitCode 7: Notion API server error (5xx) */
export class ApiError extends DomainException {
  readonly exitCode = 7
  readonly statusCode: number

  constructor(message: string, statusCode: number) {
    super(message)
    this.statusCode = statusCode
  }
}

/** ExitCode 8: Config file read/write/lock failure */
export class ConfigError extends DomainException {
  readonly exitCode = 8

  constructor(message: string) {
    super(message)
  }
}

/** ExitCode 1: Uncategorized error */
export class UnexpectedError extends DomainException {
  readonly exitCode = 1

  constructor(message: string) {
    super(message)
  }
}
