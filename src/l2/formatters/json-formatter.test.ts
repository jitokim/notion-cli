/**
 * Tests for JsonFormatter
 */

import { describe, it, expect } from 'vitest'
import { JsonFormatter } from './json-formatter.js'

const formatter = new JsonFormatter()

// ─── Success cases ────────────────────────────────────────────────────────────

describe('JsonFormatter.format()', () => {
  it('formats an array of objects as pretty-printed JSON array', () => {
    const data = [{ id: '1', name: 'Alice' }, { id: '2', name: 'Bob' }]
    const output = formatter.format(data)
    expect(JSON.parse(output)).toEqual(data)
  })

  it('formats a single-item array as the bare object (not wrapped in array)', () => {
    const data = [{ id: '1', name: 'Alice' }]
    const output = formatter.format(data)
    const parsed = JSON.parse(output)
    // Single item → unwrapped
    expect(parsed).toEqual(data[0])
    expect(Array.isArray(parsed)).toBe(false)
  })

  it('formats multiple items as a JSON array', () => {
    const data = [{ a: 1 }, { b: 2 }, { c: 3 }]
    const output = formatter.format(data)
    const parsed = JSON.parse(output)
    expect(Array.isArray(parsed)).toBe(true)
    expect(parsed).toHaveLength(3)
  })

  it('uses 2-space indentation (pretty print)', () => {
    const data = [{ key: 'value' }]
    const output = formatter.format(data)
    expect(output).toContain('  ')
    expect(output).toContain('\n')
  })

  // ─── Failure / edge cases ───────────────────────────────────────────────────

  it('returns empty string when options.quiet is true', () => {
    const output = formatter.format([{ id: '1' }], { quiet: true })
    expect(output).toBe('')
  })

  it('formats empty array as "[]"', () => {
    const output = formatter.format([])
    expect(output).toBe('[]')
  })

  it('handles array with null values', () => {
    const data = [{ id: null, name: undefined }]
    const output = formatter.format(data)
    const parsed = JSON.parse(output)
    expect(parsed).toHaveProperty('id', null)
    // undefined becomes absent in JSON
    expect(parsed).not.toHaveProperty('name')
  })

  it('handles deeply nested objects', () => {
    const data = [{ a: { b: { c: 42 } } }]
    const output = formatter.format(data)
    const parsed = JSON.parse(output)
    expect(parsed.a.b.c).toBe(42)
  })

  it('formats boolean values correctly', () => {
    const data = [{ active: true, archived: false }]
    const output = formatter.format(data)
    const parsed = JSON.parse(output)
    expect(parsed.active).toBe(true)
    expect(parsed.archived).toBe(false)
  })
})
