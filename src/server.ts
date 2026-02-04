/**
 * Memory MCP Server
 *
 * Provides persistent memory tools for AI assistants via MCP protocol.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";

import type { MemoryBackend, MemoryMCPConfig, MemoryType } from "./types.js";
import { LH42Backend } from "./backends/lh42.js";
import { LocalBackend } from "./backends/local.js";

/**
 * Create and start the Memory MCP server
 */
export async function createMemoryServer(
  config: MemoryMCPConfig = {}
): Promise<Server> {
  const debug = config.debug ?? process.env.DEBUG === "true";

  // Initialize backend
  let backend: MemoryBackend;

  if (config.lh42Url || process.env.LH42_URL) {
    const url = config.lh42Url || process.env.LH42_URL!;
    const apiKey = config.apiKey || process.env.LH42_API_KEY || "";

    if (!apiKey) {
      console.error(
        "[memory-mcp] Warning: LH42_API_KEY not set, some features may be limited"
      );
    }

    backend = new LH42Backend({ url, apiKey, debug });

    if (debug) {
      console.error(`[memory-mcp] Using Lakehouse42 backend: ${url}`);
    }
  } else {
    backend = new LocalBackend({
      storagePath: config.localStoragePath,
      debug,
    });

    if (debug) {
      console.error("[memory-mcp] Using local backend (limited features)");
      console.error(
        "[memory-mcp] Set LH42_URL for full semantic search capabilities"
      );
    }
  }

  await backend.initialize();

  // Create MCP server
  const server = new Server(
    {
      name: "memory-mcp",
      version: "0.1.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Define tools
  const tools: Tool[] = [
    {
      name: "remember",
      description:
        "Store a memory for later recall. Use this to remember important facts, user preferences, decisions, or any information that should persist across conversations.",
      inputSchema: {
        type: "object" as const,
        properties: {
          content: {
            type: "string",
            description: "The information to remember",
          },
          type: {
            type: "string",
            enum: ["fact", "preference", "task", "event", "context", "reflection"],
            description:
              "Type of memory: fact (default), preference, task, event, context, or reflection",
          },
          importance: {
            type: "number",
            description:
              "Importance from 0.0 to 1.0 (default: 0.5). Higher importance memories are prioritized in recall.",
            minimum: 0,
            maximum: 1,
          },
        },
        required: ["content"],
      },
    },
    {
      name: "recall",
      description:
        "Search memories by semantic similarity. Returns the most relevant memories matching the query.",
      inputSchema: {
        type: "object" as const,
        properties: {
          query: {
            type: "string",
            description: "What to search for in memories",
          },
          limit: {
            type: "number",
            description: "Maximum number of memories to return (default: 5)",
            minimum: 1,
            maximum: 20,
          },
          types: {
            type: "array",
            items: {
              type: "string",
              enum: ["fact", "preference", "task", "event", "context", "reflection"],
            },
            description: "Filter by memory types",
          },
        },
        required: ["query"],
      },
    },
    {
      name: "forget",
      description:
        "Delete a specific memory by ID. Use when information is outdated or incorrect.",
      inputSchema: {
        type: "object" as const,
        properties: {
          memoryId: {
            type: "string",
            description: "ID of the memory to delete",
          },
          reason: {
            type: "string",
            description: "Reason for deletion (for audit trail)",
          },
        },
        required: ["memoryId"],
      },
    },
    {
      name: "list_memories",
      description:
        "List recent memories. Useful for reviewing what has been remembered.",
      inputSchema: {
        type: "object" as const,
        properties: {
          limit: {
            type: "number",
            description: "Maximum number of memories to return (default: 10)",
            minimum: 1,
            maximum: 50,
          },
        },
      },
    },
    {
      name: "memory_status",
      description:
        "Get status of the memory system including backend type and features available.",
      inputSchema: {
        type: "object" as const,
        properties: {},
      },
    },
  ];

  // Handle list tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools };
  });

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case "remember": {
          const content = args?.content as string;
          if (!content) {
            return {
              content: [{ type: "text", text: "Error: content is required" }],
              isError: true,
            };
          }

          const memory = await backend.remember({
            content,
            type: (args?.type as MemoryType) || config.defaultMemoryType || "fact",
            importance:
              (args?.importance as number) ?? config.defaultImportance ?? 0.5,
          });

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    success: true,
                    message: "Memory stored successfully",
                    memory: {
                      id: memory.id,
                      content: memory.content,
                      type: memory.type,
                      importance: memory.importance,
                    },
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        case "recall": {
          const query = args?.query as string;
          if (!query) {
            return {
              content: [{ type: "text", text: "Error: query is required" }],
              isError: true,
            };
          }

          const results = await backend.recall({
            query,
            limit: (args?.limit as number) ?? 5,
            types: args?.types as MemoryType[] | undefined,
          });

          if (results.length === 0) {
            return {
              content: [
                {
                  type: "text",
                  text: "No relevant memories found.",
                },
              ],
            };
          }

          const formatted = results.map((r) => ({
            id: r.memory.id,
            content: r.memory.content,
            type: r.memory.type,
            importance: r.memory.importance,
            relevance: Math.round(r.score * 100) + "%",
            createdAt: r.memory.createdAt,
          }));

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    query,
                    count: results.length,
                    memories: formatted,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        case "forget": {
          const memoryId = args?.memoryId as string;
          if (!memoryId) {
            return {
              content: [{ type: "text", text: "Error: memoryId is required" }],
              isError: true,
            };
          }

          const success = await backend.forget({
            memoryId,
            reason: args?.reason as string | undefined,
          });

          return {
            content: [
              {
                type: "text",
                text: success
                  ? `Memory ${memoryId} deleted successfully.`
                  : `Memory ${memoryId} not found.`,
              },
            ],
          };
        }

        case "list_memories": {
          const limit = (args?.limit as number) ?? 10;
          const memories = await backend.list(limit);

          if (memories.length === 0) {
            return {
              content: [{ type: "text", text: "No memories stored yet." }],
            };
          }

          const formatted = memories.map((m) => ({
            id: m.id,
            content:
              m.content.length > 100
                ? m.content.substring(0, 100) + "..."
                : m.content,
            type: m.type,
            importance: m.importance,
            createdAt: m.createdAt,
          }));

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    count: memories.length,
                    memories: formatted,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        case "memory_status": {
          const info = backend.info();
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    backend: info.type,
                    connected: info.connected,
                    features: info.features,
                    note:
                      info.type === "local"
                        ? "Using local storage. Set LH42_URL for full semantic search capabilities."
                        : "Connected to Lakehouse42 with full semantic search.",
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        default:
          return {
            content: [{ type: "text", text: `Unknown tool: ${name}` }],
            isError: true,
          };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text", text: `Error: ${message}` }],
        isError: true,
      };
    }
  });

  return server;
}

/**
 * Run the Memory MCP server with stdio transport
 */
export async function runServer(config: MemoryMCPConfig = {}): Promise<void> {
  const server = await createMemoryServer(config);
  const transport = new StdioServerTransport();

  await server.connect(transport);

  if (config.debug) {
    console.error("[memory-mcp] Server started with stdio transport");
  }
}
