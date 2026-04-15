/**
 * L2: MarkdownFormatter
 * Formats data as a Markdown table.
 */

import type { Formatter } from '../../l1/ports/formatter.js'
import type { FormatOptions } from '../../l1/types/index.js'

const NULL_DISPLAY = ''

function extractPlainText(richText: unknown[]): string {
  return richText
    .map((item) => {
      if (typeof item === 'object' && item !== null) {
        return (item as Record<string, unknown>)['plain_text'] ?? ''
      }
      return ''
    })
    .join('')
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function formatMarkdownCellValue(value: unknown, column: string): string {
  if (value === null || value === undefined) return NULL_DISPLAY

  if (column === 'id' && typeof value === 'string') {
    return `\`${value.replace(/-/g, '').slice(0, 8)}\``
  }

  if (typeof value === 'boolean') return value ? '✓' : '✗'

  if (Array.isArray(value)) {
    return extractPlainText(value)
  }

  if (typeof value === 'object') {
    return JSON.stringify(value)
  }

  return escapePipe(String(value))
}

/** Escape pipe characters and strip ANSI/control sequences for safe Markdown table cells. */
function escapePipe(text: string): string {
  // Strip ANSI escape sequences (including OSC, CSI, etc.)
  const ANSI_RE = /[\u001b\u009b][\[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nq-uy=><~]/g // eslint-disable-line no-useless-escape
  const stripped = text.replace(ANSI_RE, '')
  return stripped.replace(/\|/g, '\\|')
}

function resolveColumns(data: unknown[]): string[] {
  if (data.length === 0) return ['id']
  const first = data[0] as Record<string, unknown>
  return Object.keys(first).filter((key) => !key.startsWith('_')).slice(0, 6)
}

export class MarkdownFormatter implements Formatter {
  format(data: unknown[], options?: FormatOptions): string {
    if (options?.quiet) return ''
    if (data.length === 0) return '_No results_'

    const columns = options?.columns ?? resolveColumns(data)
    const lines: string[] = []

    // Header row
    lines.push(`| ${columns.join(' | ')} |`)
    lines.push(`| ${columns.map(() => '---').join(' | ')} |`)

    // Data rows
    for (const item of data) {
      if (!isObject(item)) continue
      const record = item as Record<string, unknown>

      const cells = columns.map((column) => {
        const value = record[column]
        return formatMarkdownCellValue(value, column)
      })

      lines.push(`| ${cells.join(' | ')} |`)
    }

    return lines.join('\n')
  }
}
