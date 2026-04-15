/**
 * L2: setup command.
 * Onboarding flow: token input → API ping → save to config.
 */

import { Command } from 'commander'
import { createInterface } from 'node:readline'
import { ConfigLoader } from '../../l0/config/index.js'
import { NotionClientAdapter } from '../../l0/client/notion-client-adapter.js'
import { handleError } from '../errors/cli-error-handler.js'

async function promptToken(): Promise<string> {
  process.stderr.write('Enter your Notion integration token (secret_...): ')

  const readline = createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
  })

  return new Promise((resolve) => {
    readline.once('line', (line: string) => {
      readline.close()
      process.stderr.write('\n')
      resolve(line.trim())
    })
  })
}

export function buildSetupCommand(): Command {
  return new Command('setup')
    .description('Set up Notion CLI with your integration token')
    .option('--token <token>', 'Notion integration token (use NOTION_TOKEN env instead)')
    .action(async (options: { token?: string }) => {
      try {
        let token = options.token ?? process.env['NOTION_TOKEN']

        if (!token) {
          token = await promptToken()
        }

        if (!token) {
          process.stderr.write('Error: Token is required.\n')
          process.exit(6)
        }

        if (!token.startsWith('secret_')) {
          process.stderr.write(
            'Warning: Token does not start with "secret_". Please verify your Notion integration token.\n'
          )
        }

        // Test connection
        process.stderr.write('Testing connection...\n')
        const client = new NotionClientAdapter(token)
        const user = await client.getMe()

        // Save to config
        const config = await ConfigLoader.load()
        config.token = token
        await ConfigLoader.save(config)

        process.stderr.write(
          `Setup complete! Connected as: ${user.name ?? user.id}\n`
        )
        process.stderr.write(
          `Config saved to: ${ConfigLoader.getConfigPath()}\n`
        )
      } catch (error) {
        handleError(error)
      }
    })
}
