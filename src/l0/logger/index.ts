/**
 * L0: Logger
 * Structured logger built on pino.
 * Automatically redacts Authorization headers and token values.
 */

import pino from 'pino'

const REDACTED = '***REDACTED***'
const SENSITIVE_KEYS = new Set(['authorization', 'token', 'secret', 'password', 'api_key', 'apikey', 'auth'])
const MAX_REDACTION_DEPTH = 5

/**
 * Recursively redacts sensitive keys from objects.
 * Handles nested objects up to MAX_REDACTION_DEPTH to prevent stack overflow on circular refs.
 */
function redactSerializer(value: unknown, depth = 0): unknown {
  if (value === null || typeof value !== 'object' || depth > MAX_REDACTION_DEPTH) return value
  if (Array.isArray(value)) return value.map((item) => redactSerializer(item, depth + 1))

  const result: Record<string, unknown> = {}
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      result[key] = REDACTED
    } else if (typeof val === 'object' && val !== null) {
      result[key] = redactSerializer(val, depth + 1)
    } else {
      result[key] = val
    }
  }
  return result
}

function resolveLogLevel(): pino.LevelWithSilent {
  const envLevel = process.env['NOTION_LOG_LEVEL']?.toLowerCase()
  const validLevels: pino.LevelWithSilent[] = ['error', 'warn', 'info', 'debug', 'silent']
  if (envLevel && validLevels.includes(envLevel as pino.LevelWithSilent)) {
    return envLevel as pino.LevelWithSilent
  }
  return 'warn'
}

export const logger = pino({
  level: resolveLogLevel(),
  serializers: {
    headers: redactSerializer,
    req: (req: Record<string, unknown>) => {
      const sanitized = { ...req }
      if (sanitized['headers'] && typeof sanitized['headers'] === 'object') {
        sanitized['headers'] = redactSerializer(sanitized['headers'])
      }
      return sanitized
    },
  },
  // Disable pretty print in test environment
  transport:
    process.env['NODE_ENV'] === 'development'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
})

/** Masks a token string for safe logging */
export function maskToken(token: string): string {
  if (!token || token.length < 8) return REDACTED
  return `${token.slice(0, 7)}...${REDACTED}`
}
