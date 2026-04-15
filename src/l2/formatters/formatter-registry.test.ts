/**
 * Tests for FormatterRegistry and resolveOutputFormat
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { FormatterRegistry, resolveOutputFormat } from './formatter-registry.js'
import type { Formatter } from '../../l1/ports/formatter.js'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeFormatter(name: string): Formatter {
  return {
    format: vi.fn(() => `output-from-${name}`),
  }
}

// ─── FormatterRegistry.register() / get() ────────────────────────────────────

describe('FormatterRegistry', () => {
  it('registers and retrieves a formatter by name', () => {
    const registry = new FormatterRegistry()
    const fmt = makeFormatter('json')
    registry.register('json', fmt)
    expect(registry.get('json')).toBe(fmt)
  })

  it('throws an error when getting an unregistered formatter', () => {
    const registry = new FormatterRegistry()
    expect(() => registry.get('unknown')).toThrow(/Unknown format/)
  })

  it('error message includes the requested name', () => {
    const registry = new FormatterRegistry()
    expect(() => registry.get('csv')).toThrow(/"csv"/)
  })

  it('error message lists available formatters', () => {
    const registry = new FormatterRegistry()
    registry.register('json', makeFormatter('json'))
    registry.register('table', makeFormatter('table'))
    expect(() => registry.get('xml')).toThrow(/json/)
  })

  it('has() returns true for registered formatter', () => {
    const registry = new FormatterRegistry()
    registry.register('json', makeFormatter('json'))
    expect(registry.has('json')).toBe(true)
  })

  it('has() returns false for unregistered formatter', () => {
    const registry = new FormatterRegistry()
    expect(registry.has('xml')).toBe(false)
  })

  it('list() returns all registered formatter names', () => {
    const registry = new FormatterRegistry()
    registry.register('json', makeFormatter('json'))
    registry.register('table', makeFormatter('table'))
    expect(registry.list()).toContain('json')
    expect(registry.list()).toContain('table')
    expect(registry.list()).toHaveLength(2)
  })

  it('list() returns empty array when nothing registered', () => {
    const registry = new FormatterRegistry()
    expect(registry.list()).toEqual([])
  })

  it('overwrites a formatter when re-registered with same name', () => {
    const registry = new FormatterRegistry()
    const fmt1 = makeFormatter('v1')
    const fmt2 = makeFormatter('v2')
    registry.register('json', fmt1)
    registry.register('json', fmt2)
    expect(registry.get('json')).toBe(fmt2)
  })

  it('throws after getting unregistered formatter even when others are registered', () => {
    const registry = new FormatterRegistry()
    registry.register('json', makeFormatter('json'))
    expect(() => registry.get('table')).toThrow(/Unknown format/)
  })
})

// ─── resolveOutputFormat() ───────────────────────────────────────────────────

describe('resolveOutputFormat()', () => {
  let originalIsTTY: boolean | undefined

  beforeEach(() => {
    originalIsTTY = process.stdout.isTTY
  })

  afterEach(() => {
    // Restore original isTTY value (may be undefined in non-TTY test env)
    if (originalIsTTY === undefined) {
      delete (process.stdout as Record<string, unknown>)['isTTY']
    } else {
      process.stdout.isTTY = originalIsTTY
    }
  })

  it('returns "json" when raw=true regardless of other options', () => {
    expect(resolveOutputFormat('table', true)).toBe('json')
    expect(resolveOutputFormat(undefined, true)).toBe('json')
    expect(resolveOutputFormat('markdown', true)).toBe('json')
  })

  it('returns "json" when formatOption is "json"', () => {
    expect(resolveOutputFormat('json', false)).toBe('json')
  })

  it('returns "table" when formatOption is "table"', () => {
    expect(resolveOutputFormat('table', false)).toBe('table')
  })

  it('returns "markdown" when formatOption is "markdown"', () => {
    expect(resolveOutputFormat('markdown', false)).toBe('markdown')
  })

  it('returns "table" when formatOption is undefined and stdout is TTY', () => {
    process.stdout.isTTY = true
    expect(resolveOutputFormat(undefined, undefined)).toBe('table')
  })

  it('returns "json" when formatOption is undefined and stdout is not TTY (piped)', () => {
    delete (process.stdout as Record<string, unknown>)['isTTY']
    expect(resolveOutputFormat(undefined, undefined)).toBe('json')
  })

  it('returns "json" when formatOption is undefined and isTTY is false', () => {
    process.stdout.isTTY = false
    expect(resolveOutputFormat(undefined, false)).toBe('json')
  })

  it('ignores unknown formatOption and falls back to TTY detection', () => {
    process.stdout.isTTY = true
    // 'csv' is not a known format → treated as undefined → TTY → 'table'
    expect(resolveOutputFormat('csv', undefined)).toBe('table')
  })

  it('writes warning to stderr for unknown formatOption', () => {
    process.stdout.isTTY = true
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    resolveOutputFormat('xml', undefined)
    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining('Unknown format "xml"')
    )
    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining('Available: json, table, markdown')
    )
    stderrSpy.mockRestore()
  })

  it('does not warn when formatOption is undefined (auto-detect)', () => {
    process.stdout.isTTY = true
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    resolveOutputFormat(undefined, undefined)
    expect(stderrSpy).not.toHaveBeenCalled()
    stderrSpy.mockRestore()
  })
})
