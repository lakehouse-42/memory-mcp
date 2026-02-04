# @lakehouse/memory-mcp

Persistent memory for AI assistants via [Model Context Protocol (MCP)](https://modelcontextprotocol.io).

Give your AI assistant a memory that persists across conversations. Works with **Claude Code**, **Claude Desktop**, **Cursor**, **Windsurf**, and any MCP-compatible client.

## Features

- **Remember** - Store facts, preferences, tasks, and context
- **Recall** - Semantic search to find relevant memories
- **Forget** - Remove outdated information
- **Two modes**:
  - **Lakehouse42** (recommended) - Full semantic search, deduplication, knowledge graph
  - **Local** - Simple file-based storage with keyword search

## Quick Start

### Claude Code

Add to `~/.claude/claude_code_config.json`:

```json
{
  "mcpServers": {
    "memory": {
      "command": "npx",
      "args": ["@lakehouse/memory-mcp"]
    }
  }
}
```

That's it! Claude Code now has persistent memory using local storage.

### With Lakehouse42 Backend (Recommended)

For full semantic search capabilities, connect to Lakehouse42:

```json
{
  "mcpServers": {
    "memory": {
      "command": "npx",
      "args": ["@lakehouse/memory-mcp"],
      "env": {
        "LH42_URL": "https://api.lakehouse42.com",
        "LH42_API_KEY": "lh42_your_api_key"
      }
    }
  }
}
```

Get your API key at [lakehouse42.com](https://lakehouse42.com).

### Claude Desktop

Add to Claude Desktop's config (Settings → Developer → Edit Config):

```json
{
  "mcpServers": {
    "memory": {
      "command": "npx",
      "args": ["@lakehouse/memory-mcp"],
      "env": {
        "LH42_URL": "https://api.lakehouse42.com",
        "LH42_API_KEY": "lh42_your_api_key"
      }
    }
  }
}
```

### Cursor / Windsurf

Follow the same pattern - add the MCP server to your client's configuration.

## Tools

### `remember`

Store a memory for later recall.

```
Remember that the user prefers dark mode
```

Parameters:
- `content` (required) - The information to remember
- `type` - fact, preference, task, event, context, reflection
- `importance` - 0.0 to 1.0 (default: 0.5)

### `recall`

Search memories by semantic similarity.

```
What are the user's preferences?
```

Parameters:
- `query` (required) - What to search for
- `limit` - Max results (default: 5)
- `types` - Filter by memory types

### `forget`

Delete a memory by ID.

Parameters:
- `memoryId` (required) - ID of memory to delete
- `reason` - Reason for deletion

### `list_memories`

List recent memories.

Parameters:
- `limit` - Max results (default: 10)

### `memory_status`

Check memory system status and backend info.

## Local vs Lakehouse42

| Feature | Local | Lakehouse42 |
|---------|-------|-------------|
| Persistence | ✅ JSON file | ✅ Cloud |
| Search | Keyword matching | Semantic (AI-powered) |
| Deduplication | ❌ | ✅ 3-tier |
| Knowledge graph | ❌ | ✅ Entity relationships |
| History tracking | ❌ | ✅ Full audit trail |
| Multi-device sync | ❌ | ✅ |

## Environment Variables

| Variable | Description |
|----------|-------------|
| `LH42_URL` | Lakehouse42 API URL (enables LH42 backend) |
| `LH42_API_KEY` | API key for authentication |
| `DEBUG` | Enable debug logging (`true`/`false`) |

## Programmatic Usage

```typescript
import { createMemoryServer, LH42Backend } from "@lakehouse/memory-mcp";

// Create server with custom config
const server = await createMemoryServer({
  lh42Url: "https://api.lakehouse42.com",
  apiKey: "lh42_xxx",
  debug: true,
});

// Or use backends directly
const backend = new LH42Backend({
  url: "https://api.lakehouse42.com",
  apiKey: "lh42_xxx",
});

await backend.initialize();
await backend.remember({ content: "User likes TypeScript" });
const results = await backend.recall({ query: "programming preferences" });
```

## Privacy

- **Local mode**: All data stored in `~/.lakehouse42/memory-mcp/memories.json`
- **Lakehouse42 mode**: Data stored securely in your Lakehouse42 account
- No data is sent to third parties
- You control your memories

## License

MIT
