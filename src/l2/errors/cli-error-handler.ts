/**
 * L2: CliErrorHandler
 * Maps DomainException to ExitCode + Context + Hint output.
 */

import { DomainException, AuthenticationError, PermissionError, NotFoundError, RateLimitError, NetworkError, TimeoutError, ValidationError, CursorExpiredError, ConfigError, ApiError } from '../../l1/errors/index.js'

interface ErrorHint {
  context?: string
  hint: string
}

function getErrorHint(error: DomainException): ErrorHint {
  if (error instanceof CursorExpiredError) {
    return {
      context: 'Pagination cursor expired',
      hint: 'Re-run the command without --start-cursor to restart from the beginning.',
    }
  }

  if (error instanceof AuthenticationError) {
    return {
      context: 'Notion API authentication failed',
      hint: 'Run `notion setup` or set the NOTION_TOKEN environment variable.',
    }
  }

  if (error instanceof PermissionError) {
    return {
      context: 'Access denied by Notion API',
      hint: 'In Notion, open the page → Share → Add your integration. The integration must be explicitly shared with each page/database.',
    }
  }

  if (error instanceof TimeoutError) {
    return {
      context: 'Request timed out',
      hint: 'Increase timeout with NOTION_TIMEOUT_MS environment variable (default: 30000ms). Check your network connection.',
    }
  }

  if (error instanceof NotFoundError) {
    return {
      context: 'The requested resource does not exist',
      hint: 'Verify the ID is correct. You can find it in the Notion page URL.',
    }
  }

  if (error instanceof RateLimitError) {
    const retrySeconds = error.retryAfterSeconds ?? 60
    return {
      context: 'Notion API rate limit exceeded',
      hint: `Wait ${retrySeconds} seconds before retrying. Consider using --limit to reduce request volume.`,
    }
  }

  if (error instanceof NetworkError) {
    return {
      context: 'Network connection failed',
      hint: 'Check your internet connection. Run `notion ping` to test connectivity.',
    }
  }

  if (error instanceof ValidationError) {
    return {
      hint: 'Check the command syntax with --help.',
    }
  }

  if (error instanceof ApiError) {
    return {
      context: `Notion API returned error ${error.statusCode}`,
      hint: 'This may be a temporary Notion server issue. Try again in a few minutes.',
    }
  }

  if (error instanceof ConfigError) {
    return {
      context: 'Configuration file error',
      hint: 'Run `notion config reset` to reset configuration.',
    }
  }

  return {
    hint: 'Run with --verbose for more details.',
  }
}

export function handleError(error: unknown): never {
  if (error instanceof DomainException) {
    const { context, hint } = getErrorHint(error)

    process.stderr.write(`Error [${error.exitCode}]: ${error.message}\n`)
    if (context) {
      process.stderr.write(`  Context: ${context}\n`)
    }
    process.stderr.write(`  Hint: ${hint}\n`)

    process.exit(error.exitCode)
  }

  // SIGPIPE: normal exit (pipe consumer closed early)
  if (isEpipeError(error)) {
    process.exit(0)
  }

  const message = error instanceof Error ? error.message : String(error)
  process.stderr.write(`Error: ${message}\n`)
  process.exit(1)
}

function isEpipeError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const nodeError = error as NodeJS.ErrnoException
  return nodeError.code === 'EPIPE'
}
