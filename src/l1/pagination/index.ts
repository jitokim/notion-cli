/**
 * L1: Paginator
 * Cursor-based pagination state manager.
 * Owns the cursor and drives paginated API calls.
 */

import { CursorExpiredError, ValidationError } from '../errors/index.js'

/** Minimal Notion API paginated response structure */
export interface PaginatedPage<T> {
  results: T[]
  next_cursor: string | null
  has_more: boolean
}

/** Page fetch function signature */
export type PageFetcher<T> = (cursor?: string, pageSize?: number) => Promise<PaginatedPage<T>>

/** Cursor validation regex */
const CURSOR_RE = /^[A-Za-z0-9+/=_\-]{10,500}$/

export interface PaginatorOptions {
  /** Maximum total results (undefined = fetch all) */
  limit?: number
  /** Items per page (default: 100) */
  pageSize?: number
  /** Start cursor for resuming pagination */
  startCursor?: string
}

/** Notion API page_size range */
const MIN_PAGE_SIZE = 1
const MAX_PAGE_SIZE = 100

export class Paginator<T> {
  private lastCursor?: string
  private totalYielded = 0

  constructor(private readonly options: PaginatorOptions = {}) {
    if (options.pageSize !== undefined) {
      if (!Number.isInteger(options.pageSize) || options.pageSize < MIN_PAGE_SIZE || options.pageSize > MAX_PAGE_SIZE) {
        throw new ValidationError(
          `pageSize must be an integer between ${MIN_PAGE_SIZE} and ${MAX_PAGE_SIZE}, got ${options.pageSize}`
        )
      }
    }
    if (options.startCursor) {
      this.validateCursor(options.startCursor)
      this.lastCursor = options.startCursor
    }
  }

  /**
   * Calls the fetch function and yields results as an async iterator.
   * Stops when the limit is reached or no more results are available.
   */
  async *iterate(fetcher: PageFetcher<T>): AsyncGenerator<T> {
    const { limit, pageSize = 100 } = this.options
    let cursor = this.lastCursor

    while (true) {
      const effectivePageSize = limit
        ? Math.min(pageSize, limit - this.totalYielded)
        : pageSize

      if (effectivePageSize <= 0) return

      const page = await fetcher(cursor, effectivePageSize)

      for (const item of page.results) {
        yield item
        this.totalYielded++

        if (limit !== undefined && this.totalYielded >= limit) {
          return
        }
      }

      if (!page.has_more || !page.next_cursor) {
        this.lastCursor = undefined
        return
      }

      this.lastCursor = page.next_cursor
      cursor = page.next_cursor
    }
  }

  /**
   * Returns the last cursor.
   * Use as the --start-cursor value to resume interrupted pagination.
   */
  getCursor(): string | undefined {
    return this.lastCursor
  }

  /**
   * Returns the total number of items yielded so far.
   */
  getTotalYielded(): number {
    return this.totalYielded
  }

  private validateCursor(cursor: string): void {
    if (!CURSOR_RE.test(cursor)) {
      throw new CursorExpiredError(
        `Invalid cursor format: "${cursor.slice(0, 20)}...". Re-run without --start-cursor.`
      )
    }
  }
}
