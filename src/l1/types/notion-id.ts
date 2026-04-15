/**
 * L1: NotionId Value Object
 * Parses and normalizes Notion IDs from UUID, 32-hex, or full Notion URLs.
 */

import { ValidationError } from '../errors/index.js'

export class NotionId {
  /**
   * UUID pattern: supports both hyphenated and non-hyphenated forms.
   * Groups: 8-4-4-4-12 or 32 consecutive hex chars.
   */
  private static readonly UUID_RE =
    /[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}/i

  private constructor(private readonly hex: string) {}

  /**
   * Parses a NotionId from a string.
   * Accepts UUID, 32-hex, and full Notion URLs.
   *
   * @throws {ValidationError} When no valid ID can be extracted.
   */
  static parse(raw: string): NotionId {
    if (!raw || typeof raw !== 'string') {
      throw new ValidationError('Notion ID must be a non-empty string')
    }

    const match = raw.match(NotionId.UUID_RE)
    if (!match) {
      throw new ValidationError(
        `Invalid Notion ID: "${raw.slice(0, 40)}${raw.length > 40 ? '...' : ''}". ` +
          'Expected UUID, 32-char hex, or Notion URL.'
      )
    }

    const hex = match[0].replace(/-/g, '').toLowerCase()
    return new NotionId(hex)
  }

  /**
   * Checks whether a string contains a valid Notion ID.
   */
  static isValid(raw: string): boolean {
    if (!raw || typeof raw !== 'string') return false
    return NotionId.UUID_RE.test(raw)
  }

  /**
   * Returns the ID in 8-4-4-4-12 UUID format.
   * Use this format for Notion API calls.
   */
  toUuid(): string {
    const h = this.hex
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
  }

  /**
   * Returns the ID as a 32-char lowercase hex string.
   */
  toHex(): string {
    return this.hex
  }

  /**
   * Default string representation is UUID format.
   */
  toString(): string {
    return this.toUuid()
  }

  /**
   * Short form (first 8 chars) for table display.
   */
  toShort(): string {
    return this.hex.slice(0, 8)
  }

  /**
   * Compares two NotionId instances for equality.
   */
  equals(other: NotionId): boolean {
    return this.hex === other.hex
  }
}
