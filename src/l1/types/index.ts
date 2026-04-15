/**
 * L1: Domain Types
 * Notion API response types and command parameter types.
 */

export { NotionId } from './notion-id.js'

// ─── Resource Result Types ────────────────────────────────────────────────────

/** Page retrieve/create/update result */
export interface PageResult {
  id: string
  object: 'page'
  created_time: string
  last_edited_time: string
  archived: boolean
  in_trash: boolean
  parent: ParentRef
  properties: Record<string, PropertyValue>
  url: string
  created_by: PartialUser
  last_edited_by: PartialUser
  cover: FileObject | null
  icon: IconObject | null
}

/** Data source (database) retrieve/create result */
export interface DataSourceResult {
  id: string
  object: 'data_source' | 'database'
  created_time: string
  last_edited_time: string
  archived: boolean
  in_trash: boolean
  title: RichTextItem[]
  description: RichTextItem[]
  properties: Record<string, PropertySchema>
  parent: ParentRef
  url: string
  created_by: PartialUser
  last_edited_by: PartialUser
  cover: FileObject | null
  icon: IconObject | null
  is_inline: boolean
}

/** Block retrieve/append result */
export interface BlockResult {
  id: string
  object: 'block'
  created_time: string
  last_edited_time: string
  archived: boolean
  in_trash: boolean
  has_children: boolean
  type: string
  parent: ParentRef
  created_by: PartialUser
  last_edited_by: PartialUser
  [blockType: string]: unknown
}

/** User retrieve result */
export interface UserResult {
  id: string
  object: 'user'
  type: 'person' | 'bot'
  name: string | null
  avatar_url: string | null
  person?: { email: string }
  bot?: {
    owner: { type: string; workspace?: boolean }
    workspace_name: string | null
  }
}

// ─── Pagination ───────────────────────────────────────────────────────────────

/** Common Notion API paginated response structure */
export interface PaginatedResponse<T> {
  object: 'list'
  results: T[]
  next_cursor: string | null
  has_more: boolean
  type?: string
}

// ─── Command Params ───────────────────────────────────────────────────────────

/** Search command parameters */
export interface SearchParams {
  query: string
  filter?: {
    property: 'object'
    value: 'page' | 'database'
  }
  sort?: {
    direction: 'ascending' | 'descending'
    timestamp: 'last_edited_time'
  }
  startCursor?: string
  pageSize?: number
}

/** Database query command parameters */
export interface QueryParams {
  filter?: Record<string, unknown>
  sorts?: Array<Record<string, unknown>>
  startCursor?: string
  pageSize?: number
}

/** Block append command parameters */
export interface AppendParams {
  children: BlockContent[]
  after?: string
}

/** Text block content */
export interface BlockContent {
  type: 'paragraph' | 'heading_1' | 'heading_2' | 'heading_3' | 'bulleted_list_item' | 'numbered_list_item' | 'to_do' | 'code'
  content: string
  language?: string
}

/** Page create command parameters */
export interface CreatePageParams {
  parentId: string
  parentType: 'page' | 'database'
  title: string
  properties?: Record<string, unknown>
}

/** Page update command parameters */
export interface UpdatePageParams {
  title?: string
  properties?: Record<string, unknown>
  archived?: boolean
}

/** Data source create command parameters */
export interface CreateDataSourceParams {
  parentId: string
  parentType: 'page'
  title: string
  properties?: Record<string, unknown>
}

/** Block update command parameters */
export interface UpdateBlockParams {
  content: string
  type?: string
}

/** Comment retrieve result */
export interface CommentResult {
  id: string
  object: 'comment'
  parent: { type: 'page_id'; page_id: string } | { type: 'block_id'; block_id: string }
  discussion_id: string
  created_time: string
  last_edited_time: string
  created_by: PartialUser
  rich_text: RichTextItem[]
}

/** Comment create command parameters */
export interface CreateCommentParams {
  richText: string
  // New comment: specify parent
  parentId?: string
  parentType?: 'page' | 'block'
  // Reply: specify discussion thread
  discussionId?: string
}

/** Page move command parameters */
export interface MovePageParams {
  parentId: string
  parentType: 'page' | 'database'
}

/** Page property item result */
export interface PropertyItem {
  object: 'property_item' | 'list'
  id: string
  type: string
  [key: string]: unknown
}

/** Data source update command parameters */
export interface UpdateDataSourceParams {
  title?: string
  description?: string
  properties?: Record<string, unknown>
}

/** data source template */
export interface DataSourceTemplate {
  id: string
  name: string
  is_default: boolean
}

// ─── Output Options ───────────────────────────────────────────────────────────

export type OutputFormat = 'table' | 'json' | 'markdown'

/** Output format options passed from L2 commands to L1 formatters */
export interface FormatOptions {
  columns?: string[]
  quiet?: boolean
  raw?: boolean
  /** When true, strips ANSI escape codes (for piped/non-TTY output) */
  noColor?: boolean
}

// ─── Shared Sub-types ─────────────────────────────────────────────────────────

export interface PartialUser {
  id: string
  object: 'user'
}

export type ParentRef =
  | { type: 'workspace'; workspace: true }
  | { type: 'database_id'; database_id: string }
  | { type: 'page_id'; page_id: string }
  | { type: 'block_id'; block_id: string }

export interface RichTextItem {
  type: 'text' | 'mention' | 'equation'
  plain_text: string
  href: string | null
  annotations?: TextAnnotations
  text?: { content: string; link: { url: string } | null }
}

export interface TextAnnotations {
  bold: boolean
  italic: boolean
  strikethrough: boolean
  underline: boolean
  code: boolean
  color: string
}

export type PropertyValue = Record<string, unknown>
export type PropertySchema = Record<string, unknown>

export interface FileObject {
  type: 'external' | 'file'
  external?: { url: string }
  file?: { url: string; expiry_time: string }
}

export type IconObject =
  | { type: 'emoji'; emoji: string }
  | { type: 'external'; external: { url: string } }
  | { type: 'file'; file: { url: string; expiry_time: string } }
