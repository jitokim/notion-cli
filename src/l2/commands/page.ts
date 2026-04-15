/**
 * L2: page command.
 * notion page list | get | create | update | trash | move | property | markdown
 * notion page list/get/create/update/trash/move/property/markdown/markdown-update
 */

import { Command } from 'commander'
import fs from 'node:fs'
import { NotionId } from '../../l1/types/notion-id.js'
import type { PageResult } from '../../l1/types/index.js'
import { ValidationError } from '../../l1/errors/index.js'
import { handleError } from '../errors/cli-error-handler.js'
import { resolveOutputFormat } from '../formatters/formatter-registry.js'
import { getClient, buildRegistry, getGlobalOptions, parsePositiveInt } from './shared.js'

const VALID_PARENT_TYPES = new Set(['page', 'database'])

export function buildPageCommand(): Command {
  const pageCommand = new Command('page').description('Manage Notion pages')

  // page list
  pageCommand
    .command('list')
    .description('List pages (via search)')
    .option('--limit <n>', 'Maximum number of results', '20')
    .option('--all', 'Fetch all pages')
    .option('--start-cursor <cursor>', 'Resume pagination from cursor')
    .action(async (options: { limit: string; all?: boolean; startCursor?: string }, command: Command) => {
      try {
        const client = getClient(command)
        const globalOptions = getGlobalOptions(command)

        const limit = options.all ? undefined : parsePositiveInt(options.limit, '--limit')
        const pages: PageResult[] = []

        let count = 0
        for await (const item of client.search({
          query: '',
          filter: { property: 'object', value: 'page' },
          startCursor: options.startCursor,
        })) {
          pages.push(item as PageResult)
          count++
          if (limit !== undefined && count >= limit) break
        }

        const registry = buildRegistry()
        const format = resolveOutputFormat(globalOptions.format, globalOptions.raw)
        const formatter = registry.get(format)
        const output = formatter.format(pages, {
          columns: globalOptions.columns?.split(',').map((c) => c.trim()),
        })

        if (output) process.stdout.write(`${output}\n`)
        if (!globalOptions.quiet) {
          process.stderr.write(`${pages.length} page(s) found.\n`)
        }
      } catch (error) {
        handleError(error)
      }
    })

  // page get
  pageCommand
    .command('get <id>')
    .description('Get a page by ID or URL')
    .action(async (id: string, _options: unknown, command: Command) => {
      try {
        const client = getClient(command)
        const globalOptions = getGlobalOptions(command)
        const pageId = NotionId.parse(id)
        const page = await client.getPage(pageId)

        const registry = buildRegistry()
        const format = resolveOutputFormat(globalOptions.format, globalOptions.raw)
        const formatter = registry.get(format)
        const output = formatter.format([page], {
          columns: globalOptions.columns?.split(',').map((c) => c.trim()),
        })

        if (output) process.stdout.write(`${output}\n`)
      } catch (error) {
        handleError(error)
      }
    })

  // page create
  pageCommand
    .command('create')
    .description('Create a new page')
    .requiredOption('--title <title>', 'Page title')
    .requiredOption('--parent-id <id>', 'Parent page or database ID')
    .option('--parent-type <type>', 'Parent type: page or database', 'page')
    .action(
      async (
        options: { title: string; parentId: string; parentType: string },
        command: Command
      ) => {
        try {
          if (!VALID_PARENT_TYPES.has(options.parentType)) {
            throw new ValidationError(
              `Invalid --parent-type "${options.parentType}". Must be one of: page, database`
            )
          }

          const client = getClient(command)
          const globalOptions = getGlobalOptions(command)
          const parentType = options.parentType as 'page' | 'database'
          const parentId = NotionId.parse(options.parentId).toUuid()

          const page = await client.createPage({
            parentId,
            parentType,
            title: options.title,
          })

          const registry = buildRegistry()
          const format = resolveOutputFormat(globalOptions.format, globalOptions.raw)
          const formatter = registry.get(format)
          const output = formatter.format([page])

          if (output) process.stdout.write(`${output}\n`)
          if (!globalOptions.quiet) {
            process.stderr.write(`Page created: ${page.id}\n`)
          }
        } catch (error) {
          handleError(error)
        }
      }
    )

  // page update
  pageCommand
    .command('update <id>')
    .description('Update a page')
    .option('--title <title>', 'New page title')
    .action(
      async (id: string, options: { title?: string }, command: Command) => {
        try {
          if (!options.title) {
            throw new ValidationError('At least one update option is required (e.g., --title)')
          }

          const client = getClient(command)
          const globalOptions = getGlobalOptions(command)
          const pageId = NotionId.parse(id)

          const page = await client.updatePage(pageId, {
            title: options.title,
          })

          const registry = buildRegistry()
          const format = resolveOutputFormat(globalOptions.format, globalOptions.raw)
          const formatter = registry.get(format)
          const output = formatter.format([page])

          if (output) process.stdout.write(`${output}\n`)
          if (!globalOptions.quiet) {
            process.stderr.write(`Page updated: ${page.id}\n`)
          }
        } catch (error) {
          handleError(error)
        }
      }
    )

  // page trash
  pageCommand
    .command('trash <id>')
    .description('Move a page to trash')
    .action(async (id: string, _options: unknown, command: Command) => {
      try {
        const client = getClient(command)
        const globalOptions = getGlobalOptions(command)
        const pageId = NotionId.parse(id)

        const page = await client.trashPage(pageId)

        if (!globalOptions.quiet) {
          process.stderr.write(`Page moved to trash: ${page.id}\n`)
        }
      } catch (error) {
        handleError(error)
      }
    })

  // page move
  pageCommand
    .command('move <id>')
    .description('Move a page to a different parent')
    .requiredOption('--parent-id <id>', 'New parent page or database ID')
    .option('--parent-type <type>', 'Parent type: page or database', 'page')
    .action(
      async (id: string, options: { parentId: string; parentType: string }, command: Command) => {
        try {
          if (!VALID_PARENT_TYPES.has(options.parentType)) {
            throw new ValidationError(
              `Invalid --parent-type "${options.parentType}". Must be one of: page, database`
            )
          }

          const client = getClient(command)
          const globalOptions = getGlobalOptions(command)
          const pageId = NotionId.parse(id)
          const parentId = NotionId.parse(options.parentId).toUuid()
          const parentType = options.parentType as 'page' | 'database'

          const page = await client.movePage(pageId, { parentId, parentType })

          const registry = buildRegistry()
          const format = resolveOutputFormat(globalOptions.format, globalOptions.raw)
          const formatter = registry.get(format)
          const output = formatter.format([page])

          if (output) process.stdout.write(`${output}\n`)
          if (!globalOptions.quiet) {
            process.stderr.write(`Page moved: ${page.id}\n`)
          }
        } catch (error) {
          handleError(error)
        }
      }
    )

  // page property
  pageCommand
    .command('property <id> <property-id>')
    .description('Get a page property item')
    .option('--all', 'Auto-paginate (for rollup/relation properties with many items)')
    .action(async (id: string, propertyId: string, options: { all?: boolean }, command: Command) => {
      try {
        const client = getClient(command)
        const globalOptions = getGlobalOptions(command)
        const pageId = NotionId.parse(id)

        const registry = buildRegistry()
        const format = resolveOutputFormat(globalOptions.format, globalOptions.raw)
        const formatter = registry.get(format)

        const items = options.all
          ? await (async () => {
              const collected = []
              for await (const item of client.getPagePropertyAll(pageId, propertyId)) {
                collected.push(item)
              }
              return collected
            })()
          : [await client.getPageProperty(pageId, propertyId)]

        const output = formatter.format(items, {
          columns: globalOptions.columns?.split(',').map((c) => c.trim()),
        })
        if (output) process.stdout.write(`${output}\n`)
      } catch (error) {
        handleError(error)
      }
    })

  // page markdown
  pageCommand
    .command('markdown <id>')
    .description('Get page content as Markdown')
    .action(async (id: string, _options: unknown, command: Command) => {
      try {
        const client = getClient(command)
        const pageId = NotionId.parse(id)
        const markdown = await client.getPageMarkdown(pageId)

        process.stdout.write(markdown)
      } catch (error) {
        handleError(error)
      }
    })

  // page markdown-update
  pageCommand
    .command('markdown-update <id>')
    .description('Update page content from Markdown')
    .option('--file <path>', 'Read Markdown from file')
    .option('--body <text>', 'Inline Markdown text')
    .action(
      async (id: string, options: { file?: string; body?: string }, command: Command) => {
        try {
          if (options.file && options.body) {
            throw new ValidationError('Cannot specify both --file and --body')
          }
          if (!options.file && !options.body) {
            throw new ValidationError('Either --file or --body is required')
          }

          const client = getClient(command)
          const globalOptions = getGlobalOptions(command)
          const pageId = NotionId.parse(id)

          const markdown = options.file
            ? fs.readFileSync(options.file, 'utf-8')
            : options.body!

          const page = await client.updatePageMarkdown(pageId, markdown)

          const registry = buildRegistry()
          const format = resolveOutputFormat(globalOptions.format, globalOptions.raw)
          const formatter = registry.get(format)
          const output = formatter.format([page])

          if (output) process.stdout.write(`${output}\n`)
          if (!globalOptions.quiet) {
            process.stderr.write(`Page content updated: ${page.id}\n`)
          }
        } catch (error) {
          handleError(error)
        }
      }
    )

  return pageCommand
}
