/**
 * Notion CLI entry point.
 * Assembles the Commander.js program, registers global options and preAction hook.
 */

import { Command } from 'commander'
import { preAction } from './l2/hooks/pre-action.js'
import { buildCommentCommand } from './l2/commands/comment.js'
import { buildPageCommand } from './l2/commands/page.js'
import { buildDbCommand } from './l2/commands/db.js'
import { buildBlockCommand } from './l2/commands/block.js'
import { buildSearchCommand } from './l2/commands/search.js'
import { buildUserCommand } from './l2/commands/user.js'
import { buildConfigCommand } from './l2/commands/config-cmd.js'
import { buildPingCommand } from './l2/commands/ping.js'
import { buildSetupCommand } from './l2/commands/setup.js'
import { handleError } from './l2/errors/cli-error-handler.js'

// SIGPIPE: exit cleanly when a pipe consumer closes early
process.on('SIGPIPE', () => {
  process.exit(0)
})

// SIGINT: Ctrl+C exits with code 130 (POSIX convention)
process.on('SIGINT', () => {
  process.exit(130)
})

// Catch unhandled promise rejections
process.on('unhandledRejection', (reason) => {
  handleError(reason)
})

const program = new Command()

program
  .name('notion-cli')
  .description('Notion API CLI — interact with your Notion workspace from the terminal')
  .version('0.1.0', '-v, --version', 'Output the current version')
  // ─── Global options ────────────────────────────────────────────────────────
  .option('--token <token>', 'Notion integration token (use NOTION_TOKEN env instead)')
  .option(
    '--format <fmt>',
    'Output format: json, table, markdown (auto-detected from TTY)',
  )
  .option('--columns <cols>', 'Comma-separated columns to display in table format')
  .option('--verbose', 'Enable verbose logging')
  .option('--dry-run', 'Preview write operations without executing them')
  .option('--quiet', 'Suppress progress and success messages')
  .option('--raw', 'Output raw JSON (bypass table/markdown formatting)')

// preAction hook: resolve token + create NotionPort
program.hook('preAction', preAction)

// ─── Subcommand registration ────────────────────────────────────────────────
program.addCommand(buildSetupCommand())
program.addCommand(buildCommentCommand())
program.addCommand(buildPageCommand())
program.addCommand(buildDbCommand())
program.addCommand(buildBlockCommand())
program.addCommand(buildSearchCommand())
program.addCommand(buildUserCommand())
program.addCommand(buildConfigCommand())
program.addCommand(buildPingCommand())

// Handle unknown commands
program.on('command:*', (operands: string[]) => {
  // eslint-disable-next-line no-control-regex
  const safeCmd = String(operands[0]).replace(/[\x00-\x1f\x7f-\x9f]/g, '').slice(0, 40)
  process.stderr.write(
    `Error: unknown command '${safeCmd}'. Run 'notion-cli --help' for usage.\n`
  )
  process.exit(1)
})

program.parseAsync(process.argv).catch(handleError)
