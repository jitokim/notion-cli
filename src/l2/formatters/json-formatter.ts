/**
 * L2: JsonFormatter
 * Formats data as pretty-printed JSON.
 */

import type { Formatter } from '../../l1/ports/formatter.js'
import type { FormatOptions } from '../../l1/types/index.js'

export class JsonFormatter implements Formatter {
  format(data: unknown[], options?: FormatOptions): string {
    if (options?.quiet) return ''

    const output = data.length === 1 ? data[0] : data
    return JSON.stringify(output, null, 2)
  }
}
