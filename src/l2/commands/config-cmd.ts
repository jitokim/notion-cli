/**
 * L2: config command.
 * notion config get | set | list | reset
 * notion config set/get/list/reset
 */

import { Command } from 'commander'
import { ConfigLoader, type NotionCliConfig } from '../../l0/config/index.js'
import { handleError } from '../errors/cli-error-handler.js'
import { ValidationError } from '../../l1/errors/index.js'

const KNOWN_CONFIG_KEYS = new Set<string>(['token', 'defaultFormat'])
const VALID_FORMATS = new Set(['json', 'table', 'markdown'])

export function buildConfigCommand(): Command {
  const configCommand = new Command('config').description(
    'Manage notion-cli configuration'
  )

  configCommand
    .command('set <key> <value>')
    .description('Set a configuration value')
    .action(async (key: string, value: string) => {
      try {
        if (!KNOWN_CONFIG_KEYS.has(key)) {
          process.stderr.write(`Warning: "${key}" is not a recognized config key.\n`)
        }

        if (key === 'defaultFormat' && !VALID_FORMATS.has(value)) {
          throw new ValidationError(
            `Invalid value "${value}" for defaultFormat. Must be one of: ${[...VALID_FORMATS].join(', ')}`
          )
        }

        if (key === 'token') {
          process.stderr.write(
            'Warning: Token will be visible in shell history. Consider using `notion setup` or NOTION_TOKEN env var instead.\n'
          )
        }

        const config = await ConfigLoader.load()
        config[key] = value
        await ConfigLoader.save(config)
        const displayValue = key === 'token' && typeof value === 'string'
          ? `${value.slice(0, 7)}...***REDACTED***`
          : String(value)
        process.stderr.write(`✓ Config: ${key} = ${displayValue}\n`)
      } catch (error) {
        handleError(error)
      }
    })

  configCommand
    .command('get <key>')
    .description('Get a configuration value')
    .action(async (key: string) => {
      try {
        const config = await ConfigLoader.load()
        const value = config[key]
        if (value === undefined) {
          process.stderr.write(`Config key "${key}" is not set.\n`)
          process.exit(0)
        }
        const displayValue = key === 'token' && typeof value === 'string'
          ? `${value.slice(0, 7)}...***REDACTED***`
          : String(value)
        process.stdout.write(`${displayValue}\n`)
      } catch (error) {
        handleError(error)
      }
    })

  configCommand
    .command('list')
    .description('List all configuration values')
    .action(async () => {
      try {
        const config = await ConfigLoader.load()
        const entries = Object.entries(config)
        if (entries.length === 0) {
          process.stderr.write('No configuration values set.\n')
          process.exit(0)
        }
        const output = Object.fromEntries(
          entries.map(([key, value]) => {
            // Mask token value for security
            if (key === 'token' && typeof value === 'string') {
              return [key, `${value.slice(0, 7)}...***REDACTED***`]
            }
            return [key, value]
          })
        ) as NotionCliConfig
        process.stdout.write(`${JSON.stringify(output, null, 2)}\n`)
      } catch (error) {
        handleError(error)
      }
    })

  configCommand
    .command('reset')
    .description('Reset all configuration')
    .action(async () => {
      try {
        await ConfigLoader.reset()
        process.stderr.write('Configuration reset.\n')
      } catch (error) {
        handleError(error)
      }
    })

  configCommand
    .command('path')
    .description('Show configuration file path')
    .action(() => {
      process.stdout.write(`${ConfigLoader.getConfigPath()}\n`)
    })

  return configCommand
}
