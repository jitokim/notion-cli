/**
 * Tests for Paginator<T>
 */

import { describe, it, expect, vi } from 'vitest'
import { Paginator } from './index.js'
import type { PaginatedPage, PageFetcher } from './index.js'
import { CursorExpiredError } from '../errors/index.js'

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build a PageFetcher that returns predefined pages in sequence */
function makeMultiPageFetcher<T>(pages: PaginatedPage<T>[]): PageFetcher<T> {
  let callCount = 0
  return vi.fn(async (_cursor?: string, _pageSize?: number) => {
    const page = pages[callCount++]
    if (!page) throw new Error('Fetcher called more times than pages provided')
    return page
  })
}

function singlePage<T>(results: T[]): PaginatedPage<T> {
  return { results, next_cursor: null, has_more: false }
}

function pageWithCursor<T>(results: T[], cursor: string): PaginatedPage<T> {
  return { results, next_cursor: cursor, has_more: true }
}

async function collectAll<T>(gen: AsyncGenerator<T>): Promise<T[]> {
  const items: T[] = []
  for await (const item of gen) {
    items.push(item)
  }
  return items
}

// ─── Single page ──────────────────────────────────────────────────────────────

describe('Paginator single page (has_more: false)', () => {
  it('yields all items from a single page', async () => {
    const fetcher = makeMultiPageFetcher([singlePage([1, 2, 3])])
    const paginator = new Paginator<number>()
    const items = await collectAll(paginator.iterate(fetcher))
    expect(items).toEqual([1, 2, 3])
  })

  it('calls fetcher exactly once for a single page', async () => {
    const fetcher = makeMultiPageFetcher([singlePage(['a'])])
    const paginator = new Paginator<string>()
    await collectAll(paginator.iterate(fetcher))
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('yields nothing for empty results', async () => {
    const fetcher = makeMultiPageFetcher([singlePage([])])
    const paginator = new Paginator<number>()
    const items = await collectAll(paginator.iterate(fetcher))
    expect(items).toEqual([])
  })

  it('getTotalYielded() returns 0 for empty results', async () => {
    const fetcher = makeMultiPageFetcher([singlePage([])])
    const paginator = new Paginator<number>()
    await collectAll(paginator.iterate(fetcher))
    expect(paginator.getTotalYielded()).toBe(0)
  })

  it('getCursor() returns undefined after natural completion', async () => {
    const fetcher = makeMultiPageFetcher([singlePage([1, 2])])
    const paginator = new Paginator<number>()
    await collectAll(paginator.iterate(fetcher))
    expect(paginator.getCursor()).toBeUndefined()
  })
})

// ─── Multi page ───────────────────────────────────────────────────────────────

describe('Paginator multi-page traversal', () => {
  it('yields all items across multiple pages', async () => {
    const fetcher = makeMultiPageFetcher([
      pageWithCursor([1, 2], 'cursor-1'),
      pageWithCursor([3, 4], 'cursor-2'),
      singlePage([5]),
    ])
    const paginator = new Paginator<number>()
    const items = await collectAll(paginator.iterate(fetcher))
    expect(items).toEqual([1, 2, 3, 4, 5])
  })

  it('calls fetcher with the next_cursor from the previous page', async () => {
    const fetcher = makeMultiPageFetcher([
      pageWithCursor(['a'], 'cursor-abc'),
      singlePage(['b']),
    ])
    const paginator = new Paginator<string>()
    await collectAll(paginator.iterate(fetcher))
    expect(fetcher).toHaveBeenNthCalledWith(2, 'cursor-abc', expect.anything())
  })

  it('getTotalYielded() reflects total items across all pages', async () => {
    const fetcher = makeMultiPageFetcher([
      pageWithCursor([1, 2, 3], 'c1'),
      singlePage([4, 5]),
    ])
    const paginator = new Paginator<number>()
    await collectAll(paginator.iterate(fetcher))
    expect(paginator.getTotalYielded()).toBe(5)
  })

  it('getCursor() returns undefined after full traversal (has_more: false)', async () => {
    const fetcher = makeMultiPageFetcher([
      pageWithCursor([1], 'cursor-x'),
      singlePage([2]),
    ])
    const paginator = new Paginator<number>()
    await collectAll(paginator.iterate(fetcher))
    expect(paginator.getCursor()).toBeUndefined()
  })
})

// ─── limit option ─────────────────────────────────────────────────────────────

describe('Paginator with limit', () => {
  it('stops after yielding exactly limit items', async () => {
    const fetcher = makeMultiPageFetcher([
      pageWithCursor([1, 2, 3], 'c1'),
      singlePage([4, 5, 6]),
    ])
    const paginator = new Paginator<number>({ limit: 4 })
    const items = await collectAll(paginator.iterate(fetcher))
    expect(items).toEqual([1, 2, 3, 4])
  })

  it('does not request more items than needed on the final page', async () => {
    const fetcher = makeMultiPageFetcher([
      pageWithCursor([1, 2, 3], 'c1'),
      singlePage([4, 5]),
    ])
    const paginator = new Paginator<number>({ limit: 4, pageSize: 100 })
    await collectAll(paginator.iterate(fetcher))
    // Second call should request only 1 item (limit 4, already yielded 3)
    expect(fetcher).toHaveBeenNthCalledWith(2, 'c1', 1)
  })

  it('works when limit equals exact total results', async () => {
    const fetcher = makeMultiPageFetcher([singlePage([1, 2, 3])])
    const paginator = new Paginator<number>({ limit: 3 })
    const items = await collectAll(paginator.iterate(fetcher))
    expect(items).toEqual([1, 2, 3])
  })

  it('works when limit is larger than total results', async () => {
    const fetcher = makeMultiPageFetcher([singlePage([1, 2])])
    const paginator = new Paginator<number>({ limit: 100 })
    const items = await collectAll(paginator.iterate(fetcher))
    expect(items).toEqual([1, 2])
  })
})

// ─── startCursor / resume ─────────────────────────────────────────────────────

describe('Paginator startCursor (resume)', () => {
  it('passes startCursor to the first fetcher call', async () => {
    const validCursor = 'validcursor12345678'
    const fetcher = makeMultiPageFetcher([singlePage([10])])
    const paginator = new Paginator<number>({ startCursor: validCursor })
    await collectAll(paginator.iterate(fetcher))
    expect(fetcher).toHaveBeenNthCalledWith(1, validCursor, expect.anything())
  })

  it('throws CursorExpiredError at construction for invalid cursor format', () => {
    expect(() => new Paginator({ startCursor: 'bad!' })).toThrow(CursorExpiredError)
  })

  it('throws CursorExpiredError for cursor that is too short (< 10 chars)', () => {
    expect(() => new Paginator({ startCursor: 'short' })).toThrow(CursorExpiredError)
  })

  it('throws CursorExpiredError for cursor that is too long (> 500 chars)', () => {
    expect(() => new Paginator({ startCursor: 'a'.repeat(501) })).toThrow(CursorExpiredError)
  })

  it('getCursor() returns the startCursor before iteration starts', () => {
    const validCursor = 'validcursor12345678'
    const paginator = new Paginator<number>({ startCursor: validCursor })
    expect(paginator.getCursor()).toBe(validCursor)
  })
})

// ─── getCursor() mid-iteration ────────────────────────────────────────────────

describe('getCursor() after interrupted pagination', () => {
  it('returns last next_cursor when interrupted mid-pagination', async () => {
    const fetcher = makeMultiPageFetcher([
      pageWithCursor([1, 2], 'cursor-page2'),
      pageWithCursor([3, 4], 'cursor-page3'),
    ])
    const paginator = new Paginator<number>({ limit: 3 })
    await collectAll(paginator.iterate(fetcher))
    // After stopping at item 3 (limit), cursor should reflect mid-iteration state
    // limit stops inside page 2 results, so lastCursor was set to 'cursor-page2'
    expect(paginator.getCursor()).toBe('cursor-page2')
  })
})

// ─── getTotalYielded() ────────────────────────────────────────────────────────

describe('getTotalYielded()', () => {
  it('returns 0 before any iteration', () => {
    const paginator = new Paginator<number>()
    expect(paginator.getTotalYielded()).toBe(0)
  })

  it('accumulates correctly across multiple pages', async () => {
    const fetcher = makeMultiPageFetcher([
      pageWithCursor([1, 2], 'c1'),
      pageWithCursor([3, 4, 5], 'c2'),
      singlePage([6]),
    ])
    const paginator = new Paginator<number>()
    await collectAll(paginator.iterate(fetcher))
    expect(paginator.getTotalYielded()).toBe(6)
  })
})

// ─── effectivePageSize guard ──────────────────────────────────────────────────

describe('Paginator: effectivePageSize <= 0 early return', () => {
  it('does not call fetcher when limit is already satisfied before next page', async () => {
    // limit=2, first page returns exactly 2 items and has_more=true
    // effectivePageSize would be 0 on the next iteration → should return without fetching
    const fetcher = makeMultiPageFetcher([
      pageWithCursor([1, 2], 'cursor-next'),
      // This second page should never be requested
      singlePage([3]),
    ])
    const paginator = new Paginator<number>({ limit: 2 })
    const items = await collectAll(paginator.iterate(fetcher))
    expect(items).toEqual([1, 2])
    // Fetcher called only once; the guard prevents the second call
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('yields exactly limit items even when page size equals limit', async () => {
    const fetcher = makeMultiPageFetcher([
      pageWithCursor([10, 20], 'next'),
      singlePage([30]),
    ])
    const paginator = new Paginator<number>({ limit: 2, pageSize: 2 })
    const items = await collectAll(paginator.iterate(fetcher))
    expect(items).toEqual([10, 20])
    expect(paginator.getTotalYielded()).toBe(2)
  })
})
