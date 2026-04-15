/**
 * L1: NotionPort interface.
 * Domain contract that L0 adapters must implement.
 * L1 never references L0 (Dependency Inversion Principle).
 */

import type { NotionId } from '../types/notion-id.js'
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
} from '../types/index.js'

export interface NotionPort {
  // ─── Pages ─────────────────────────────────────────────────────────────────

  getPage(pageId: NotionId): Promise<PageResult>
  createPage(params: CreatePageParams): Promise<PageResult>
  updatePage(pageId: NotionId, params: UpdatePageParams): Promise<PageResult>
  trashPage(pageId: NotionId): Promise<PageResult>

  // ─── Data Sources ───────────────────────────────────────────────────────────
  // Terminology: "data source" (NOT "database") per API version 2026-03-11

  getDataSource(dataSourceId: NotionId): Promise<DataSourceResult>
  queryDataSource(dataSourceId: NotionId, params?: QueryParams): AsyncIterable<PageResult>
  createDataSource(params: CreateDataSourceParams): Promise<DataSourceResult>
  updateDataSource(dataSourceId: NotionId, params: UpdateDataSourceParams): Promise<DataSourceResult>
  listDataSourceTemplates(dataSourceId: NotionId): AsyncIterable<DataSourceTemplate>
  trashDataSource(dataSourceId: NotionId): Promise<DataSourceResult>

  // ─── Blocks ─────────────────────────────────────────────────────────────────

  getBlock(blockId: NotionId): Promise<BlockResult>
  getBlockChildren(blockId: NotionId): AsyncIterable<BlockResult>
  appendBlockChildren(blockId: NotionId, params: AppendParams): Promise<BlockResult[]>
  updateBlock(blockId: NotionId, params: UpdateBlockParams): Promise<BlockResult>
  deleteBlock(blockId: NotionId): Promise<BlockResult>

  // ─── Search ─────────────────────────────────────────────────────────────────

  search(params: SearchParams): AsyncIterable<PageResult | DataSourceResult>

  // ─── Users ──────────────────────────────────────────────────────────────────

  listUsers(): AsyncIterable<UserResult>
  getMe(): Promise<UserResult>
  getUser(userId: NotionId): Promise<UserResult>

  // ─── Comments ───────────────────────────────────────────────────────────────

  listComments(parentId: NotionId): AsyncIterable<CommentResult>
  createComment(params: CreateCommentParams): Promise<CommentResult>
  getComment(commentId: NotionId): Promise<CommentResult>

  // NOTE: block move is NOT supported by the Notion API (no blocks.move endpoint).

  // ─── Pages (extended) ───────────────────────────────────────────────────────

  movePage(pageId: NotionId, params: MovePageParams): Promise<PageResult>
  getPageProperty(pageId: NotionId, propertyId: string): Promise<PropertyItem>
  getPagePropertyAll(pageId: NotionId, propertyId: string): AsyncIterable<PropertyItem>
  getPageMarkdown(pageId: NotionId): Promise<string>
  updatePageMarkdown(pageId: NotionId, markdown: string): Promise<PageResult>
}
