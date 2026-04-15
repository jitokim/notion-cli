/**
 * L2: PreAction Hook.
 * Runs in the Commander.js preAction lifecycle.
 * - Resolves the authentication token (flag → env → config).
 * - Creates the NotionPort implementation and injects it into the Command.
 */

import type { Command } from 'commander'
import { ConfigLoader } from '../../l0/config/index.js'
import { NotionClientAdapter } from '../../l0/client/notion-client-adapter.js'
import { DryRunAdapter } from '../../l0/client/dry-run-adapter.js'
import { AuthenticationError } from '../../l1/errors/index.js'
import { logger } from '../../l0/logger/index.js'

/** Config-only commands: can run without a token */
const CONFIG_ONLY_COMMANDS = new Set(['setup', 'config'])

export interface GlobalOptions {
  token?: string
  format?: string
  verbose?: boolean
  dryRun?: boolean
  quiet?: boolean
  raw?: boolean
  columns?: string
}

export async function preAction(
  thisCommand: Command,
  actionCommand: Command
): Promise<void> {
  const rootCommand = thisCommand.parent ?? thisCommand
  const globalOptions = rootCommand.opts<GlobalOptions>()

  // Verbose mode: set log level to debug
  if (globalOptions.verbose) {
    logger.level = 'debug'
  }

  // Config-only commands can run without a token.
  // actionCommand = the actual leaf command being executed (thisCommand = root).
  const commandName = actionCommand.name()
  const parentName = actionCommand.parent?.name()
  if (
    CONFIG_ONLY_COMMANDS.has(commandName) ||
    (parentName && CONFIG_ONLY_COMMANDS.has(parentName))
  ) {
    return
  }

  // Resolve token
  const token = await ConfigLoader.getToken(globalOptions.token)

  if (!token) {
    throw new AuthenticationError(
      'No Notion token found. Run `notion setup` or set NOTION_TOKEN environment variable.'
    )
  }

  // Warn when using the --token flag
  if (globalOptions.token) {
    process.stderr.write(
      'Warning: Using --token flag is not recommended. Use NOTION_TOKEN environment variable instead.\n'
    )
  }

  // Create NotionPort implementation
  const notionClient = globalOptions.dryRun
    ? new DryRunAdapter(token)
    : new NotionClientAdapter(token)

  // Inject client into the Command (setConfig pattern)
  thisCommand.setOptionValueWithSource('notionClient', notionClient, 'default')
  rootCommand.setOptionValueWithSource('notionClient', notionClient, 'default')
}
