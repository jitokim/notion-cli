/**
 * Tests for shared command utilities
 */

import { describe, it, expect } from 'vitest'
import { parsePositiveInt } from './shared.js'

describe('parsePositiveInt()', () => {
  it('parses valid positive integers', () => {
    expect(parsePositiveInt('1', '--limit')).toBe(1)
    expect(parsePositiveInt('20', '--limit')).toBe(20)
    expect(parsePositiveInt('100', '--limit')).toBe(100)
    expect(parsePositiveInt('999999', '--limit')).toBe(999999)
  })

  it('rejects decimal strings as non-integer', () => {
    expect(() => parsePositiveInt('3.5', '--limit')).toThrow(/Invalid value for --limit/)
    expect(() => parsePositiveInt('10.9', '--limit')).toThrow(/Must be a positive integer/)
  })

  it('rejects mixed alphanumeric strings', () => {
    expect(() => parsePositiveInt('2abc', '--limit')).toThrow(/Invalid value for --limit/)
    expect(() => parsePositiveInt('10px', '--limit')).toThrow(/Invalid value for --limit/)
  })

  it('throws ValidationError for zero', () => {
    expect(() => parsePositiveInt('0', '--limit')).toThrow(/Invalid value for --limit/)
    expect(() => parsePositiveInt('0', '--limit')).toThrow(/Must be a positive integer/)
  })

  it('throws ValidationError for negative values', () => {
    expect(() => parsePositiveInt('-1', '--limit')).toThrow(/Invalid value for --limit/)
    expect(() => parsePositiveInt('-100', '--max-depth')).toThrow(/Invalid value for --max-depth/)
  })

  it('throws ValidationError for non-numeric strings', () => {
    expect(() => parsePositiveInt('abc', '--limit')).toThrow(/Invalid value for --limit/)
    expect(() => parsePositiveInt('abc', '--limit')).toThrow(/"abc"/)
  })

  it('throws ValidationError for empty string', () => {
    expect(() => parsePositiveInt('', '--limit')).toThrow(/Invalid value for --limit/)
  })

  it('includes option name in error message', () => {
    expect(() => parsePositiveInt('bad', '--max-depth')).toThrow(/--max-depth/)
    expect(() => parsePositiveInt('bad', '--limit')).toThrow(/--limit/)
  })
})
