/**
 * L0: DryRunAdapter
 * HTTP-verb-based dry-run adapter.
 * Write methods (POST/PATCH/DELETE) log the intended action without calling the API.
 * Read methods (GET) delegate to the real NotionClientAdapter.
 */

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
  RichTextItem,
} from '../../l1/types/index.js'
import type { NotionId } from '../../l1/types/notion-id.js'
import { NotionClientAdapter, type NotionClientAdapterOptions } from './notion-client-adapter.js'

const DRY_RUN_HEADER = '[DRY RUN] The following API call would be made:'
const DRY_RUN_FOOTER = 'No changes were made.'

function printDryRun(method: string, endpoint: string, payload?: unknown): void {
  process.stderr.write(`${DRY_RUN_HEADER}\n`)
  process.stderr.write(`  Method: ${method} ${endpoint}\n`)
  if (payload !== undefined) {
    process.stderr.write(`  Payload: ${JSON.stringify(payload, null, 2)}\n`)
  }
  process.stderr.write(`${DRY_RUN_FOOTER}\n`)
}

export class DryRunAdapter implements NotionPort {
  private readonly readAdapter: NotionClientAdapter

  constructor(token: string, options: NotionClientAdapterOptions = {}) {
    this.readAdapter = new NotionClientAdapter(token, options)
  }

  // ─── Pages (GET = real, POST/PATCH/DELETE = dry-run) ──────────────────────

  getPage(pageId: NotionId): Promise<PageResult> {
    return this.readAdapter.getPage(pageId)
  }

  async createPage(params: CreatePageParams): Promise<PageResult> {
    printDryRun('POST', '/v1/pages', params)
    return createDryRunPage('dry-run-page-id')
  }

  async updatePage(pageId: NotionId, params: UpdatePageParams): Promise<PageResult> {
    printDryRun('PATCH', `/v1/pages/${pageId.toUuid()}`, params)
    return createDryRunPage(pageId.toUuid())
  }

  async trashPage(pageId: NotionId): Promise<PageResult> {
    printDryRun('PATCH', `/v1/pages/${pageId.toUuid()}`, { in_trash: true })
    return createDryRunPage(pageId.toUuid())
  }

  // ─── Data Sources ───────────────────────────────────────────────────────────

  getDataSource(dataSourceId: NotionId): Promise<DataSourceResult> {
    return this.readAdapter.getDataSource(dataSourceId)
  }

  queryDataSource(dataSourceId: NotionId, params?: QueryParams): AsyncIterable<PageResult> {
    return this.readAdapter.queryDataSource(dataSourceId, params)
  }

  async createDataSource(params: CreateDataSourceParams): Promise<DataSourceResult> {
    printDryRun('POST', '/v1/data_sources', params)
    return createDryRunDataSource('dry-run-data-source-id')
  }

  async updateDataSource(dataSourceId: NotionId, params: UpdateDataSourceParams): Promise<DataSourceResult> {
    printDryRun('PATCH', `/v1/data_sources/${dataSourceId.toUuid()}`, params)
    return createDryRunDataSource(dataSourceId.toUuid())
  }

  async trashDataSource(dataSourceId: NotionId): Promise<DataSourceResult> {
    printDryRun('PATCH', `/v1/databases/${dataSourceId.toUuid()}`, { in_trash: true })
    return createDryRunDataSource(dataSourceId.toUuid())
  }

  listDataSourceTemplates(dataSourceId: NotionId): AsyncIterable<DataSourceTemplate> {
    return this.readAdapter.listDataSourceTemplates(dataSourceId)
  }

  // ─── Blocks ─────────────────────────────────────────────────────────────────

  getBlock(blockId: NotionId): Promise<BlockResult> {
    return this.readAdapter.getBlock(blockId)
  }

  getBlockChildren(blockId: NotionId): AsyncIterable<BlockResult> {
    return this.readAdapter.getBlockChildren(blockId)
  }

  async appendBlockChildren(blockId: NotionId, params: AppendParams): Promise<BlockResult[]> {
    printDryRun('PATCH', `/v1/blocks/${blockId.toUuid()}/children`, params)
    return []
  }

  async updateBlock(blockId: NotionId, params: UpdateBlockParams): Promise<BlockResult> {
    printDryRun('PATCH', `/v1/blocks/${blockId.toUuid()}`, params)
    return createDryRunBlock(blockId.toUuid())
  }

  async deleteBlock(blockId: NotionId): Promise<BlockResult> {
    printDryRun('DELETE', `/v1/blocks/${blockId.toUuid()}`)
    return createDryRunBlock(blockId.toUuid())
  }

  // ─── Search (GET = real) ────────────────────────────────────────────────────

  search(params: SearchParams): AsyncIterable<PageResult | DataSourceResult> {
    return this.readAdapter.search(params)
  }

  // ─── Users (GET = real) ─────────────────────────────────────────────────────

  listUsers(): AsyncIterable<UserResult> {
    return this.readAdapter.listUsers()
  }

  getMe(): Promise<UserResult> {
    return this.readAdapter.getMe()
  }

  getUser(userId: NotionId): Promise<UserResult> {
    return this.readAdapter.getUser(userId)
  }

  // ─── Comments ───────────────────────────────────────────────────────────────

  listComments(parentId: NotionId): AsyncIterable<CommentResult> {
    return this.readAdapter.listComments(parentId)
  }

  async createComment(params: CreateCommentParams): Promise<CommentResult> {
    printDryRun('POST', '/v1/comments', params)
    return createDryRunComment('dry-run-comment-id')
  }

  getComment(commentId: NotionId): Promise<CommentResult> {
    return this.readAdapter.getComment(commentId)
  }

  // ─── Pages (extended) ───────────────────────────────────────────────────────

  async movePage(pageId: NotionId, params: MovePageParams): Promise<PageResult> {
    printDryRun('PATCH', `/v1/pages/${pageId.toUuid()}/move`, params)
    return createDryRunPage(pageId.toUuid())
  }

  getPageProperty(pageId: NotionId, propertyId: string): Promise<PropertyItem> {
    return this.readAdapter.getPageProperty(pageId, propertyId)
  }

  getPagePropertyAll(pageId: NotionId, propertyId: string): AsyncIterable<PropertyItem> {
    return this.readAdapter.getPagePropertyAll(pageId, propertyId)
  }

  getPageMarkdown(pageId: NotionId): Promise<string> {
    return this.readAdapter.getPageMarkdown(pageId)
  }

  async updatePageMarkdown(pageId: NotionId, markdown: string): Promise<PageResult> {
    printDryRun('PATCH', `/v1/pages/${pageId.toUuid()}/markdown`, { markdown })
    return createDryRunPage(pageId.toUuid())
  }
}

// ─── Dry-run Stub Factories ───────────────────────────────────────────────────

function createDryRunPage(id: string): PageResult {
  const now = new Date().toISOString()
  return {
    id,
    object: 'page',
    created_time: now,
    last_edited_time: now,
    archived: false,
    in_trash: false,
    parent: { type: 'workspace', workspace: true },
    properties: {},
    url: `https://notion.so/${id.replace(/-/g, '')}`,
    created_by: { id: 'dry-run-user', object: 'user' },
    last_edited_by: { id: 'dry-run-user', object: 'user' },
    cover: null,
    icon: null,
  }
}

function createDryRunDataSource(id: string): DataSourceResult {
  const now = new Date().toISOString()
  return {
    id,
    object: 'data_source',
    created_time: now,
    last_edited_time: now,
    archived: false,
    in_trash: false,
    title: [],
    description: [],
    properties: {},
    parent: { type: 'workspace', workspace: true },
    url: `https://notion.so/${id.replace(/-/g, '')}`,
    created_by: { id: 'dry-run-user', object: 'user' },
    last_edited_by: { id: 'dry-run-user', object: 'user' },
    cover: null,
    icon: null,
    is_inline: false,
  }
}

function createDryRunBlock(id: string): BlockResult {
  const now = new Date().toISOString()
  return {
    id,
    object: 'block',
    created_time: now,
    last_edited_time: now,
    archived: false,
    in_trash: false,
    has_children: false,
    type: 'paragraph',
    parent: { type: 'workspace', workspace: true },
    created_by: { id: 'dry-run-user', object: 'user' },
    last_edited_by: { id: 'dry-run-user', object: 'user' },
  }
}

function createDryRunComment(id: string): CommentResult {
  const now = new Date().toISOString()
  return {
    id,
    object: 'comment',
    parent: { type: 'page_id', page_id: 'dry-run-page' },
    discussion_id: 'dry-run-discussion',
    created_time: now,
    last_edited_time: now,
    created_by: { id: 'dry-run-user', object: 'user' },
    rich_text: [] as RichTextItem[],
  }
}
