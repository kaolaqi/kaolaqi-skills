# kaolaqi-skills — Project Guidelines

## Project Overview

This is a personal monorepo of Claude Code skills (MCP servers) for daily work and life automation.
Each skill lives in `skills/<name>/` and is a self-contained MCP server.

## Language & Tech Stack

- **Server language: TypeScript only** — no Python, no plain JavaScript server code
- **Runtime: Node.js >= 18** — use native `fetch`, `AbortSignal.timeout()`, no extra HTTP libraries
- **Module format: ESM** — `"type": "module"` in all `package.json`, `.js` extensions in imports
- **Package manager: npm** with workspaces

## Project Structure

```
kaolaqi-skills/
├── CLAUDE.md                  # This file
├── tsconfig.base.json         # Shared TS config
├── package.json               # Workspace root
├── scripts/
│   ├── install.sh             # Install all skills into Claude Code
│   └── update.sh              # Update/rebuild all skills
└── skills/
    └── <skill-name>/
        ├── package.json
        ├── tsconfig.json      # Extends ../../tsconfig.base.json
        ├── SKILL.md           # Skill definition (triggers, workflow)
        ├── reference/         # Optional .md templates
        └── src/
            └── index.ts       # MCP server entry point
```

## Coding Rules

1. **TypeScript strict mode** — `"strict": true` always, no `any` unless absolutely unavoidable
2. **No runtime dependencies beyond MCP SDK** — use Node.js built-ins (`fs`, `path`, `os`, `crypto`)
3. **Error handling** — throw descriptive `Error` objects; surface them to MCP as `{ error, type }` JSON
4. **File I/O** — synchronous (`readFileSync`, `writeFileSync`) for config; async (`fetch`) for network
5. **Timeouts** — all `fetch` calls must use `AbortSignal.timeout(30000)`
6. **No `console.log`** — use `process.stderr.write()` for debug output; stdout is reserved for MCP protocol

## MCP Server Pattern

Each skill's `src/index.ts` follows this structure:

```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const server = new Server({ name: '<skill>', version: '0.1.0' }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [...] }));
server.setRequestHandler(CallToolRequestSchema, async (request) => { ... });

const transport = new StdioServerTransport();
await server.connect(transport);
```

## Commit Conventions

- `feat: <description>` — new skill or major feature
- `fix: <description>` — bug fix
- `refactor: <description>` — code restructure without behavior change
- `chore: <description>` — build, deps, scripts

## Adding a New Skill

1. Create `skills/<name>/` with the structure above
2. `tsconfig.json` must extend `../../tsconfig.base.json`
3. Add install entry in `scripts/install.sh`
4. Document trigger phrases in `SKILL.md`
5. Run `npm install` from workspace root
