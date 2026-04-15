/**
 * L2: search command.
 * notion search <query>
 * notion search <query>
 */

import { Command } from 'commander'
import type { PageResult, DataSourceResult } from '../../l1/types/index.js'
import { ValidationError } from '../../l1/errors/index.js'
import { handleError } from '../errors/cli-error-handler.js'
import { resolveOutputFormat } from '../formatters/formatter-registry.js'
import { getClient, buildRegistry, getGlobalOptions, parsePositiveInt } from './shared.js'

export function buildSearchCommand(): Command {
  return new Command('search')
    .description('Search pages and data sources')
    .argument('<query>', 'Search query')
    .option('--filter <type>', 'Filter by type: page or data_source')
    .option('--sort <sort>', 'Sort: relevance or last_edited', 'relevance')
    .option('--limit <n>', 'Maximum number of results', '20')
    .option('--all', 'Fetch all results')
    .option('--start-cursor <cursor>', 'Resume pagination from cursor')
    .action(
      async (
        query: string,
        options: {
          filter?: string
          sort: string
          limit: string
          all?: boolean
          startCursor?: string
        },
        command: Command
      ) => {
        try {
          // Validate non-empty search query
          if (!query.trim()) {
            throw new ValidationError(
              'Search query cannot be empty. Use `notion db list` or `notion page list` to list all resources.'
            )
          }

          const client = getClient(command)
          const globalOptions = getGlobalOptions(command)

          // Validate filter option
          let filterValue: 'page' | 'database' | undefined
          if (options.filter === 'page') {
            filterValue = 'page'
          } else if (options.filter === 'data_source' || options.filter === 'database') {
            filterValue = 'database'
          } else if (options.filter) {
            throw new ValidationError(
              `Invalid --filter value: "${options.filter}". Use: page or data_source`
            )
          }

          const sortDirection =
            options.sort === 'last_edited'
              ? ({ direction: 'descending', timestamp: 'last_edited_time' } as const)
              : undefined

          const limit = options.all ? undefined : parsePositiveInt(options.limit, '--limit')
          const results: (PageResult | DataSourceResult)[] = []

          let count = 0
          for await (const item of client.search({
            query,
            filter: filterValue ? { property: 'object', value: filterValue } : undefined,
            sort: sortDirection,
            startCursor: options.startCursor,
          })) {
            results.push(item)
            count++
            if (limit !== undefined && count >= limit) break
          }

          const registry = buildRegistry()
          const format = resolveOutputFormat(globalOptions.format, globalOptions.raw)
          const formatter = registry.get(format)
          const output = formatter.format(results, {
            columns: globalOptions.columns?.split(',').map((c) => c.trim()),
          })

          if (output) process.stdout.write(`${output}\n`)
          if (!globalOptions.quiet) {
            process.stderr.write(`${results.length} result(s) for "${query}".\n`)
          }
        } catch (error) {
          handleError(error)
        }
      }
    )
}
