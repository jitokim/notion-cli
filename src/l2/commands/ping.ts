/**
 * L2: ping command.
 * Verifies Notion API connectivity.
 */

import { Command } from 'commander'
import type { NotionPort } from '../../l1/ports/notion-port.js'
import { handleError } from '../errors/cli-error-handler.js'

export function buildPingCommand(): Command {
  return new Command('ping')
    .description('Check Notion API connectivity')
    .action(async (_options, command: Command) => {
      const rootCommand = command.parent ?? command
      const notionClient: NotionPort | undefined = rootCommand.getOptionValue('notionClient') as NotionPort | undefined

      if (!notionClient) {
        process.stderr.write('Error: Not authenticated. Run `notion setup` first.\n')
        process.exit(2)
      }

      try {
        const start = Date.now()
        const user = await notionClient.getMe()
        const elapsed = Date.now() - start

        process.stderr.write(`Pong! Connected as ${user.name ?? user.id} (${elapsed}ms)\n`)
        process.exit(0)
      } catch (error) {
        handleError(error)
      }
    })
}
