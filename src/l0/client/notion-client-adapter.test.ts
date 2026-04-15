/**
 * Tests for NotionClientAdapter — new methods added in feature release
 *
 * Coverage targets:
 *   - trashDataSource: calls databases.update with in_trash: true
 *   - getPagePropertyAll: pagination logic (simple property_item vs list, cursor handling)
 *   - createDataSource: parent formatted as { type: 'page_id', page_id: ... }
 *
 * Strategy: vi.mock('@notionhq/client') to intercept SDK calls.
 * RetryPolicy is given baseDelayMs: 0 / maxAttempts: 1 via options to skip
 * real delays and avoid flakiness.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { APIResponseError } from '@notionhq/client'
import { NotionClientAdapter } from './notion-client-adapter.js'
import { NotionId } from '../../l1/types/notion-id.js'
import {
  NotFoundError,
  AuthenticationError,
  RateLimitError,
} from '../../l1/errors/index.js'

// ─── SDK Mock ─────────────────────────────────────────────────────────────────

// vi.mock is hoisted to the top of the file, so mock functions must be
// created via vi.hoisted() to be accessible inside the factory closure.
const { mockDatabasesUpdate, mockDatabasesCreate, mockPagesPropertiesRetrieve } = vi.hoisted(() => ({
  mockDatabasesUpdate: vi.fn(),
  mockDatabasesCreate: vi.fn(),
  mockPagesPropertiesRetrieve: vi.fn(),
}))

vi.mock('@notionhq/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@notionhq/client')>()

  const MockClient = vi.fn().mockImplementation(() => ({
    databases: {
      update: mockDatabasesUpdate,
      create: mockDatabasesCreate,
    },
    pages: {
      properties: {
        retrieve: mockPagesPropertiesRetrieve,
      },
    },
  }))

  return { ...actual, Client: MockClient }
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

const FAKE_UUID = '12345678-1234-1234-1234-123456789abc'
const FAKE_TOKEN = 'secret_test_token'

function makeAdapter(): NotionClientAdapter {
  return new NotionClientAdapter(FAKE_TOKEN, {
    retry: { baseDelayMs: 0, maxDelayMs: 0, maxAttempts: 1 },
  })
}

function makeNotionId(uuid = FAKE_UUID): NotionId {
  return NotionId.parse(uuid)
}

function makeApiResponseError(status: number, message = 'error', code = 'unknown'): APIResponseError {
  return new APIResponseError({
    status,
    message,
    code: code as never,
    headers: {} as never,
    rawBodyText: '',
  })
}

function makeDataSourceResult(id: string, inTrash = false): Record<string, unknown> {
  return {
    id,
    object: 'database',
    created_time: '2024-01-01T00:00:00.000Z',
    last_edited_time: '2024-01-01T00:00:00.000Z',
    archived: inTrash,
    in_trash: inTrash,
    title: [],
    description: [],
    properties: {},
    parent: { type: 'page_id', page_id: FAKE_UUID },
    url: `https://notion.so/${id.replace(/-/g, '')}`,
    created_by: { id: 'user-1', object: 'user' },
    last_edited_by: { id: 'user-1', object: 'user' },
    cover: null,
    icon: null,
    is_inline: false,
  }
}

function makePropertyItem(id = 'prop-1', type = 'title'): Record<string, unknown> {
  return {
    object: 'property_item',
    id,
    type,
    [type]: {},
  }
}

function makePaginatedListResponse(
  items: Record<string, unknown>[],
  hasMore: boolean,
  nextCursor: string | null = null
): Record<string, unknown> {
  return {
    object: 'list',
    results: items,
    has_more: hasMore,
    next_cursor: nextCursor,
    type: 'property_item',
    property_item: {},
  }
}

// Reset mocks before each test
beforeEach(() => {
  vi.clearAllMocks()
})

// ─── trashDataSource ─────────────────────────────────────────────────────────

describe('NotionClientAdapter.trashDataSource()', () => {
  it('calls databases.update with database_id and in_trash: true', async () => {
    const adapter = makeAdapter()
    const id = makeNotionId()
    mockDatabasesUpdate.mockResolvedValueOnce(makeDataSourceResult(FAKE_UUID, true))

    await adapter.trashDataSource(id)

    expect(mockDatabasesUpdate).toHaveBeenCalledTimes(1)
    const callArg = mockDatabasesUpdate.mock.calls[0][0] as Record<string, unknown>
    expect(callArg['database_id']).toBe(FAKE_UUID)
    expect(callArg['in_trash']).toBe(true)
  })

  it('returns the DataSourceResult from the API response', async () => {
    const adapter = makeAdapter()
    const id = makeNotionId()
    const expected = makeDataSourceResult(FAKE_UUID, true)
    mockDatabasesUpdate.mockResolvedValueOnce(expected)

    const result = await adapter.trashDataSource(id)

    expect(result).toEqual(expected)
  })

  it('throws NotFoundError when database_id does not exist (404)', async () => {
    const adapter = makeAdapter()
    const id = makeNotionId()
    mockDatabasesUpdate.mockRejectedValueOnce(
      makeApiResponseError(404, 'Could not find database', 'object_not_found')
    )

    await expect(adapter.trashDataSource(id)).rejects.toThrow(NotFoundError)
  })

  it('throws AuthenticationError on 401 response', async () => {
    const adapter = makeAdapter()
    const id = makeNotionId()
    mockDatabasesUpdate.mockRejectedValueOnce(
      makeApiResponseError(401, 'Unauthorized', 'unauthorized')
    )

    await expect(adapter.trashDataSource(id)).rejects.toThrow(AuthenticationError)
  })

  it('throws RateLimitError on 429 response (after exhausting retries)', async () => {
    // maxAttempts: 1 means no retry — first failure is thrown immediately
    const adapter = makeAdapter()
    const id = makeNotionId()
    mockDatabasesUpdate.mockRejectedValueOnce(
      makeApiResponseError(429, 'Rate limited', 'rate_limited')
    )

    await expect(adapter.trashDataSource(id)).rejects.toThrow(RateLimitError)
  })

  it('does NOT call databases.update with in_trash: false', async () => {
    // Ensure no accidental restore-from-trash behavior
    const adapter = makeAdapter()
    const id = makeNotionId()
    mockDatabasesUpdate.mockResolvedValueOnce(makeDataSourceResult(FAKE_UUID, true))

    await adapter.trashDataSource(id)

    const callArg = mockDatabasesUpdate.mock.calls[0][0] as Record<string, unknown>
    expect(callArg['in_trash']).not.toBe(false)
  })

  it('uses the exact UUID string from NotionId.toUuid()', async () => {
    const adapter = makeAdapter()
    const differentUuid = 'aaaabbbb-cccc-dddd-eeee-ffffaaaabbbb'
    const id = makeNotionId(differentUuid)
    mockDatabasesUpdate.mockResolvedValueOnce(makeDataSourceResult(differentUuid, true))

    await adapter.trashDataSource(id)

    const callArg = mockDatabasesUpdate.mock.calls[0][0] as Record<string, unknown>
    expect(callArg['database_id']).toBe(differentUuid)
  })
})

// ─── createDataSource ─────────────────────────────────────────────────────────

describe('NotionClientAdapter.createDataSource()', () => {
  it('calls databases.create with parent formatted as { type: "page_id", page_id }', async () => {
    const adapter = makeAdapter()
    const parentId = FAKE_UUID
    mockDatabasesCreate.mockResolvedValueOnce(makeDataSourceResult(FAKE_UUID))

    await adapter.createDataSource({
      parentId,
      parentType: 'page',
      title: 'Test DB',
    })

    expect(mockDatabasesCreate).toHaveBeenCalledTimes(1)
    const callArg = mockDatabasesCreate.mock.calls[0][0] as Record<string, unknown>
    expect(callArg['parent']).toEqual({ type: 'page_id', page_id: parentId })
  })

  it('sets parent.type to "page_id" regardless of CreateDataSourceParams.parentType', async () => {
    // The adapter always uses databases.create with page_id parent format
    const adapter = makeAdapter()
    mockDatabasesCreate.mockResolvedValueOnce(makeDataSourceResult(FAKE_UUID))

    await adapter.createDataSource({
      parentId: FAKE_UUID,
      parentType: 'database',  // even if caller passes 'database', adapter uses page_id
      title: 'Test DB',
    })

    const callArg = mockDatabasesCreate.mock.calls[0][0] as Record<string, unknown>
    const parent = callArg['parent'] as Record<string, unknown>
    expect(parent['type']).toBe('page_id')
    expect(parent['page_id']).toBe(FAKE_UUID)
  })

  it('includes the title as a rich_text array', async () => {
    const adapter = makeAdapter()
    mockDatabasesCreate.mockResolvedValueOnce(makeDataSourceResult(FAKE_UUID))

    await adapter.createDataSource({
      parentId: FAKE_UUID,
      parentType: 'page',
      title: 'My Database',
    })

    const callArg = mockDatabasesCreate.mock.calls[0][0] as Record<string, unknown>
    const title = callArg['title'] as Array<Record<string, unknown>>
    expect(Array.isArray(title)).toBe(true)
    expect(title[0]).toMatchObject({ type: 'text', text: { content: 'My Database' } })
  })

  it('uses default properties { Name: { title: {} } } when properties not provided', async () => {
    const adapter = makeAdapter()
    mockDatabasesCreate.mockResolvedValueOnce(makeDataSourceResult(FAKE_UUID))

    await adapter.createDataSource({
      parentId: FAKE_UUID,
      parentType: 'page',
      title: 'Test',
    })

    const callArg = mockDatabasesCreate.mock.calls[0][0] as Record<string, unknown>
    expect(callArg['properties']).toEqual({ Name: { title: {} } })
  })

  it('uses caller-provided properties when supplied', async () => {
    const adapter = makeAdapter()
    mockDatabasesCreate.mockResolvedValueOnce(makeDataSourceResult(FAKE_UUID))
    const customProperties = { Status: { select: {} }, Tags: { multi_select: {} } }

    await adapter.createDataSource({
      parentId: FAKE_UUID,
      parentType: 'page',
      title: 'Test',
      properties: customProperties,
    })

    const callArg = mockDatabasesCreate.mock.calls[0][0] as Record<string, unknown>
    expect(callArg['properties']).toEqual(customProperties)
  })

  it('throws NotFoundError when parent page does not exist (404)', async () => {
    const adapter = makeAdapter()
    mockDatabasesCreate.mockRejectedValueOnce(
      makeApiResponseError(404, 'Page not found', 'object_not_found')
    )

    await expect(
      adapter.createDataSource({ parentId: FAKE_UUID, parentType: 'page', title: 'Test' })
    ).rejects.toThrow(NotFoundError)
  })

  it('throws AuthenticationError on 401', async () => {
    const adapter = makeAdapter()
    mockDatabasesCreate.mockRejectedValueOnce(
      makeApiResponseError(401, 'Unauthorized', 'unauthorized')
    )

    await expect(
      adapter.createDataSource({ parentId: FAKE_UUID, parentType: 'page', title: 'Test' })
    ).rejects.toThrow(AuthenticationError)
  })
})

// ─── getPagePropertyAll ───────────────────────────────────────────────────────

describe('NotionClientAdapter.getPagePropertyAll()', () => {
  it('yields the item once and stops when API returns object: "property_item"', async () => {
    const adapter = makeAdapter()
    const pageId = makeNotionId()
    const propertyItem = makePropertyItem('prop-1', 'title')
    mockPagesPropertiesRetrieve.mockResolvedValueOnce(propertyItem)

    const results: unknown[] = []
    for await (const item of adapter.getPagePropertyAll(pageId, 'prop-1')) {
      results.push(item)
    }

    expect(results).toHaveLength(1)
    expect(results[0]).toEqual(propertyItem)
    expect(mockPagesPropertiesRetrieve).toHaveBeenCalledTimes(1)
  })

  it('does NOT call API a second time after simple property_item response', async () => {
    const adapter = makeAdapter()
    const pageId = makeNotionId()
    mockPagesPropertiesRetrieve.mockResolvedValueOnce(makePropertyItem())

    // Consume the generator
    for await (const _ of adapter.getPagePropertyAll(pageId, 'prop-1')) { /* noop */ }

    expect(mockPagesPropertiesRetrieve).toHaveBeenCalledTimes(1)
  })

  it('yields nothing when API returns a list with empty results', async () => {
    const adapter = makeAdapter()
    const pageId = makeNotionId()
    mockPagesPropertiesRetrieve.mockResolvedValueOnce(
      makePaginatedListResponse([], false, null)
    )

    const results: unknown[] = []
    for await (const item of adapter.getPagePropertyAll(pageId, 'prop-1')) {
      results.push(item)
    }

    expect(results).toHaveLength(0)
  })

  it('yields all items from single paginated list (has_more: false)', async () => {
    const adapter = makeAdapter()
    const pageId = makeNotionId()
    const items = [makePropertyItem('p-1'), makePropertyItem('p-2'), makePropertyItem('p-3')]
    mockPagesPropertiesRetrieve.mockResolvedValueOnce(
      makePaginatedListResponse(items, false, null)
    )

    const results: unknown[] = []
    for await (const item of adapter.getPagePropertyAll(pageId, 'prop-1')) {
      results.push(item)
    }

    expect(results).toHaveLength(3)
    expect(results).toEqual(items)
  })

  it('paginates through multiple pages when has_more: true', async () => {
    const adapter = makeAdapter()
    const pageId = makeNotionId()
    const page1Items = [makePropertyItem('p-1'), makePropertyItem('p-2')]
    const page2Items = [makePropertyItem('p-3'), makePropertyItem('p-4')]

    mockPagesPropertiesRetrieve
      .mockResolvedValueOnce(makePaginatedListResponse(page1Items, true, 'cursor-abc'))
      .mockResolvedValueOnce(makePaginatedListResponse(page2Items, false, null))

    const results: unknown[] = []
    for await (const item of adapter.getPagePropertyAll(pageId, 'prop-1')) {
      results.push(item)
    }

    expect(results).toHaveLength(4)
    expect(mockPagesPropertiesRetrieve).toHaveBeenCalledTimes(2)
  })

  it('passes next_cursor as start_cursor on the second call', async () => {
    const adapter = makeAdapter()
    const pageId = makeNotionId()
    const page1Items = [makePropertyItem('p-1')]
    const page2Items = [makePropertyItem('p-2')]

    mockPagesPropertiesRetrieve
      .mockResolvedValueOnce(makePaginatedListResponse(page1Items, true, 'cursor-xyz'))
      .mockResolvedValueOnce(makePaginatedListResponse(page2Items, false, null))

    for await (const _ of adapter.getPagePropertyAll(pageId, 'prop-1')) { /* noop */ }

    const secondCallArg = mockPagesPropertiesRetrieve.mock.calls[1][0] as Record<string, unknown>
    expect(secondCallArg['start_cursor']).toBe('cursor-xyz')
  })

  it('does NOT pass start_cursor on the first call', async () => {
    const adapter = makeAdapter()
    const pageId = makeNotionId()
    mockPagesPropertiesRetrieve.mockResolvedValueOnce(
      makePaginatedListResponse([], false, null)
    )

    for await (const _ of adapter.getPagePropertyAll(pageId, 'prop-1')) { /* noop */ }

    const firstCallArg = mockPagesPropertiesRetrieve.mock.calls[0][0] as Record<string, unknown>
    expect(firstCallArg['start_cursor']).toBeUndefined()
  })

  it('passes page_id and property_id on every call', async () => {
    const adapter = makeAdapter()
    const pageId = makeNotionId()
    const page1Items = [makePropertyItem()]

    mockPagesPropertiesRetrieve
      .mockResolvedValueOnce(makePaginatedListResponse(page1Items, true, 'cursor-1'))
      .mockResolvedValueOnce(makePaginatedListResponse([], false, null))

    for await (const _ of adapter.getPagePropertyAll(pageId, 'my-prop-id')) { /* noop */ }

    for (const call of mockPagesPropertiesRetrieve.mock.calls) {
      const arg = call[0] as Record<string, unknown>
      expect(arg['page_id']).toBe(FAKE_UUID)
      expect(arg['property_id']).toBe('my-prop-id')
    }
  })

  it('stops pagination when has_more is false even if next_cursor is present', async () => {
    // Edge case: API returns has_more: false but still has a next_cursor value
    const adapter = makeAdapter()
    const pageId = makeNotionId()
    mockPagesPropertiesRetrieve.mockResolvedValueOnce(
      makePaginatedListResponse([makePropertyItem()], false, 'stale-cursor')
    )

    for await (const _ of adapter.getPagePropertyAll(pageId, 'prop-1')) { /* noop */ }

    expect(mockPagesPropertiesRetrieve).toHaveBeenCalledTimes(1)
  })

  it('paginates through 3 pages correctly (end-to-end cursor chain)', async () => {
    const adapter = makeAdapter()
    const pageId = makeNotionId()

    mockPagesPropertiesRetrieve
      .mockResolvedValueOnce(makePaginatedListResponse([makePropertyItem('p-1')], true, 'cur-1'))
      .mockResolvedValueOnce(makePaginatedListResponse([makePropertyItem('p-2')], true, 'cur-2'))
      .mockResolvedValueOnce(makePaginatedListResponse([makePropertyItem('p-3')], false, null))

    const results: unknown[] = []
    for await (const item of adapter.getPagePropertyAll(pageId, 'prop-1')) {
      results.push(item)
    }

    expect(results).toHaveLength(3)
    expect(mockPagesPropertiesRetrieve).toHaveBeenCalledTimes(3)
    // Verify cursor chain
    const secondArg = mockPagesPropertiesRetrieve.mock.calls[1][0] as Record<string, unknown>
    const thirdArg = mockPagesPropertiesRetrieve.mock.calls[2][0] as Record<string, unknown>
    expect(secondArg['start_cursor']).toBe('cur-1')
    expect(thirdArg['start_cursor']).toBe('cur-2')
  })

  it('throws NotFoundError on 404 from API during pagination', async () => {
    const adapter = makeAdapter()
    const pageId = makeNotionId()
    mockPagesPropertiesRetrieve.mockRejectedValueOnce(
      makeApiResponseError(404, 'Page not found', 'object_not_found')
    )

    await expect(async () => {
      for await (const _ of adapter.getPagePropertyAll(pageId, 'prop-1')) { /* noop */ }
    }).rejects.toThrow(NotFoundError)
  })

  it('throws AuthenticationError on 401 from API', async () => {
    const adapter = makeAdapter()
    const pageId = makeNotionId()
    mockPagesPropertiesRetrieve.mockRejectedValueOnce(
      makeApiResponseError(401, 'Unauthorized', 'unauthorized')
    )

    await expect(async () => {
      for await (const _ of adapter.getPagePropertyAll(pageId, 'prop-1')) { /* noop */ }
    }).rejects.toThrow(AuthenticationError)
  })
})

// ─── MoveBlock dead code check ─────────────────────────────────────────────────

describe('MoveBlock removal verification', () => {
  it('NotionClientAdapter does not have a moveBlock method', () => {
    const adapter = makeAdapter()
    expect((adapter as unknown as Record<string, unknown>)['moveBlock']).toBeUndefined()
  })
})
