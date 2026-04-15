/**
 * L1: Formatter interface.
 * Contract that L2 formatter implementations must satisfy.
 */

import type { FormatOptions } from '../types/index.js'

export type { FormatOptions }

export interface Formatter<T = unknown> {
  format(data: T[], options?: FormatOptions): string
}
