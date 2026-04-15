/**
 * L2: block command.
 * notion block get | children | append | update | delete
 * notion block get/children/append/update/delete
 */

import { Command } from 'commander'
import type { NotionPort } from '../../l1/ports/notion-port.js'
import { NotionId } from '../../l1/types/notion-id.js'
import type { BlockResult } from '../../l1/types/index.js'
import { handleError } from '../errors/cli-error-handler.js'
import { resolveOutputFormat } from '../formatters/formatter-registry.js'
import { ValidationError } from '../../l1/errors/index.js'
import { getClient, buildRegistry, getGlobalOptions, parsePositiveInt } from './shared.js'

const DEFAULT_MAX_DEPTH = 5

const VALID_BLOCK_TYPES = new Set([
  'paragraph', 'heading_1', 'heading_2', 'heading_3',
  'bulleted_list_item', 'numbered_list_item', 'to_do', 'code',
  'toggle', 'quote', 'callout', 'divider',
])

/** Recursively collects a block tree, stopping early once limit is reached */
async function collectBlockChildren(
  client: NotionPort,
  blockId: NotionId,
  currentDepth: number,
  maxDepth: number,
  limit?: number,
  collected: BlockResult[] = []
): Promise<BlockResult[]> {
  if (currentDepth > maxDepth) return collected
  if (limit !== undefined && collected.length >= limit) return collected

  for await (const block of client.getBlockChildren(blockId)) {
    if (limit !== undefined && collected.length >= limit) break
    collected.push(block)
    if (block.has_children && currentDepth < maxDepth) {
      if (limit !== undefined && collected.length >= limit) break
      const childId = NotionId.parse(block.id)
      await collectBlockChildren(client, childId, currentDepth + 1, maxDepth, limit, collected)
    }
  }
  return collected
}

export function buildBlockCommand(): Command {
  const blockCommand = new Command('block').description('Manage Notion blocks')

  // block get
  blockCommand
    .command('get <id>')
    .description('Get a block by ID')
    .action(async (id: string, _options: unknown, command: Command) => {
      try {
        const client = getClient(command)
        const globalOptions = getGlobalOptions(command)
        const blockId = NotionId.parse(id)
        const block = await client.getBlock(blockId)

        const registry = buildRegistry()
        const format = resolveOutputFormat(globalOptions.format, globalOptions.raw)
        const formatter = registry.get(format)
        const output = formatter.format([block], {
          columns: globalOptions.columns?.split(',').map((c) => c.trim()),
        })

        if (output) process.stdout.write(`${output}\n`)
      } catch (error) {
        handleError(error)
      }
    })

  // block children
  blockCommand
    .command('children <id>')
    .description('Get children of a block')
    .option('--max-depth <n>', 'Maximum recursion depth', String(DEFAULT_MAX_DEPTH))
    .option('--limit <n>', 'Maximum number of blocks')
    .action(
      async (
        id: string,
        options: { maxDepth: string; limit?: string },
        command: Command
      ) => {
        try {
          const client = getClient(command)
          const globalOptions = getGlobalOptions(command)
          const blockId = NotionId.parse(id)
          const maxDepth = parsePositiveInt(options.maxDepth, '--max-depth')
          const limit = options.limit ? parsePositiveInt(options.limit, '--limit') : undefined

          const blocks = await collectBlockChildren(client, blockId, 1, maxDepth, limit)

          const registry = buildRegistry()
          const format = resolveOutputFormat(globalOptions.format, globalOptions.raw)
          const formatter = registry.get(format)
          const output = formatter.format(blocks, {
            columns: globalOptions.columns?.split(',').map((c) => c.trim()),
          })

          if (output) process.stdout.write(`${output}\n`)
          if (!globalOptions.quiet) {
            process.stderr.write(`${blocks.length} block(s) found.\n`)
          }
        } catch (error) {
          handleError(error)
        }
      }
    )

  // block append
  blockCommand
    .command('append <id>')
    .description('Append content to a block')
    .requiredOption('--content <text>', 'Content to append')
    .option(
      '--type <type>',
      'Block type (paragraph, heading_1, heading_2, bulleted_list_item, etc.)',
      'paragraph'
    )
    .option('--after-block <id>', 'Insert after this block ID')
    .action(
      async (
        id: string,
        options: { content: string; type: string; afterBlock?: string },
        command: Command
      ) => {
        try {
          const client = getClient(command)
          const globalOptions = getGlobalOptions(command)
          const blockId = NotionId.parse(id)

          if (!VALID_BLOCK_TYPES.has(options.type)) {
            throw new ValidationError(
              `Invalid block type: "${options.type}". Valid: ${[...VALID_BLOCK_TYPES].join(', ')}`
            )
          }

          const afterBlockId = options.afterBlock
            ? NotionId.parse(options.afterBlock).toUuid()
            : undefined

          const appended = await client.appendBlockChildren(blockId, {
            children: [
              {
                type: options.type as 'paragraph' | 'heading_1' | 'heading_2' | 'heading_3' | 'bulleted_list_item' | 'numbered_list_item' | 'to_do' | 'code',
                content: options.content,
              },
            ],
            after: afterBlockId,
          })

          if (!globalOptions.quiet) {
            process.stderr.write(`${appended.length} block(s) appended.\n`)
          }

          const registry = buildRegistry()
          const format = resolveOutputFormat(globalOptions.format, globalOptions.raw)
          const formatter = registry.get(format)
          const output = formatter.format(appended)
          if (output) process.stdout.write(`${output}\n`)
        } catch (error) {
          handleError(error)
        }
      }
    )

  // block update
  blockCommand
    .command('update <id>')
    .description('Update a block content')
    .requiredOption('--content <text>', 'New content')
    .option('--type <type>', 'Block type', 'paragraph')
    .action(
      async (
        id: string,
        options: { content: string; type: string },
        command: Command
      ) => {
        try {
          const client = getClient(command)
          const globalOptions = getGlobalOptions(command)
          const blockId = NotionId.parse(id)

          if (!VALID_BLOCK_TYPES.has(options.type)) {
            throw new ValidationError(
              `Invalid block type: "${options.type}". Valid: ${[...VALID_BLOCK_TYPES].join(', ')}`
            )
          }

          const block = await client.updateBlock(blockId, {
            content: options.content,
            type: options.type,
          })

          if (!globalOptions.quiet) {
            process.stderr.write(`Block updated: ${block.id}\n`)
          }

          const registry = buildRegistry()
          const format = resolveOutputFormat(globalOptions.format, globalOptions.raw)
          const formatter = registry.get(format)
          const output = formatter.format([block])
          if (output) process.stdout.write(`${output}\n`)
        } catch (error) {
          handleError(error)
        }
      }
    )

  // block delete
  blockCommand
    .command('delete <id>')
    .description('Delete a block')
    .action(async (id: string, _options: unknown, command: Command) => {
      try {
        const client = getClient(command)
        const globalOptions = getGlobalOptions(command)
        const blockId = NotionId.parse(id)

        await client.deleteBlock(blockId)

        if (!globalOptions.quiet) {
          process.stderr.write(`Block deleted: ${blockId.toUuid()}\n`)
        }
      } catch (error) {
        handleError(error)
      }
    })

  return blockCommand
}
