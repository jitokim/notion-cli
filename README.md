# notion-cli

A command-line interface for the Notion API — interact with pages, databases, blocks, and more directly from your terminal.

[![npm](https://img.shields.io/npm/v/@jitokim/notion-cli)](https://www.npmjs.com/package/@jitokim/notion-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js >= 20](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)

## Installation

```bash
npm install -g @jitokim/notion-cli
```

Requires Node.js 20 or later.

## Quick Start

**1. Set your Notion integration token:**

```bash
notion-cli setup
```

This stores your token in `~/.config/notion-cli/config.json` (XDG-compliant).
Alternatively, set the `NOTION_TOKEN` environment variable.

**2. Verify the connection:**

```bash
notion-cli ping
# Pong! Connected as My Bot (142ms)
```

**3. List your pages:**

```bash
notion-cli page list
```

## Commands

### page

```bash
notion-cli page list [--limit <n>] [--all]
notion-cli page get <id>
notion-cli page create --title <title> --parent-id <id> [--parent-type page|database]
notion-cli page update <id> [--title <title>]
notion-cli page trash <id>
notion-cli page move <id> --parent-id <id> [--parent-type page|database]
notion-cli page property <id> <property-id>
notion-cli page markdown <id>               # Get page content as Markdown
notion-cli page markdown-update <id> --file <path>   # Update from file
notion-cli page markdown-update <id> --body <text>   # Update inline
```

### db

```bash
notion-cli db list [--limit <n>] [--all]
notion-cli db get <id>
notion-cli db create --title <title> --parent-id <id>
notion-cli db update <id> [--title <title>] [--description <desc>]
notion-cli db query <id> [--filter <json>] [--sort <json>] [--limit <n>] [--all]
notion-cli db templates <id>
```

### block

```bash
notion-cli block get <id>
notion-cli block children <id> [--max-depth <n>] [--limit <n>]
notion-cli block append <id> --content <text> [--type <type>] [--after-block <id>]
notion-cli block update <id> --content <text> [--type <type>]
notion-cli block delete <id>
```

### user

```bash
notion-cli user list [--limit <n>] [--all]
notion-cli user me
notion-cli user get <id>
```

### comment

```bash
notion-cli comment list --target-id <id> [--limit <n>] [--all]
notion-cli comment create --page-id <id> --body <text>
notion-cli comment create --block-id <id> --body <text> [--discussion-id <id>]
```

### search

```bash
notion-cli search <query> [--filter page|data_source] [--sort relevance|last_edited] [--limit <n>] [--all]
```

### setup / config

```bash
notion-cli setup [--token <token>]   # Interactive token setup
notion-cli config set <key> <value>
notion-cli config get <key>
notion-cli config list
notion-cli config reset
notion-cli config path               # Show config file location
```

### ping

```bash
notion-cli ping   # Check Notion API connectivity
```

## Global Options

These options are available on every command:

| Option | Description |
|--------|-------------|
| `--format json\|table\|markdown` | Output format (auto-detected from TTY) |
| `--columns <cols>` | Comma-separated list of columns to display in table format |
| `--token <token>` | Notion integration token (overrides config and env) |
| `--verbose` | Enable verbose logging |
| `--dry-run` | Preview write operations without executing them |
| `--quiet` | Suppress progress and success messages |
| `--raw` | Disable output sanitization (forces JSON) |
| `-v, --version` | Print version |

**TTY-aware output:** When writing to a terminal, output defaults to `table` format. When piping to another command, output defaults to `json` automatically.

## Configuration

**Environment variable:**

```bash
export NOTION_TOKEN=secret_xxxxxxxxxxxx
```

**Interactive setup:**

```bash
notion-cli setup
```

**Manual config:**

```bash
notion-cli config set token secret_xxxxxxxxxxxx
notion-cli config set defaultFormat json
```

Config file is stored at `~/.config/notion-cli/config.json` (or `$XDG_CONFIG_HOME/notion-cli/config.json`).

Token resolution order: `--token` flag > `NOTION_TOKEN` env > config file.

## Examples

**Export a database to JSON:**

```bash
notion-cli db query <database-id> --all --format json > export.json
```

**Pipe page list into jq:**

```bash
notion-cli page list --all | jq '.[].id'
```

**Update a page from a Markdown file:**

```bash
notion-cli page markdown-update <page-id> --file notes.md
```

**Query a database with a filter:**

```bash
notion-cli db query <database-id> \
  --filter '{"property":"Status","select":{"equals":"Done"}}' \
  --sort '[{"property":"Created","direction":"descending"}]'
```

**Dry-run a destructive operation:**

```bash
notion-cli page trash <page-id> --dry-run
# [dry-run] Would trash page: <page-id>
```

**Select specific columns in table output:**

```bash
notion-cli page list --columns id,title,last_edited_time
```

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/my-feature`
3. Install dependencies: `pnpm install`
4. Run tests: `pnpm test`
5. Build: `pnpm build`
6. Submit a pull request

```bash
pnpm install
pnpm build
pnpm test
```

## License

MIT — see [LICENSE](LICENSE) for details.
