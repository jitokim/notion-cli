/**
 * L2: comment command.
 * notion comment list | get | create
 */

import { Command } from 'commander'
import { NotionId } from '../../l1/types/notion-id.js'
import type { CommentResult } from '../../l1/types/index.js'
import { ValidationError } from '../../l1/errors/index.js'
import { handleError } from '../errors/cli-error-handler.js'
import { resolveOutputFormat } from '../formatters/formatter-registry.js'
import { getClient, buildRegistry, getGlobalOptions, parsePositiveInt } from './shared.js'

export function buildCommentCommand(): Command {
  const commentCommand = new Command('comment').description('Manage Notion comments')

  // comment list
  commentCommand
    .command('list')
    .description('List comments on a page or block')
    .requiredOption('--page-id <id>', 'Page ID or block ID to list comments for')
    .option('--limit <n>', 'Maximum number of comments', '20')
    .option('--all', 'Fetch all comments')
    .action(async (options: { pageId: string; limit: string; all?: boolean }, command: Command) => {
      try {
        const client = getClient(command)
        const globalOptions = getGlobalOptions(command)
        const parentId = NotionId.parse(options.pageId)

        const limit = options.all ? undefined : parsePositiveInt(options.limit, '--limit')
        const comments: CommentResult[] = []

        let count = 0
        for await (const comment of client.listComments(parentId)) {
          comments.push(comment)
          count++
          if (limit !== undefined && count >= limit) break
        }

        const registry = buildRegistry()
        const format = resolveOutputFormat(globalOptions.format, globalOptions.raw)
        const formatter = registry.get(format)
        const output = formatter.format(comments, {
          columns: globalOptions.columns?.split(',').map((c) => c.trim()),
        })

        if (output) process.stdout.write(`${output}\n`)
        if (!globalOptions.quiet) {
          process.stderr.write(`${comments.length} comment(s) found.\n`)
        }
      } catch (error) {
        handleError(error)
      }
    })

  // comment get
  commentCommand
    .command('get')
    .description('Retrieve a specific comment')
    .requiredOption('--comment-id <id>', 'Comment ID')
    .action(async (options: { commentId: string }, command: Command) => {
      try {
        const client = getClient(command)
        const globalOptions = getGlobalOptions(command)
        const commentId = NotionId.parse(options.commentId)

        const comment = await client.getComment(commentId)

        const registry = buildRegistry()
        const format = resolveOutputFormat(globalOptions.format, globalOptions.raw)
        const formatter = registry.get(format)
        const output = formatter.format([comment], {
          columns: globalOptions.columns?.split(',').map((c) => c.trim()),
        })

        if (output) process.stdout.write(`${output}\n`)
      } catch (error) {
        handleError(error)
      }
    })

  // comment create
  commentCommand
    .command('create')
    .description('Create a comment on a page or block')
    .option('--page-id <id>', 'Target page ID')
    .option('--block-id <id>', 'Target block ID (alternative to --page-id)')
    .requiredOption('--body <text>', 'Comment body text')
    .option('--discussion-id <id>', 'Reply to an existing discussion thread')
    .action(
      async (
        options: { pageId?: string; blockId?: string; body: string; discussionId?: string },
        command: Command
      ) => {
        try {
          if (options.discussionId) {
            if (options.pageId || options.blockId) {
              throw new ValidationError(
                '--discussion-id cannot be combined with --page-id or --block-id. ' +
                  'Use --discussion-id alone to reply to a thread.'
              )
            }
          } else {
            if (options.pageId && options.blockId) {
              throw new ValidationError('Cannot specify both --page-id and --block-id')
            }
            if (!options.pageId && !options.blockId) {
              throw new ValidationError(
                'Either --page-id, --block-id, or --discussion-id is required'
              )
            }
          }

          const client = getClient(command)
          const globalOptions = getGlobalOptions(command)

          let comment
          if (options.discussionId) {
            comment = await client.createComment({
              richText: options.body,
              discussionId: options.discussionId,
            })
          } else {
            const parentId = options.pageId
              ? NotionId.parse(options.pageId).toUuid()
              : NotionId.parse(options.blockId!).toUuid()

            const parentType = options.blockId ? 'block' : 'page'

            comment = await client.createComment({
              parentId,
              parentType,
              richText: options.body,
            })
          }

          const registry = buildRegistry()
          const format = resolveOutputFormat(globalOptions.format, globalOptions.raw)
          const formatter = registry.get(format)
          const output = formatter.format([comment])

          if (output) process.stdout.write(`${output}\n`)
          if (!globalOptions.quiet) {
            process.stderr.write(`Comment created: ${comment.id}\n`)
          }
        } catch (error) {
          handleError(error)
        }
      }
    )

  return commentCommand
}
