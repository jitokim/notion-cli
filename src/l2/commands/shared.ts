/**
 * L2: Shared command utilities.
 * Eliminates duplication of getClient, buildRegistry, getGlobalOptions.
 */

import { Command } from 'commander'
import type { NotionPort } from '../../l1/ports/notion-port.js'
import { FormatterRegistry } from '../formatters/formatter-registry.js'
import { JsonFormatter } from '../formatters/json-formatter.js'
import { TableFormatter } from '../formatters/table-formatter.js'
import { MarkdownFormatter } from '../formatters/markdown-formatter.js'
import type { GlobalOptions } from '../hooks/pre-action.js'
import { ValidationError } from '../../l1/errors/index.js'

/**
 * Walks the command hierarchy to find the root command.
 * page/db/block/user have 2 levels (subcommand → command → root),
 * while search has 1 level (subcommand → root), so we loop.
 */
export function getRootCommand(command: Command): Command {
  let current = command
  while (current.parent) current = current.parent
  return current
}

/**
 * Retrieves the NotionPort client from the root command.
 * Prints an error and exits with code 2 if the client is not set.
 */
export function getClient(command: Command): NotionPort {
  const rootCommand = getRootCommand(command)
  const client = rootCommand.getOptionValue('notionClient') as NotionPort | undefined
  if (!client) {
    process.stderr.write('Error: Not authenticated. Run `notion setup` first.\n')
    process.exit(2)
  }
  return client
}

/**
 * Creates a FormatterRegistry with json, table, and markdown formatters.
 */
export function buildRegistry(): FormatterRegistry {
  const registry = new FormatterRegistry()
  registry.register('json', new JsonFormatter())
  registry.register('table', new TableFormatter())
  registry.register('markdown', new MarkdownFormatter())
  return registry
}

/**
 * Reads GlobalOptions from the root command.
 */
export function getGlobalOptions(command: Command): GlobalOptions {
  const rootCommand = getRootCommand(command)
  return rootCommand.opts<GlobalOptions>()
}

/**
 * Parses a string as a positive integer.
 * Throws ValidationError for NaN, zero, or negative values.
 */
export function parsePositiveInt(value: string, optionName: string): number {
  const num = Number(value)
  if (!Number.isInteger(num) || num <= 0) {
    throw new ValidationError(
      `Invalid value for ${optionName}: "${value}". Must be a positive integer.`
    )
  }
  return num
}
