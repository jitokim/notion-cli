/**
 * L2: user command.
 * notion user list | me | get
 */

import { Command } from 'commander'
import type { UserResult } from '../../l1/types/index.js'
import { NotionId } from '../../l1/types/notion-id.js'
import { handleError } from '../errors/cli-error-handler.js'
import { resolveOutputFormat } from '../formatters/formatter-registry.js'
import { getClient, buildRegistry, getGlobalOptions, parsePositiveInt } from './shared.js'

export function buildUserCommand(): Command {
  const userCommand = new Command('user').description('Manage Notion users')

  // user list
  userCommand
    .command('list')
    .description('List workspace users')
    .option('--limit <n>', 'Maximum number of users', '100')
    .option('--all', 'Fetch all users')
    .action(async (options: { limit: string; all?: boolean }, command: Command) => {
      try {
        const client = getClient(command)
        const globalOptions = getGlobalOptions(command)

        const limit = options.all ? undefined : parsePositiveInt(options.limit, '--limit')
        const users: UserResult[] = []

        let count = 0
        for await (const user of client.listUsers()) {
          users.push(user)
          count++
          if (limit !== undefined && count >= limit) break
        }

        const registry = buildRegistry()
        const format = resolveOutputFormat(globalOptions.format, globalOptions.raw)
        const formatter = registry.get(format)
        const output = formatter.format(users, {
          columns: globalOptions.columns?.split(',').map((c) => c.trim()),
        })

        if (output) process.stdout.write(`${output}\n`)
        if (!globalOptions.quiet) {
          process.stderr.write(`${users.length} user(s) found.\n`)
        }
      } catch (error) {
        handleError(error)
      }
    })

  // user me
  userCommand
    .command('me')
    .description('Get the authenticated user (bot)')
    .action(async (_options: unknown, command: Command) => {
      try {
        const client = getClient(command)
        const globalOptions = getGlobalOptions(command)
        const user = await client.getMe()

        const registry = buildRegistry()
        const format = resolveOutputFormat(globalOptions.format, globalOptions.raw)
        const formatter = registry.get(format)
        const output = formatter.format([user], {
          columns: globalOptions.columns?.split(',').map((c) => c.trim()),
        })

        if (output) process.stdout.write(`${output}\n`)
      } catch (error) {
        handleError(error)
      }
    })

  // user get
  userCommand
    .command('get <id>')
    .description('Get a user by ID')
    .action(async (id: string, _options: unknown, command: Command) => {
      try {
        const client = getClient(command)
        const globalOptions = getGlobalOptions(command)
        const userId = NotionId.parse(id)
        const user = await client.getUser(userId)

        const registry = buildRegistry()
        const format = resolveOutputFormat(globalOptions.format, globalOptions.raw)
        const formatter = registry.get(format)
        const output = formatter.format([user], {
          columns: globalOptions.columns?.split(',').map((c) => c.trim()),
        })

        if (output) process.stdout.write(`${output}\n`)
      } catch (error) {
        handleError(error)
      }
    })

  return userCommand
}
