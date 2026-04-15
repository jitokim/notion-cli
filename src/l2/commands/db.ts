/**
 * L2: db command.
 * notion db list | get | query | create | update | templates
 */

import { Command } from 'commander'
import { NotionId } from '../../l1/types/notion-id.js'
import type { DataSourceResult, DataSourceTemplate, PageResult } from '../../l1/types/index.js'
import { handleError } from '../errors/cli-error-handler.js'
import { resolveOutputFormat } from '../formatters/formatter-registry.js'
import { ValidationError } from '../../l1/errors/index.js'
import { getClient, buildRegistry, getGlobalOptions, parsePositiveInt } from './shared.js'

export function buildDbCommand(): Command {
  const dbCommand = new Command('db').description('Manage Notion data sources (databases)')

  // db list
  dbCommand
    .command('list')
    .description('List data sources (databases)')
    .option('--limit <n>', 'Maximum number of results', '20')
    .option('--all', 'Fetch all data sources')
    .option('--start-cursor <cursor>', 'Resume pagination from cursor')
    .action(async (options: { limit: string; all?: boolean; startCursor?: string }, command: Command) => {
      try {
        const client = getClient(command)
        const globalOptions = getGlobalOptions(command)

        const limit = options.all ? undefined : parsePositiveInt(options.limit, '--limit')
        const dataSources: DataSourceResult[] = []

        let count = 0
        for await (const item of client.search({
          query: '',
          filter: { property: 'object', value: 'database' },
          startCursor: options.startCursor,
        })) {
          dataSources.push(item as DataSourceResult)
          count++
          if (limit !== undefined && count >= limit) break
        }

        const registry = buildRegistry()
        const format = resolveOutputFormat(globalOptions.format, globalOptions.raw)
        const formatter = registry.get(format)
        const output = formatter.format(dataSources, {
          columns: globalOptions.columns?.split(',').map((c) => c.trim()),
        })

        if (output) process.stdout.write(`${output}\n`)
        if (!globalOptions.quiet) {
          process.stderr.write(`${dataSources.length} data source(s) found.\n`)
        }
      } catch (error) {
        handleError(error)
      }
    })

  // db get
  dbCommand
    .command('get <id>')
    .description('Get a data source by ID or URL')
    .action(async (id: string, _options: unknown, command: Command) => {
      try {
        const client = getClient(command)
        const globalOptions = getGlobalOptions(command)
        const dataSourceId = NotionId.parse(id)
        const dataSource = await client.getDataSource(dataSourceId)

        const registry = buildRegistry()
        const format = resolveOutputFormat(globalOptions.format, globalOptions.raw)
        const formatter = registry.get(format)
        const output = formatter.format([dataSource], {
          columns: globalOptions.columns?.split(',').map((c) => c.trim()),
        })

        if (output) process.stdout.write(`${output}\n`)
      } catch (error) {
        handleError(error)
      }
    })

  // db query
  dbCommand
    .command('query <id>')
    .description('Query rows from a data source')
    .option('--filter <json>', 'Filter JSON (Notion filter syntax)')
    .option('--sort <json>', 'Sort JSON (Notion sort syntax)')
    .option('--limit <n>', 'Maximum number of results', '100')
    .option('--all', 'Fetch all rows')
    .option('--start-cursor <cursor>', 'Resume pagination from cursor')
    .action(
      async (
        id: string,
        options: { filter?: string; sort?: string; limit: string; all?: boolean; startCursor?: string },
        command: Command
      ) => {
        try {
          const client = getClient(command)
          const globalOptions = getGlobalOptions(command)
          const dataSourceId = NotionId.parse(id)

          let parsedFilter: Record<string, unknown> | undefined
          let parsedSorts: Array<Record<string, unknown>> | undefined

          if (options.filter) {
            try {
              parsedFilter = JSON.parse(options.filter) as Record<string, unknown>
            } catch {
              throw new ValidationError(`Invalid --filter JSON: ${options.filter}`)
            }
          }

          if (options.sort) {
            try {
              const parsed = JSON.parse(options.sort) as unknown
              parsedSorts = Array.isArray(parsed) ? parsed as Array<Record<string, unknown>> : [parsed as Record<string, unknown>]
            } catch {
              throw new ValidationError(`Invalid --sort JSON: ${options.sort}`)
            }
          }

          const limit = options.all ? undefined : parsePositiveInt(options.limit, '--limit')
          const rows: PageResult[] = []

          let count = 0
          for await (const row of client.queryDataSource(dataSourceId, {
            filter: parsedFilter,
            sorts: parsedSorts,
            startCursor: options.startCursor,
          })) {
            rows.push(row)
            count++
            if (limit !== undefined && count >= limit) break
          }

          const registry = buildRegistry()
          const format = resolveOutputFormat(globalOptions.format, globalOptions.raw)
          const formatter = registry.get(format)
          const output = formatter.format(rows, {
            columns: globalOptions.columns?.split(',').map((c) => c.trim()),
          })

          if (output) process.stdout.write(`${output}\n`)
          if (!globalOptions.quiet) {
            process.stderr.write(`${rows.length} row(s) found.\n`)
          }
        } catch (error) {
          handleError(error)
        }
      }
    )

  // db create
  dbCommand
    .command('create')
    .description('Create a new data source (database)')
    .requiredOption('--title <title>', 'Data source title')
    .requiredOption('--parent-id <id>', 'Parent page ID')
    .action(
      async (options: { title: string; parentId: string }, command: Command) => {
        try {
          const client = getClient(command)
          const globalOptions = getGlobalOptions(command)
          const parentId = NotionId.parse(options.parentId).toUuid()

          const dataSource = await client.createDataSource({
            parentId,
            parentType: 'page',
            title: options.title,
          })

          const registry = buildRegistry()
          const format = resolveOutputFormat(globalOptions.format, globalOptions.raw)
          const formatter = registry.get(format)
          const output = formatter.format([dataSource])

          if (output) process.stdout.write(`${output}\n`)
          if (!globalOptions.quiet) {
            process.stderr.write(`Data source created: ${dataSource.id}\n`)
          }
        } catch (error) {
          handleError(error)
        }
      }
    )

  // db update
  dbCommand
    .command('update <id>')
    .description('Update a data source (database)')
    .option('--title <title>', 'New data source title')
    .option('--description <desc>', 'New data source description')
    .action(
      async (id: string, options: { title?: string; description?: string }, command: Command) => {
        try {
          if (!options.title && !options.description) {
            throw new ValidationError('At least one update option is required (--title or --description)')
          }

          const client = getClient(command)
          const globalOptions = getGlobalOptions(command)
          const dataSourceId = NotionId.parse(id)

          const dataSource = await client.updateDataSource(dataSourceId, {
            title: options.title,
            description: options.description,
          })

          const registry = buildRegistry()
          const format = resolveOutputFormat(globalOptions.format, globalOptions.raw)
          const formatter = registry.get(format)
          const output = formatter.format([dataSource])

          if (output) process.stdout.write(`${output}\n`)
          if (!globalOptions.quiet) {
            process.stderr.write(`Data source updated: ${dataSource.id}\n`)
          }
        } catch (error) {
          handleError(error)
        }
      }
    )

  // db trash
  dbCommand
    .command('trash <id>')
    .description('Trash (archive) a data source')
    .option('-y, --yes', 'Skip confirmation prompt')
    .action(async (id: string, options: { yes?: boolean }, command: Command) => {
      try {
        if (!options.yes) {
          process.stderr.write(
            'Warning: This will archive the database and all its contents.\n' +
            'Pass --yes or -y to confirm.\n'
          )
          process.exit(1)
        }

        const client = getClient(command)
        const globalOptions = getGlobalOptions(command)
        const dataSourceId = NotionId.parse(id)
        const result = await client.trashDataSource(dataSourceId)

        if (!globalOptions.quiet) {
          process.stderr.write(`Data source trashed: ${result.id}\n`)
        }
      } catch (error) {
        handleError(error)
      }
    })

  // db templates
  dbCommand
    .command('templates <id>')
    .description('List templates for a data source')
    .action(async (id: string, _options: unknown, command: Command) => {
      try {
        const client = getClient(command)
        const globalOptions = getGlobalOptions(command)
        const dataSourceId = NotionId.parse(id)

        const templates: DataSourceTemplate[] = []
        for await (const template of client.listDataSourceTemplates(dataSourceId)) {
          templates.push(template)
        }

        const registry = buildRegistry()
        const format = resolveOutputFormat(globalOptions.format, globalOptions.raw)
        const formatter = registry.get(format)
        const output = formatter.format(templates, {
          columns: globalOptions.columns?.split(',').map((c) => c.trim()),
        })

        if (output) process.stdout.write(`${output}\n`)
        if (!globalOptions.quiet) {
          process.stderr.write(`${templates.length} template(s) found.\n`)
        }
      } catch (error) {
        handleError(error)
      }
    })

  return dbCommand
}
