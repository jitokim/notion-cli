/**
 * L0: NotionClientAdapter
 * Wraps the @notionhq/client SDK to implement the NotionPort interface.
 * Responsible for SDK Error → DomainException conversion.
 */

import { Client } from '@notionhq/client'
import type { NotionPort } from '../../l1/ports/notion-port.js'
import type {
  PageResult,
  DataSourceResult,
  BlockResult,
  UserResult,
  CreatePageParams,
  UpdatePageParams,
  CreateDataSourceParams,
  QueryParams,
  AppendParams,
  UpdateBlockParams,
  SearchParams,
  CommentResult,
  CreateCommentParams,
  MovePageParams,
  PropertyItem,
  UpdateDataSourceParams,
  DataSourceTemplate,
} from '../../l1/types/index.js'
import type { NotionId } from '../../l1/types/notion-id.js'
import { Paginator } from '../../l1/pagination/index.js'
import { mapSdkError } from './error-mapper.js'
import { RetryPolicy, type RetryPolicyOptions } from './retry-policy.js'
import { logger } from '../logger/index.js'

const NOTION_API_VERSION = '2025-09-03'
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000

export interface NotionClientAdapterOptions {
  retry?: RetryPolicyOptions
  timeoutMs?: number
}

export class NotionClientAdapter implements NotionPort {
  private readonly client: Client
  private readonly retryPolicy: RetryPolicy

  constructor(token: string, options: NotionClientAdapterOptions = {}) {
    const envTimeoutRaw = process.env['NOTION_TIMEOUT_MS']
    const envTimeout = envTimeoutRaw !== undefined ? Number(envTimeoutRaw) : undefined
    const timeoutMs = options.timeoutMs
      ?? (envTimeout !== undefined && !isNaN(envTimeout) && envTimeout > 0
        ? envTimeout
        : DEFAULT_REQUEST_TIMEOUT_MS)
    this.client = new Client({
      auth: token,
      notionVersion: NOTION_API_VERSION,
      timeoutMs,
      // Disable SDK's built-in retry (default maxRetries=2) to prevent
      // double-retry with our RetryPolicy (SDK 2× + ours 3× = 6× worst case)
      retry: false,
    })

    // Always write retry messages to stderr (safe in pipe scenarios since stderr != stdout)
    const onRetry = (attempt: number, maxAttempts: number, delayMs: number) => {
      process.stderr.write(
        `Retrying (${attempt}/${maxAttempts})... waiting ${Math.round(delayMs / 1000)}s\n`
      )
    }

    this.retryPolicy = new RetryPolicy({
      ...options.retry,
      onRetry: options.retry?.onRetry ?? onRetry,
    })
  }

  // ─── Pages ─────────────────────────────────────────────────────────────────

  async getPage(pageId: NotionId): Promise<PageResult> {
    logger.debug({ pageId: pageId.toUuid() }, 'getPage')
    return this.withRetry(() =>
      this.client.pages.retrieve({ page_id: pageId.toUuid() })
    ) as Promise<PageResult>
  }

  async createPage(params: CreatePageParams): Promise<PageResult> {
    logger.debug({ params }, 'createPage')
    const parent =
      params.parentType === 'database'
        ? { database_id: params.parentId }
        : { page_id: params.parentId }

    const properties: Record<string, unknown> = params.properties ?? {}
    // Set title property
    if (params.title) {
      properties['title'] = {
        title: [{ text: { content: params.title } }],
      }
    }

    return this.withRetry(() =>
      this.client.pages.create({ parent, properties } as Parameters<typeof this.client.pages.create>[0])
    ) as Promise<PageResult>
  }

  async updatePage(pageId: NotionId, params: UpdatePageParams): Promise<PageResult> {
    logger.debug({ pageId: pageId.toUuid(), params }, 'updatePage')
    const properties: Record<string, unknown> = params.properties ?? {}

    if (params.title) {
      properties['title'] = {
        title: [{ text: { content: params.title } }],
      }
    }

    return this.withRetry(() =>
      this.client.pages.update({
        page_id: pageId.toUuid(),
        properties,
        ...(params.archived !== undefined ? { archived: params.archived } : {}),
      } as Parameters<typeof this.client.pages.update>[0])
    ) as Promise<PageResult>
  }

  async trashPage(pageId: NotionId): Promise<PageResult> {
    logger.debug({ pageId: pageId.toUuid() }, 'trashPage')
    return this.withRetry(() =>
      this.client.pages.update({
        page_id: pageId.toUuid(),
        in_trash: true,
      } as Parameters<typeof this.client.pages.update>[0])
    ) as Promise<PageResult>
  }

  // ─── Data Sources ───────────────────────────────────────────────────────────
  // SDK namespace mapping for API v2025-09-03+:
  //   - Read/Query/Update: dataSources.* (newer API surface)
  //   - Create/Trash: databases.* (legacy endpoint required by current SDK)

  async getDataSource(dataSourceId: NotionId): Promise<DataSourceResult> {
    logger.debug({ dataSourceId: dataSourceId.toUuid() }, 'getDataSource')
    return this.withRetry(() =>
      this.client.dataSources.retrieve({ data_source_id: dataSourceId.toUuid() })
    ) as unknown as Promise<DataSourceResult>
  }

  async *queryDataSource(
    dataSourceId: NotionId,
    params: QueryParams = {}
  ): AsyncIterable<PageResult> {
    logger.debug({ dataSourceId: dataSourceId.toUuid(), params }, 'queryDataSource')
    const paginator = new Paginator({
      limit: params.pageSize,
      startCursor: params.startCursor,
    })

    const fetcher = async (cursor?: string, pageSize?: number): Promise<{ results: unknown[]; next_cursor: string | null; has_more: boolean }> => {
      return this.withRetry(() =>
        this.client.dataSources.query({
          data_source_id: dataSourceId.toUuid(),
          ...(params.filter ? { filter: params.filter as Parameters<typeof this.client.dataSources.query>[0]['filter'] } : {}),
          ...(params.sorts ? { sorts: params.sorts as Parameters<typeof this.client.dataSources.query>[0]['sorts'] } : {}),
          ...(cursor ? { start_cursor: cursor } : {}),
          ...(pageSize ? { page_size: pageSize } : {}),
        })
      ) as Promise<{ results: unknown[]; next_cursor: string | null; has_more: boolean }>
    }

    yield* paginator.iterate(fetcher) as AsyncGenerator<PageResult>
  }

  async createDataSource(params: CreateDataSourceParams): Promise<DataSourceResult> {
    logger.debug({ params }, 'createDataSource')
    // API v2025-09-03+: use databases.create (not dataSources.create) for DB creation
    // SDK types don't match our domain types — safe cast verified by integration test
    return this.withRetry(() =>
      this.client.databases.create({
        parent: { type: 'page_id', page_id: params.parentId },
        title: [{ type: 'text', text: { content: params.title } }],
        properties: params.properties ?? { Name: { title: {} } },
      } as unknown as Parameters<typeof this.client.databases.create>[0])
    ) as unknown as Promise<DataSourceResult>
  }

  // ─── Blocks ─────────────────────────────────────────────────────────────────

  async getBlock(blockId: NotionId): Promise<BlockResult> {
    logger.debug({ blockId: blockId.toUuid() }, 'getBlock')
    return this.withRetry(() =>
      this.client.blocks.retrieve({ block_id: blockId.toUuid() })
    ) as Promise<BlockResult>
  }

  async *getBlockChildren(blockId: NotionId): AsyncIterable<BlockResult> {
    logger.debug({ blockId: blockId.toUuid() }, 'getBlockChildren')
    const paginator = new Paginator()

    const fetcher = async (cursor?: string, pageSize?: number): Promise<{ results: unknown[]; next_cursor: string | null; has_more: boolean }> => {
      return this.withRetry(() =>
        this.client.blocks.children.list({
          block_id: blockId.toUuid(),
          ...(cursor ? { start_cursor: cursor } : {}),
          ...(pageSize ? { page_size: pageSize } : {}),
        })
      ) as Promise<{ results: unknown[]; next_cursor: string | null; has_more: boolean }>
    }

    yield* paginator.iterate(fetcher) as AsyncGenerator<BlockResult>
  }

  async appendBlockChildren(
    blockId: NotionId,
    params: AppendParams
  ): Promise<BlockResult[]> {
    logger.debug({ blockId: blockId.toUuid() }, 'appendBlockChildren')

    const children = params.children.map((child) => buildBlock(child))

    const result = await this.withRetry(() =>
      this.client.blocks.children.append({
        block_id: blockId.toUuid(),
        children: children as Parameters<typeof this.client.blocks.children.append>[0]['children'],
        ...(params.after ? { after: params.after } : {}),
      })
    )

    return (result as { results: BlockResult[] }).results
  }

  async updateBlock(blockId: NotionId, params: UpdateBlockParams): Promise<BlockResult> {
    logger.debug({ blockId: blockId.toUuid(), params }, 'updateBlock')
    const blockType = params.type ?? 'paragraph'
    const update = {
      block_id: blockId.toUuid(),
      [blockType]: {
        rich_text: [{ type: 'text', text: { content: params.content } }],
      },
    }

    return this.withRetry(() =>
      this.client.blocks.update(update as Parameters<typeof this.client.blocks.update>[0])
    ) as Promise<BlockResult>
  }

  async deleteBlock(blockId: NotionId): Promise<BlockResult> {
    logger.debug({ blockId: blockId.toUuid() }, 'deleteBlock')
    return this.withRetry(() =>
      this.client.blocks.delete({ block_id: blockId.toUuid() })
    ) as Promise<BlockResult>
  }

  // ─── Search ─────────────────────────────────────────────────────────────────

  async *search(params: SearchParams): AsyncIterable<PageResult | DataSourceResult> {
    logger.debug({ params }, 'search')
    const paginator = new Paginator({
      startCursor: params.startCursor,
      limit: params.pageSize,
    })

    // SDK search filter value: 'data_source' (NOT 'database')
    const sdkFilter = params.filter
      ? {
          property: params.filter.property,
          value: params.filter.value === 'database' ? ('data_source' as const) : (params.filter.value as 'page' | 'data_source'),
        }
      : undefined

    const fetcher = async (cursor?: string, pageSize?: number): Promise<{ results: unknown[]; next_cursor: string | null; has_more: boolean }> => {
      return this.withRetry(() =>
        this.client.search({
          query: params.query,
          ...(sdkFilter ? { filter: sdkFilter } : {}),
          ...(params.sort ? { sort: params.sort } : {}),
          ...(cursor ? { start_cursor: cursor } : {}),
          ...(pageSize ? { page_size: pageSize } : {}),
        })
      ) as Promise<{ results: unknown[]; next_cursor: string | null; has_more: boolean }>
    }

    yield* paginator.iterate(fetcher) as AsyncGenerator<PageResult | DataSourceResult>
  }

  // ─── Users ──────────────────────────────────────────────────────────────────

  async *listUsers(): AsyncIterable<UserResult> {
    logger.debug('listUsers')
    const paginator = new Paginator()

    const fetcher = async (cursor?: string, pageSize?: number): Promise<{ results: unknown[]; next_cursor: string | null; has_more: boolean }> => {
      return this.withRetry(() =>
        this.client.users.list({
          ...(cursor ? { start_cursor: cursor } : {}),
          ...(pageSize ? { page_size: pageSize } : {}),
        })
      ) as Promise<{ results: unknown[]; next_cursor: string | null; has_more: boolean }>
    }

    yield* paginator.iterate(fetcher) as AsyncGenerator<UserResult>
  }

  async getMe(): Promise<UserResult> {
    logger.debug('getMe')
    return this.withRetry(() => this.client.users.me({})) as Promise<UserResult>
  }

  async getUser(userId: NotionId): Promise<UserResult> {
    logger.debug({ userId: userId.toUuid() }, 'getUser')
    return this.withRetry(() =>
      this.client.users.retrieve({ user_id: userId.toUuid() })
    ) as Promise<UserResult>
  }

  // ─── Comments ───────────────────────────────────────────────────────────────

  async *listComments(parentId: NotionId): AsyncIterable<CommentResult> {
    logger.debug({ parentId: parentId.toUuid() }, 'listComments')
    const paginator = new Paginator()

    const fetcher = async (cursor?: string, pageSize?: number): Promise<{ results: unknown[]; next_cursor: string | null; has_more: boolean }> => {
      return this.withRetry(() =>
        this.client.comments.list({
          block_id: parentId.toUuid(),
          ...(cursor ? { start_cursor: cursor } : {}),
          ...(pageSize ? { page_size: pageSize } : {}),
        })
      ) as Promise<{ results: unknown[]; next_cursor: string | null; has_more: boolean }>
    }

    yield* paginator.iterate(fetcher) as AsyncGenerator<CommentResult>
  }

  async createComment(params: CreateCommentParams): Promise<CommentResult> {
    logger.debug(
      { parentId: params.parentId, parentType: params.parentType, discussionId: params.discussionId },
      'createComment'
    )
    const rich_text = [{ type: 'text' as const, text: { content: params.richText } }]

    if (params.discussionId) {
      return this.withRetry(() =>
        this.client.comments.create({
          discussion_id: params.discussionId!,
          rich_text,
        })
      ) as unknown as Promise<CommentResult>
    }

    const parent = params.parentType === 'page'
      ? { page_id: params.parentId }
      : { block_id: params.parentId }

    return this.withRetry(() =>
      this.client.comments.create({
        parent,
        rich_text,
      } as Parameters<typeof this.client.comments.create>[0])
    ) as unknown as Promise<CommentResult>
  }

  async getComment(commentId: NotionId): Promise<CommentResult> {
    return this.withRetry(async () => {
      const response = await this.client.comments.retrieve({
        comment_id: commentId.toUuid(),
      })
      return response as unknown as CommentResult
    })
  }

  // ─── Pages (extended) ───────────────────────────────────────────────────────

  async movePage(pageId: NotionId, params: MovePageParams): Promise<PageResult> {
    logger.debug({ pageId: pageId.toUuid(), params }, 'movePage')
    const parent = params.parentType === 'database'
      ? { database_id: params.parentId }
      : { page_id: params.parentId }

    return this.withRetry(() =>
      this.client.pages.move({
        page_id: pageId.toUuid(),
        parent,
      } as Parameters<typeof this.client.pages.move>[0])
    ) as Promise<PageResult>
  }

  async getPageProperty(pageId: NotionId, propertyId: string): Promise<PropertyItem> {
    logger.debug({ pageId: pageId.toUuid(), propertyId }, 'getPageProperty')
    return this.withRetry(() =>
      this.client.pages.properties.retrieve({
        page_id: pageId.toUuid(),
        property_id: propertyId,
      })
    ) as unknown as Promise<PropertyItem>
  }

  async *getPagePropertyAll(pageId: NotionId, propertyId: string): AsyncIterable<PropertyItem> {
    logger.debug({ pageId: pageId.toUuid(), propertyId }, 'getPagePropertyAll')

    let cursor: string | undefined = undefined
    while (true) {
      const response = await this.withRetry(() =>
        this.client.pages.properties.retrieve({
          page_id: pageId.toUuid(),
          property_id: propertyId,
          ...(cursor ? { start_cursor: cursor } : {}),
        })
      ) as Record<string, unknown>

      // If it's a simple property_item (not paginated), yield it and stop
      if (response['object'] === 'property_item') {
        yield response as unknown as PropertyItem
        return
      }

      if (response['object'] !== 'list') {
        logger.warn({ object: response['object'], propertyId }, 'Unexpected property response type')
        return
      }

      // It's a paginated list response
      const results = (response['results'] ?? []) as PropertyItem[]
      for (const item of results) {
        yield item
      }

      if (!response['has_more'] || !response['next_cursor']) break
      cursor = response['next_cursor'] as string
    }
  }

  async getPageMarkdown(pageId: NotionId): Promise<string> {
    logger.debug({ pageId: pageId.toUuid() }, 'getPageMarkdown')
    const result = await this.withRetry(() =>
      this.client.pages.retrieveMarkdown({ page_id: pageId.toUuid() })
    )
    return (result as { markdown: string }).markdown
  }

  async updatePageMarkdown(pageId: NotionId, markdown: string): Promise<PageResult> {
    logger.debug({ pageId: pageId.toUuid() }, 'updatePageMarkdown')
    return this.withRetry(() =>
      this.client.pages.updateMarkdown({
        page_id: pageId.toUuid(),
        type: 'replace_content',
        replace_content: { new_str: markdown },
      })
    ) as unknown as Promise<PageResult>
  }

  // ─── Data Sources (extended) ─────────────────────────────────────────────────

  async updateDataSource(dataSourceId: NotionId, params: UpdateDataSourceParams): Promise<DataSourceResult> {
    logger.debug({ dataSourceId: dataSourceId.toUuid(), params }, 'updateDataSource')
    const updateParams: Record<string, unknown> = {
      data_source_id: dataSourceId.toUuid(),
    }
    if (params.title !== undefined) {
      updateParams['title'] = [{ type: 'text', text: { content: params.title } }]
    }
    if (params.description !== undefined) {
      updateParams['description'] = [{ type: 'text', text: { content: params.description } }]
    }
    if (params.properties !== undefined) {
      updateParams['properties'] = params.properties
    }

    return this.withRetry(() =>
      this.client.dataSources.update(updateParams as Parameters<typeof this.client.dataSources.update>[0])
    ) as unknown as Promise<DataSourceResult>
  }

  async trashDataSource(dataSourceId: NotionId): Promise<DataSourceResult> {
    logger.debug({ dataSourceId: dataSourceId.toUuid() }, 'trashDataSource')
    // Use databases.update (not dataSources.update) for API v2025-09-03+ compat
    // SDK types don't match our domain types — safe cast verified by integration test
    return this.withRetry(() =>
      this.client.databases.update({
        database_id: dataSourceId.toUuid(),
        in_trash: true,
      } as unknown as Parameters<typeof this.client.databases.update>[0])
    ) as unknown as Promise<DataSourceResult>
  }

  async *listDataSourceTemplates(dataSourceId: NotionId): AsyncIterable<DataSourceTemplate> {
    logger.debug({ dataSourceId: dataSourceId.toUuid() }, 'listDataSourceTemplates')

    let cursor: string | null | undefined = undefined
    while (true) {
      const response = await this.withRetry(() =>
        this.client.dataSources.listTemplates({
          data_source_id: dataSourceId.toUuid(),
          ...(cursor ? { start_cursor: cursor } : {}),
        } as Parameters<typeof this.client.dataSources.listTemplates>[0])
      ) as { templates: DataSourceTemplate[]; has_more: boolean; next_cursor: string | null }

      for (const template of response.templates) {
        yield template
      }

      if (!response.has_more || !response.next_cursor) break
      cursor = response.next_cursor
    }
  }

  // ─── Private Helpers ────────────────────────────────────────────────────────

  private async withRetry<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await this.retryPolicy.execute(operation)
    } catch (error) {
      throw mapSdkError(error)
    }
  }
}

/** Converts BlockContent to Notion API block format */
function buildBlock(content: { type: string; content: string; language?: string }): Record<string, unknown> {
  const richText = [{ type: 'text', text: { content: content.content } }]

  if (content.type === 'code') {
    return {
      type: 'code',
      code: {
        rich_text: richText,
        language: content.language ?? 'plain text',
      },
    }
  }

  return {
    type: content.type,
    [content.type]: { rich_text: richText },
  }
}
