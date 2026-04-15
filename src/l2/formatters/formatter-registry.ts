/**
 * L2: FormatterRegistry
 * Runtime formatter selection.
 * Manages formatter registration and TTY-aware format resolution.
 */

import type { Formatter } from '../../l1/ports/formatter.js'
import type { OutputFormat } from '../../l1/types/index.js'
import { ValidationError } from '../../l1/errors/index.js'

export class FormatterRegistry {
  private readonly formatters = new Map<string, Formatter>()

  register(name: string, formatter: Formatter): void {
    this.formatters.set(name, formatter)
  }

  /**
   * Returns a formatter by name.
   * Throws if the name is not registered.
   */
  get(name: string): Formatter {
    const formatter = this.formatters.get(name)
    if (!formatter) {
      const available = Array.from(this.formatters.keys()).join(', ')
      throw new ValidationError(`Unknown format "${name}". Available: ${available}`)
    }
    return formatter
  }

  has(name: string): boolean {
    return this.formatters.has(name)
  }

  list(): string[] {
    return Array.from(this.formatters.keys())
  }
}

/** Resolves the output format based on TTY state and --format option */
export function resolveOutputFormat(
  formatOption: string | undefined,
  raw: boolean | undefined
): OutputFormat {
  if (raw) return 'json'
  if (formatOption === 'json' || formatOption === 'table' || formatOption === 'markdown') {
    return formatOption
  }
  // unknown format → warn + fallback
  const fallback: OutputFormat = process.stdout.isTTY ? 'table' : 'json'
  if (formatOption) {
    process.stderr.write(
      `Warning: Unknown format "${formatOption}". Using ${fallback} instead. Available: json, table, markdown\n`
    )
  }
  return fallback
}
