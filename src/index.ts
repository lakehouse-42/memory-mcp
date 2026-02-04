#!/usr/bin/env node
/**
 * @lakehouse/memory-mcp
 *
 * Persistent memory for AI assistants via MCP.
 * Works with Claude Code, Cursor, Windsurf, and any MCP-compatible client.
 *
 * Usage:
 *   npx @lakehouse/memory-mcp
 *
 * Configuration (environment variables):
 *   LH42_URL     - Lakehouse42 API URL (optional, uses local storage if not set)
 *   LH42_API_KEY - API key for Lakehouse42
 *   DEBUG        - Enable debug logging (true/false)
 *
 * Claude Code config (~/.claude/claude_code_config.json):
 *   {
 *     "mcpServers": {
 *       "memory": {
 *         "command": "npx",
 *         "args": ["@lakehouse/memory-mcp"],
 *         "env": {
 *           "LH42_URL": "https://api.lakehouse42.com",
 *           "LH42_API_KEY": "lh42_xxx"
 *         }
 *       }
 *     }
 *   }
 */

import { runServer } from "./server.js";

// Export types and functions for programmatic use
export * from "./types.js";
export { createMemoryServer, runServer } from "./server.js";
export { LH42Backend } from "./backends/lh42.js";
export { LocalBackend } from "./backends/local.js";

// Run server when executed directly
const isMainModule = process.argv[1]?.includes("memory-mcp") ||
                     process.argv[1]?.endsWith("/dist/index.js");

if (isMainModule) {
  runServer({
    debug: process.env.DEBUG === "true",
  }).catch((error) => {
    console.error("[memory-mcp] Fatal error:", error);
    process.exit(1);
  });
}
