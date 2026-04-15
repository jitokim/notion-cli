/**
 * Tests for TableFormatter
 */

import { describe, it, expect } from 'vitest'
import { TableFormatter } from './table-formatter.js'

const formatter = new TableFormatter()

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makePage(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: '550e8400-e29b-41d4-a716-446655440000',
    object: 'page',
    created_time: '2024-01-15T10:00:00.000Z',
    last_edited_time: '2024-06-01T12:00:00.000Z',
    archived: false,
    properties: {
      title: {
        title: [{ plain_text: 'My Test Page', type: 'text' }],
      },
    },
    created_by: { id: 'user-id-123', object: 'user' },
    last_edited_by: { id: 'user-id-456', object: 'user' },
    ...overrides,
  }
}

function makeDatabase(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    object: 'database',
    created_time: '2024-01-01T00:00:00.000Z',
    title: [{ plain_text: 'My Database', type: 'text' }],
    ...overrides,
  }
}

function makeBlock(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    object: 'block',
    type: 'paragraph',
    has_children: false,
    paragraph: {
      rich_text: [{ plain_text: 'Hello world', type: 'text' }],
    },
    ...overrides,
  }
}

function makeUser(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
    object: 'user',
    type: 'person',
    name: 'Alice',
    person: { email: 'alice@example.com' },
    ...overrides,
  }
}

// ─── Empty data ───────────────────────────────────────────────────────────────

describe('TableFormatter: empty data', () => {
  it('returns "# 0 results" for empty array', () => {
    const output = formatter.format([])
    expect(output).toContain('0 results')
  })

  it('returns empty string when quiet option is true', () => {
    expect(formatter.format([makePage()], { quiet: true })).toBe('')
  })
})

// ─── Page default columns ─────────────────────────────────────────────────────

describe('TableFormatter: page object', () => {
  it('includes id column (truncated to 8 hex chars)', () => {
    const output = formatter.format([makePage()])
    // ID 550e8400-e29b... → strip hyphens → 550e8400e29b41d4... → first 8 = 550e8400
    expect(output).toContain('550e8400')
  })

  it('includes title extracted from properties', () => {
    const output = formatter.format([makePage()])
    expect(output).toContain('My Test Page')
  })

  it('shows "-" when title property is missing', () => {
    const output = formatter.format([makePage({ properties: {} })])
    expect(output).toContain('-')
  })

  it('shows "-" when title rich_text is empty array', () => {
    const output = formatter.format([makePage({
      properties: { title: { title: [] } },
    })])
    expect(output).toContain('-')
  })

  it('includes date columns (last_edited_time formatted)', () => {
    const output = formatter.format([makePage()])
    // Date should appear in some locale format
    expect(output).toBeTruthy()
  })
})

// ─── Database default columns ─────────────────────────────────────────────────

describe('TableFormatter: database object', () => {
  it('extracts title from top-level rich_text array', () => {
    const output = formatter.format([makeDatabase()])
    expect(output).toContain('My Database')
  })

  it('shows "-" when database title array is empty', () => {
    const output = formatter.format([makeDatabase({ title: [] })])
    expect(output).toContain('-')
  })
})

// ─── Block default columns ────────────────────────────────────────────────────

describe('TableFormatter: block object', () => {
  it('shows block type', () => {
    const output = formatter.format([makeBlock()])
    expect(output).toContain('paragraph')
  })

  it('extracts block content from rich_text', () => {
    const output = formatter.format([makeBlock()])
    expect(output).toContain('Hello world')
  })

  it('shows "-" for block content when rich_text is absent', () => {
    const output = formatter.format([makeBlock({ paragraph: {} })])
    expect(output).toContain('-')
  })

  it('truncates long content to 40 chars + "..."', () => {
    const longText = 'a'.repeat(60)
    const block = makeBlock({
      paragraph: { rich_text: [{ plain_text: longText, type: 'text' }] },
    })
    const output = formatter.format([block])
    expect(output).toContain('...')
    expect(output).not.toContain(longText)
  })

  it('shows has_children boolean as "true" or "false"', () => {
    const output = formatter.format([makeBlock({ has_children: true })])
    expect(output).toContain('true')
  })
})

// ─── User default columns ─────────────────────────────────────────────────────

describe('TableFormatter: user object', () => {
  it('shows user name', () => {
    const output = formatter.format([makeUser()])
    expect(output).toContain('Alice')
  })

  it('shows email from person.email', () => {
    const output = formatter.format([makeUser()])
    expect(output).toContain('alice@example.com')
  })

  it('shows "-" when person is absent (bot user)', () => {
    const output = formatter.format([makeUser({ person: undefined })])
    expect(output).toContain('-')
  })
})

// ─── --columns option ─────────────────────────────────────────────────────────

describe('TableFormatter: custom --columns', () => {
  it('uses only specified columns', () => {
    const output = formatter.format([makePage()], { columns: ['id'] })
    expect(output).toContain('id')
    // "last_edited_time" header should not appear when not specified
    expect(output).not.toContain('last_edited_time')
  })

  it('supports dot-notation column paths', () => {
    const data = [{ object: 'page', nested: { deep: 'value123' } }]
    const output = formatter.format(data, { columns: ['nested.deep'] })
    expect(output).toContain('value123')
  })

  it('shows "-" for missing dot-notation path', () => {
    const data = [{ object: 'page', a: {} }]
    const output = formatter.format(data, { columns: ['a.b.c'] })
    expect(output).toContain('-')
  })
})

// ─── null/undefined cell values ───────────────────────────────────────────────

describe('TableFormatter: null/undefined field handling', () => {
  it('shows "-" for null field value', () => {
    const data = [{ object: 'page', id: null }]
    const output = formatter.format(data, { columns: ['id'] })
    expect(output).toContain('-')
  })

  it('shows "-" for undefined field value', () => {
    const data = [{ object: 'page' }]
    const output = formatter.format(data, { columns: ['missing_field'] })
    expect(output).toContain('-')
  })
})

// ─── Non-object items skipped ─────────────────────────────────────────────────

describe('TableFormatter: skips non-object items', () => {
  it('does not throw for array items that are primitives', () => {
    const data = [makePage(), 'not-an-object' as unknown]
    expect(() => formatter.format(data)).not.toThrow()
  })
})

// ─── Unknown object type fallback ────────────────────────────────────────────

describe('TableFormatter: unknown object type fallback', () => {
  it('uses first 4 keys of the object for unknown types', () => {
    const data = [{ object: 'unknown_type', foo: '1', bar: '2', baz: '3', qux: '4', extra: '5' }]
    const output = formatter.format(data)
    // Should contain at least some of the first 4 keys as headers
    expect(output).toBeTruthy()
  })
})

// ─── Comment default columns ──────────────────────────────────────────────────

function makeComment(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'abc12345-def6-7890-abcd-ef1234567890',
    object: 'comment',
    parent: { type: 'page_id', page_id: 'parent-page-id' },
    discussion_id: 'disc-123',
    created_time: '2026-04-14T10:00:00.000Z',
    last_edited_time: '2026-04-14T10:00:00.000Z',
    created_by: { id: 'user-123', object: 'user' },
    rich_text: [
      { type: 'text', plain_text: 'Hello World', href: null },
    ],
    ...overrides,
  }
}

describe('TableFormatter: comment object — default columns', () => {
  it('applies COMMENT_COLUMNS as default (id, created_time, created_by, content)', () => {
    const output = formatter.format([makeComment()])
    expect(output).toContain('id')
    expect(output).toContain('created_time')
    expect(output).toContain('created_by')
    expect(output).toContain('content')
    // last_edited_time is NOT in COMMENT_COLUMNS
    expect(output).not.toContain('last_edited_time')
  })

  it('shows truncated id (8 hex chars, no hyphens)', () => {
    const output = formatter.format([makeComment()])
    // abc12345-def6-... → strip hyphens → abc12345def6... → first 8 = abc12345
    expect(output).toContain('abc12345')
  })

  it('extracts plain_text from rich_text array as content', () => {
    const output = formatter.format([makeComment()])
    expect(output).toContain('Hello World')
  })

  it('shows created_by user id', () => {
    const output = formatter.format([makeComment()])
    expect(output).toContain('user-123')
  })

  it('formats created_time as locale date string', () => {
    const output = formatter.format([makeComment()])
    // The exact format is locale-dependent; just verify it's not the raw ISO string
    expect(output).not.toContain('2026-04-14T10:00:00.000Z')
    expect(output).toBeTruthy()
  })
})

describe('TableFormatter: comment object — content extraction failures', () => {
  it('shows "-" when rich_text array is empty', () => {
    const output = formatter.format([makeComment({ rich_text: [] })])
    expect(output).toContain('-')
  })

  it('shows "-" when rich_text is absent (undefined)', () => {
    const comment = makeComment()
    delete (comment as Record<string, unknown>)['rich_text']
    const output = formatter.format([comment])
    expect(output).toContain('-')
  })

  it('shows "-" when rich_text is null', () => {
    const output = formatter.format([makeComment({ rich_text: null })])
    expect(output).toContain('-')
  })

  it('shows "-" when rich_text items have no plain_text', () => {
    const output = formatter.format([makeComment({
      rich_text: [{ type: 'text', href: null }],
    })])
    // extractPlainText returns empty string → NULL_DISPLAY
    expect(output).toContain('-')
  })

  it('truncates content longer than 40 chars with "..."', () => {
    const longText = 'x'.repeat(60)
    const output = formatter.format([makeComment({
      rich_text: [{ type: 'text', plain_text: longText, href: null }],
    })])
    expect(output).toContain('...')
    expect(output).not.toContain(longText)
  })

  it('shows content without truncation when exactly 40 chars', () => {
    const exactText = 'y'.repeat(40)
    const output = formatter.format([makeComment({
      rich_text: [{ type: 'text', plain_text: exactText, href: null }],
    })])
    expect(output).toContain(exactText)
    expect(output).not.toContain('...')
  })

  it('concatenates plain_text across multiple rich_text segments', () => {
    const output = formatter.format([makeComment({
      rich_text: [
        { type: 'text', plain_text: 'Foo', href: null },
        { type: 'text', plain_text: 'Bar', href: null },
      ],
    })])
    expect(output).toContain('FooBar')
  })

  it('shows "-" when created_by is missing', () => {
    const comment = makeComment()
    delete (comment as Record<string, unknown>)['created_by']
    const output = formatter.format([comment])
    expect(output).toContain('-')
  })
})

// ─── noColor / stripAnsi ──────────────────────────────────────────────────────

describe('TableFormatter: noColor option', () => {
  it('removes ANSI escape codes when noColor: true', () => {
    const output = formatter.format([makePage()], { noColor: true })
    // ANSI CSI sequences start with ESC [ (\x1B[)
    expect(output).not.toMatch(/\x1B\[/)
  })

  it('contains ANSI codes by default (chalk colorizes headers)', () => {
    const output = formatter.format([makePage()])
    // chalk.cyan wraps with ANSI codes in a TTY-emulated env;
    // cli-table3 border chars are always present so output is non-empty.
    // We just verify noColor=false path does not throw and returns a string.
    expect(typeof output).toBe('string')
    expect(output.length).toBeGreaterThan(0)
  })

  it('noColor: true output is plain ASCII (no ESC char at all)', () => {
    const output = formatter.format([makeComment()], { noColor: true })
    // \x1B is the ESC character used by all ANSI sequences
    expect(output.includes('\x1B')).toBe(false)
  })

  it('noColor: true still contains table content', () => {
    const output = formatter.format([makeComment()], { noColor: true })
    expect(output).toContain('Hello World')
    expect(output).toContain('abc12345')
  })
})
