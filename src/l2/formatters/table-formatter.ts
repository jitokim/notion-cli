/**
 * L2: TableFormatter
 * Table formatter built on cli-table3.
 * Provides default columns per resource type, overridable with --columns.
 */

import Table from 'cli-table3'
import chalk from 'chalk'
import type { Formatter } from '../../l1/ports/formatter.js'
import type { FormatOptions } from '../../l1/types/index.js'

const NULL_DISPLAY = '-'
const ID_SHORT_LENGTH = 8
const CONTENT_MAX_LENGTH = 40

// Comprehensive ANSI/terminal escape sequence pattern:
// CSI (\x1B[...), OSC (\x1B]...\x07 or \x1B]...\x1B\\), DCS (\x1BP...), SS3 (\x1BO)
// Prevents terminal injection attacks via malicious Notion content (e.g., OSC 52 clipboard manipulation)
const ANSI_ESCAPE_PATTERN = /\x1B(?:\[[0-9;]*[A-Za-z]|\][^\x07\x1B]*(?:\x07|\x1B\\)|\[[\s\S]*?[A-Za-z]|P[^\x1B]*\x1B\\|O.)/g

function stripAnsi(text: string): string {
  return text.replace(ANSI_ESCAPE_PATTERN, '')
}

// ─── Default column definitions ─────────────────────────────────────────────

const PAGE_COLUMNS = ['id', 'title', 'last_edited_time', 'created_by']
const DATA_SOURCE_COLUMNS = ['id', 'title', 'created_time']
const BLOCK_COLUMNS = ['id', 'type', 'content', 'has_children']
const USER_COLUMNS = ['id', 'name', 'type', 'email']
const COMMENT_COLUMNS = ['id', 'created_time', 'created_by', 'content']
const TEMPLATE_COLUMNS = ['id', 'name', 'is_default']
const DEFAULT_COLUMNS = ['id', 'object']

/** Infers resource type and returns default columns */
function resolveDefaultColumns(data: unknown[]): string[] {
  if (data.length === 0) return DEFAULT_COLUMNS

  const first = data[0] as Record<string, unknown>
  switch (first['object']) {
    case 'page':
      return PAGE_COLUMNS
    case 'data_source':
    case 'database':
      return DATA_SOURCE_COLUMNS
    case 'block':
      return BLOCK_COLUMNS
    case 'user':
      return USER_COLUMNS
    case 'comment':
      return COMMENT_COLUMNS
    default:
      // Detect DataSourceTemplate structure (no 'object' field, has 'name' + 'is_default')
      if ('name' in first && 'is_default' in first && !('object' in first)) {
        return TEMPLATE_COLUMNS
      }
      return Object.keys(first).slice(0, 4)
  }
}

/** Converts a cell value to a displayable string */
function formatCellValueRaw(value: unknown, column: string): string {
  if (value === null || value === undefined) return NULL_DISPLAY

  // id column: show first 8 chars only
  if (column === 'id' && typeof value === 'string') {
    return value.replace(/-/g, '').slice(0, ID_SHORT_LENGTH)
  }

  // Boolean handling
  if (typeof value === 'boolean') return value ? 'true' : 'false'

  // Extract title from Notion rich_text array
  if (column === 'title' && Array.isArray(value)) {
    return extractPlainText(value) || NULL_DISPLAY
  }

  // created_by / last_edited_by: PartialUser
  if ((column === 'created_by' || column === 'last_edited_by') && isObject(value)) {
    return (value as Record<string, unknown>)['id'] as string ?? NULL_DISPLAY
  }

  // content column: truncate to 40 chars
  if (column === 'content' && typeof value === 'string') {
    return value.length > CONTENT_MAX_LENGTH
      ? `${value.slice(0, CONTENT_MAX_LENGTH)}...`
      : value
  }

  // Date format: ISO → locale date string
  if ((column.endsWith('_time') || column.endsWith('_date')) && typeof value === 'string') {
    try {
      return new Date(value).toLocaleDateString()
    } catch {
      return value
    }
  }

  // Extract email from person object
  if (column === 'email' && isObject(value)) {
    return (value as Record<string, unknown>)['email'] as string ?? NULL_DISPLAY
  }

  // Object/Array: JSON serialize
  if (typeof value === 'object') {
    return JSON.stringify(value).slice(0, CONTENT_MAX_LENGTH)
  }

  return String(value)
}

/** Converts a cell value to a displayable string, always stripping ANSI escape codes from Notion content */
function formatCellValue(value: unknown, column: string): string {
  return stripAnsi(formatCellValueRaw(value, column))
}

/** Extracts plain_text from a rich_text array */
function extractPlainText(richText: unknown[]): string {
  return richText
    .map((item) => {
      if (isObject(item)) {
        return (item as Record<string, unknown>)['plain_text'] ?? ''
      }
      return ''
    })
    .join('')
}

/** Extracts a value from an object using dot-notation path */
function extractValue(record: Record<string, unknown>, column: string): unknown {
  const parts = column.split('.')
  let current: unknown = record

  for (const part of parts) {
    if (!isObject(current)) return undefined
    current = (current as Record<string, unknown>)[part]
  }

  return current
}

/** Extracts the title from a page's properties object */
function extractTitleFromProperties(record: Record<string, unknown>): string {
  const properties = record['properties']
  if (!isObject(properties)) return NULL_DISPLAY

  const propsObj = properties as Record<string, unknown>

  // Prefer 'title' or 'Name' property
  for (const key of ['title', 'Title', 'Name', 'name']) {
    const prop = propsObj[key]
    if (isObject(prop)) {
      const titleProp = prop as Record<string, unknown>
      if (Array.isArray(titleProp['title'])) {
        return extractPlainText(titleProp['title']) || NULL_DISPLAY
      }
    }
  }

  return NULL_DISPLAY
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export class TableFormatter implements Formatter {
  format(data: unknown[], options?: FormatOptions): string {
    if (options?.quiet) return ''
    if (data.length === 0) return chalk.dim('# 0 results')

    const columns = options?.columns ?? resolveDefaultColumns(data)

    const table = new Table({
      head: columns.map((col) => chalk.cyan(col)),
      style: { head: [], border: [] },
      wordWrap: false,
    })

    for (const item of data) {
      if (!isObject(item)) continue
      const record = item as Record<string, unknown>

      const row = columns.map((column) => {
        // Extract title column from properties
        if (column === 'title' && record['object'] === 'page') {
          return stripAnsi(extractTitleFromProperties(record))
        }
        // Data source title is a rich_text array
        if (column === 'title' && (record['object'] === 'database' || record['object'] === 'data_source')) {
          const titleArray = record['title']
          if (Array.isArray(titleArray)) {
            return stripAnsi(extractPlainText(titleArray) || NULL_DISPLAY)
          }
        }
        // email: user.person.email
        if (column === 'email' && record['object'] === 'user') {
          const person = record['person']
          if (isObject(person)) {
            return stripAnsi((person as Record<string, unknown>)['email'] as string ?? NULL_DISPLAY)
          }
          return NULL_DISPLAY
        }
        // Block content: extract rich_text by block type
        if (column === 'content' && record['object'] === 'block') {
          return stripAnsi(extractBlockContent(record))
        }
        // Comment content: extract from rich_text array
        if (column === 'content' && record['object'] === 'comment') {
          const richText = record['rich_text']
          if (Array.isArray(richText)) {
            const text = extractPlainText(richText)
            const truncated = text.length > CONTENT_MAX_LENGTH
              ? `${text.slice(0, CONTENT_MAX_LENGTH)}...`
              : text || NULL_DISPLAY
            return stripAnsi(truncated)
          }
          return NULL_DISPLAY
        }

        const value = extractValue(record, column)
        return formatCellValue(value, column)
      })

      table.push(row)
    }

    const output = table.toString()
    return options?.noColor ? stripAnsi(output) : output
  }
}

/** Extracts text content from a block */
function extractBlockContent(block: Record<string, unknown>): string {
  const blockType = block['type'] as string
  if (!blockType) return NULL_DISPLAY

  const blockData = block[blockType]
  if (!isObject(blockData)) return NULL_DISPLAY

  const richText = (blockData as Record<string, unknown>)['rich_text']
  if (!Array.isArray(richText)) return NULL_DISPLAY

  const text = extractPlainText(richText)
  return text.length > CONTENT_MAX_LENGTH
    ? `${text.slice(0, CONTENT_MAX_LENGTH)}...`
    : text || NULL_DISPLAY
}
