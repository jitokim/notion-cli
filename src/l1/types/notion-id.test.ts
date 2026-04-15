/**
 * Tests for NotionId Value Object
 */

import { describe, it, expect } from 'vitest'
import { NotionId } from './notion-id.js'
import { ValidationError } from '../errors/index.js'

// ─── Test fixtures ────────────────────────────────────────────────────────────

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000'
const VALID_HEX = '550e8400e29b41d4a716446655440000'
const VALID_UUID_UPPERCASE = '550E8400-E29B-41D4-A716-446655440000'
const NOTION_URL_WITH_ID =
  'https://www.notion.so/My-Page-Title-550e8400e29b41d4a716446655440000'
const NOTION_URL_WITH_UUID =
  'https://www.notion.so/550e8400-e29b-41d4-a716-446655440000'
const NOTION_URL_WITH_QUERY =
  'https://www.notion.so/My-Page-550e8400e29b41d4a716446655440000?pvs=4'

// ─── parse() success cases ────────────────────────────────────────────────────

describe('NotionId.parse()', () => {
  describe('success cases', () => {
    it('parses a standard UUID with hyphens', () => {
      const id = NotionId.parse(VALID_UUID)
      expect(id.toUuid()).toBe(VALID_UUID)
    })

    it('parses 32-char hex string without hyphens', () => {
      const id = NotionId.parse(VALID_HEX)
      expect(id.toHex()).toBe(VALID_HEX)
    })

    it('parses uppercase UUID (case-insensitive match)', () => {
      // UUID_RE is case-insensitive. parse() applies toLowerCase() for normalization.
      const id = NotionId.parse(VALID_UUID_UPPERCASE)
      // Should produce a 32-char lowercase string (hyphens stripped, lowercased)
      expect(id.toHex()).toHaveLength(32)
      // The result is always lowercase regardless of input case
      expect(id.toHex()).toBe(VALID_UUID_UPPERCASE.replace(/-/g, '').toLowerCase())
    })

    it('extracts ID from a Notion page URL (hex suffix)', () => {
      const id = NotionId.parse(NOTION_URL_WITH_ID)
      expect(id.toHex()).toBe('550e8400e29b41d4a716446655440000')
    })

    it('extracts ID from a Notion page URL (UUID segment)', () => {
      const id = NotionId.parse(NOTION_URL_WITH_UUID)
      expect(id.toHex()).toBe('550e8400e29b41d4a716446655440000')
    })

    it('extracts ID from a Notion URL with query string (?pvs=4)', () => {
      const id = NotionId.parse(NOTION_URL_WITH_QUERY)
      expect(id.toHex()).toBe('550e8400e29b41d4a716446655440000')
    })
  })

  // ─── parse() failure cases ────────────────────────────────────────────────

  describe('failure cases', () => {
    it('throws ValidationError for empty string', () => {
      expect(() => NotionId.parse('')).toThrow(ValidationError)
    })

    it('throws ValidationError for whitespace-only string', () => {
      expect(() => NotionId.parse('   ')).toThrow(ValidationError)
    })

    it('throws ValidationError for a string shorter than 32 hex chars', () => {
      expect(() => NotionId.parse('550e8400e29b41d4a71644665544')).toThrow(ValidationError)
    })

    it('throws ValidationError for a string with invalid characters', () => {
      expect(() => NotionId.parse('zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz')).toThrow(
        ValidationError
      )
    })

    it('throws ValidationError for a plain word', () => {
      expect(() => NotionId.parse('not-a-notion-id')).toThrow(ValidationError)
    })

    it('throws ValidationError for a URL without ID segment', () => {
      expect(() => NotionId.parse('https://www.notion.so/')).toThrow(ValidationError)
    })

    it('includes truncated input in error message for long invalid strings', () => {
      const longInvalid = 'x'.repeat(60)
      const call = () => NotionId.parse(longInvalid)
      expect(call).toThrow(ValidationError)
      const error = (() => {
        try {
          call()
        } catch (e) {
          return e
        }
      })() as ValidationError
      expect(error.message).toContain('...')
    })

    it('error message does not contain the full string when > 40 chars', () => {
      const longInvalid = 'g'.repeat(50)
      try {
        NotionId.parse(longInvalid)
      } catch (e) {
        const err = e as ValidationError
        expect(err.message).not.toContain(longInvalid)
      }
    })
  })
})

// ─── isValid() ────────────────────────────────────────────────────────────────

describe('NotionId.isValid()', () => {
  it('returns true for a valid UUID', () => {
    expect(NotionId.isValid(VALID_UUID)).toBe(true)
  })

  it('returns true for a valid 32-char hex', () => {
    expect(NotionId.isValid(VALID_HEX)).toBe(true)
  })

  it('returns true for a Notion URL containing a UUID', () => {
    expect(NotionId.isValid(NOTION_URL_WITH_ID)).toBe(true)
  })

  it('returns false for empty string', () => {
    expect(NotionId.isValid('')).toBe(false)
  })

  it('returns false for a non-id string', () => {
    expect(NotionId.isValid('hello-world')).toBe(false)
  })

  it('returns false for a string of wrong length', () => {
    expect(NotionId.isValid('550e8400e29b41d4a71644665544')).toBe(false)
  })
})

// ─── toUuid() / toHex() / toString() / toShort() ─────────────────────────────

describe('NotionId output methods', () => {
  const id = NotionId.parse(VALID_HEX)

  it('toUuid() formats as 8-4-4-4-12', () => {
    expect(id.toUuid()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
  })

  it('toHex() returns 32 lowercase hex chars', () => {
    expect(id.toHex()).toMatch(/^[0-9a-f]{32}$/)
  })

  it('toString() returns UUID format (same as toUuid)', () => {
    expect(id.toString()).toBe(id.toUuid())
  })

  it('toShort() returns first 8 hex chars', () => {
    expect(id.toShort()).toBe(VALID_HEX.slice(0, 8))
    expect(id.toShort()).toHaveLength(8)
  })

  it('round-trip: parse UUID → toUuid() returns original UUID (lowercased)', () => {
    const parsed = NotionId.parse(VALID_UUID)
    expect(parsed.toUuid()).toBe(VALID_UUID.toLowerCase())
  })

  it('round-trip: parse hex → toHex() returns original hex', () => {
    const parsed = NotionId.parse(VALID_HEX)
    expect(parsed.toHex()).toBe(VALID_HEX)
  })
})

// ─── equals() ────────────────────────────────────────────────────────────────

describe('NotionId.equals()', () => {
  it('returns true when both IDs represent the same resource (UUID vs hex)', () => {
    const a = NotionId.parse(VALID_UUID)
    const b = NotionId.parse(VALID_HEX)
    expect(a.equals(b)).toBe(true)
  })

  it('returns true for two IDs parsed from the same string', () => {
    const a = NotionId.parse(VALID_UUID)
    const b = NotionId.parse(VALID_UUID)
    expect(a.equals(b)).toBe(true)
  })

  it('returns false for two different IDs', () => {
    const a = NotionId.parse(VALID_UUID)
    const b = NotionId.parse('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
    expect(a.equals(b)).toBe(false)
  })
})
