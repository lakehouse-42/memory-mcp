#!/usr/bin/env node

// src/server.ts
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from "@modelcontextprotocol/sdk/types.js";

// src/backends/lh42.ts
var LH42Backend = class {
  url;
  apiKey;
  debug;
  ready = false;
  constructor(config) {
    this.url = config.url.replace(/\/$/, "");
    this.apiKey = config.apiKey;
    this.debug = config.debug ?? false;
  }
  async initialize() {
    try {
      const response = await this.fetch("/health");
      const data = await response.json();
      if (data.status === "ok") {
        this.ready = true;
        if (this.debug) {
          console.error(
            `[memory-mcp] Connected to Lakehouse42 (${data.mode || "standard"})`
          );
        }
      }
    } catch (error) {
      throw new Error(
        `Failed to connect to Lakehouse42 at ${this.url}: ${error}`
      );
    }
  }
  async remember(input) {
    const response = await this.fetch("/mcp/memory/process", {
      method: "POST",
      body: JSON.stringify({
        content: input.content,
        memory_type: input.type || "fact",
        importance: input.importance ?? 0.5,
        metadata: input.metadata
      })
    });
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to store memory: ${error}`);
    }
    const data = await response.json();
    return this.toMemory(data);
  }
  async recall(input) {
    const params = new URLSearchParams({
      query: input.query,
      limit: String(input.limit ?? 5)
    });
    if (input.types?.length) {
      params.set("types", input.types.join(","));
    }
    if (input.minImportance !== void 0) {
      params.set("min_importance", String(input.minImportance));
    }
    const response = await this.fetch(`/memory/search?${params}`);
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to recall memories: ${error}`);
    }
    const data = await response.json();
    return (data.results || []).map((r) => ({
      memory: this.toMemory(r),
      score: r.score || 0
    }));
  }
  async forget(input) {
    const response = await this.fetch(`/memory/${input.memoryId}`, {
      method: "DELETE",
      body: JSON.stringify({ reason: input.reason })
    });
    return response.ok;
  }
  async search(input) {
    const response = await this.fetch("/mcp/memory/search", {
      method: "POST",
      body: JSON.stringify({
        query: input.query,
        limit: input.limit ?? 10,
        types: input.types,
        min_score: input.minScore,
        min_importance: input.minImportance
      })
    });
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Search failed: ${error}`);
    }
    const data = await response.json();
    return (data.results || []).map((r) => ({
      memory: this.toMemory(r),
      score: r.score || 0
    }));
  }
  async get(memoryId) {
    const response = await this.fetch(`/memory/${memoryId}`);
    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to get memory: ${error}`);
    }
    const data = await response.json();
    return this.toMemory(data);
  }
  async list(limit = 20, offset = 0) {
    const params = new URLSearchParams({
      limit: String(limit),
      offset: String(offset)
    });
    const response = await this.fetch(`/memory?${params}`);
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to list memories: ${error}`);
    }
    const data = await response.json();
    return (data.memories || []).map((m) => this.toMemory(m));
  }
  isReady() {
    return this.ready;
  }
  info() {
    return {
      type: "lh42",
      connected: this.ready,
      features: [
        "semantic-search",
        "deduplication",
        "knowledge-graph",
        "temporal-history",
        "importance-decay"
      ]
    };
  }
  async fetch(path, options) {
    const url = `${this.url}${path}`;
    const headers = {
      "Content-Type": "application/json",
      "X-API-Key": this.apiKey
    };
    if (this.debug) {
      console.error(`[memory-mcp] ${options?.method || "GET"} ${path}`);
    }
    return fetch(url, {
      ...options,
      headers: {
        ...headers,
        ...options?.headers || {}
      }
    });
  }
  toMemory(data) {
    return {
      id: data.id || data.memory_id,
      content: data.content,
      type: data.type || data.memory_type || "fact",
      importance: data.importance ?? 0.5,
      createdAt: data.created_at || data.createdAt || (/* @__PURE__ */ new Date()).toISOString(),
      updatedAt: data.updated_at || data.updatedAt || (/* @__PURE__ */ new Date()).toISOString(),
      metadata: data.metadata
    };
  }
};

// src/backends/local.ts
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { homedir } from "os";
import { randomUUID } from "crypto";
var LocalBackend = class {
  storagePath;
  memories = [];
  debug;
  ready = false;
  constructor(config = {}) {
    this.storagePath = config.storagePath || join(homedir(), ".lakehouse42", "memory-mcp", "memories.json");
    this.debug = config.debug ?? false;
  }
  async initialize() {
    const dir = dirname(this.storagePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    if (existsSync(this.storagePath)) {
      try {
        const data = JSON.parse(
          readFileSync(this.storagePath, "utf-8")
        );
        this.memories = data.memories || [];
        if (this.debug) {
          console.error(
            `[memory-mcp] Loaded ${this.memories.length} memories from ${this.storagePath}`
          );
        }
      } catch (error) {
        console.error(`[memory-mcp] Failed to load memories: ${error}`);
        this.memories = [];
      }
    }
    this.ready = true;
    if (this.debug) {
      console.error(`[memory-mcp] Local backend initialized`);
    }
  }
  async remember(input) {
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const memory = {
      id: randomUUID(),
      content: input.content,
      type: input.type || "fact",
      importance: input.importance ?? 0.5,
      createdAt: now,
      updatedAt: now,
      metadata: input.metadata
    };
    this.memories.push(memory);
    await this.save();
    if (this.debug) {
      console.error(`[memory-mcp] Stored memory: ${memory.id}`);
    }
    return memory;
  }
  async recall(input) {
    const results = this.searchMemories(input.query, {
      limit: input.limit,
      types: input.types,
      minImportance: input.minImportance
    });
    return results;
  }
  async forget(input) {
    const index = this.memories.findIndex((m) => m.id === input.memoryId);
    if (index === -1) {
      return false;
    }
    this.memories.splice(index, 1);
    await this.save();
    if (this.debug) {
      console.error(`[memory-mcp] Deleted memory: ${input.memoryId}`);
    }
    return true;
  }
  async search(input) {
    return this.searchMemories(input.query, {
      limit: input.limit,
      types: input.types,
      minScore: input.minScore,
      minImportance: input.minImportance
    });
  }
  async get(memoryId) {
    return this.memories.find((m) => m.id === memoryId) || null;
  }
  async list(limit = 20, offset = 0) {
    return this.memories.sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    ).slice(offset, offset + limit);
  }
  isReady() {
    return this.ready;
  }
  info() {
    return {
      type: "local",
      connected: this.ready,
      features: ["keyword-search", "persistence"]
    };
  }
  searchMemories(query, options = {}) {
    const queryWords = query.toLowerCase().split(/\s+/);
    const limit = options.limit ?? 5;
    let filtered = this.memories;
    if (options.types?.length) {
      filtered = filtered.filter((m) => options.types.includes(m.type));
    }
    if (options.minImportance !== void 0) {
      filtered = filtered.filter((m) => m.importance >= options.minImportance);
    }
    const scored = filtered.map((memory) => {
      const contentWords = memory.content.toLowerCase().split(/\s+/);
      let matchCount = 0;
      for (const qWord of queryWords) {
        for (const cWord of contentWords) {
          if (cWord.includes(qWord) || qWord.includes(cWord)) {
            matchCount++;
            break;
          }
        }
      }
      const baseScore = queryWords.length > 0 ? matchCount / queryWords.length : 0;
      const score = baseScore * (0.5 + memory.importance * 0.5);
      return { memory, score };
    });
    let results = scored.filter((r) => r.score > 0);
    if (options.minScore !== void 0) {
      results = results.filter((r) => r.score >= options.minScore);
    }
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }
  async save() {
    const data = {
      memories: this.memories,
      version: 1
    };
    writeFileSync(this.storagePath, JSON.stringify(data, null, 2));
  }
};

// src/server.ts
async function createMemoryServer(config = {}) {
  const debug = config.debug ?? process.env.DEBUG === "true";
  let backend;
  if (config.lh42Url || process.env.LH42_URL) {
    const url = config.lh42Url || process.env.LH42_URL;
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
      debug
    });
    if (debug) {
      console.error("[memory-mcp] Using local backend (limited features)");
      console.error(
        "[memory-mcp] Set LH42_URL for full semantic search capabilities"
      );
    }
  }
  await backend.initialize();
  const server = new Server(
    {
      name: "memory-mcp",
      version: "0.1.0"
    },
    {
      capabilities: {
        tools: {}
      }
    }
  );
  const tools = [
    {
      name: "remember",
      description: "Store a memory for later recall. Use this to remember important facts, user preferences, decisions, or any information that should persist across conversations.",
      inputSchema: {
        type: "object",
        properties: {
          content: {
            type: "string",
            description: "The information to remember"
          },
          type: {
            type: "string",
            enum: ["fact", "preference", "task", "event", "context", "reflection"],
            description: "Type of memory: fact (default), preference, task, event, context, or reflection"
          },
          importance: {
            type: "number",
            description: "Importance from 0.0 to 1.0 (default: 0.5). Higher importance memories are prioritized in recall.",
            minimum: 0,
            maximum: 1
          }
        },
        required: ["content"]
      }
    },
    {
      name: "recall",
      description: "Search memories by semantic similarity. Returns the most relevant memories matching the query.",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "What to search for in memories"
          },
          limit: {
            type: "number",
            description: "Maximum number of memories to return (default: 5)",
            minimum: 1,
            maximum: 20
          },
          types: {
            type: "array",
            items: {
              type: "string",
              enum: ["fact", "preference", "task", "event", "context", "reflection"]
            },
            description: "Filter by memory types"
          }
        },
        required: ["query"]
      }
    },
    {
      name: "forget",
      description: "Delete a specific memory by ID. Use when information is outdated or incorrect.",
      inputSchema: {
        type: "object",
        properties: {
          memoryId: {
            type: "string",
            description: "ID of the memory to delete"
          },
          reason: {
            type: "string",
            description: "Reason for deletion (for audit trail)"
          }
        },
        required: ["memoryId"]
      }
    },
    {
      name: "list_memories",
      description: "List recent memories. Useful for reviewing what has been remembered.",
      inputSchema: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: "Maximum number of memories to return (default: 10)",
            minimum: 1,
            maximum: 50
          }
        }
      }
    },
    {
      name: "memory_status",
      description: "Get status of the memory system including backend type and features available.",
      inputSchema: {
        type: "object",
        properties: {}
      }
    }
  ];
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools };
  });
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
      switch (name) {
        case "remember": {
          const content = args?.content;
          if (!content) {
            return {
              content: [{ type: "text", text: "Error: content is required" }],
              isError: true
            };
          }
          const memory = await backend.remember({
            content,
            type: args?.type || config.defaultMemoryType || "fact",
            importance: args?.importance ?? config.defaultImportance ?? 0.5
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
                      importance: memory.importance
                    }
                  },
                  null,
                  2
                )
              }
            ]
          };
        }
        case "recall": {
          const query = args?.query;
          if (!query) {
            return {
              content: [{ type: "text", text: "Error: query is required" }],
              isError: true
            };
          }
          const results = await backend.recall({
            query,
            limit: args?.limit ?? 5,
            types: args?.types
          });
          if (results.length === 0) {
            return {
              content: [
                {
                  type: "text",
                  text: "No relevant memories found."
                }
              ]
            };
          }
          const formatted = results.map((r) => ({
            id: r.memory.id,
            content: r.memory.content,
            type: r.memory.type,
            importance: r.memory.importance,
            relevance: Math.round(r.score * 100) + "%",
            createdAt: r.memory.createdAt
          }));
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    query,
                    count: results.length,
                    memories: formatted
                  },
                  null,
                  2
                )
              }
            ]
          };
        }
        case "forget": {
          const memoryId = args?.memoryId;
          if (!memoryId) {
            return {
              content: [{ type: "text", text: "Error: memoryId is required" }],
              isError: true
            };
          }
          const success = await backend.forget({
            memoryId,
            reason: args?.reason
          });
          return {
            content: [
              {
                type: "text",
                text: success ? `Memory ${memoryId} deleted successfully.` : `Memory ${memoryId} not found.`
              }
            ]
          };
        }
        case "list_memories": {
          const limit = args?.limit ?? 10;
          const memories = await backend.list(limit);
          if (memories.length === 0) {
            return {
              content: [{ type: "text", text: "No memories stored yet." }]
            };
          }
          const formatted = memories.map((m) => ({
            id: m.id,
            content: m.content.length > 100 ? m.content.substring(0, 100) + "..." : m.content,
            type: m.type,
            importance: m.importance,
            createdAt: m.createdAt
          }));
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    count: memories.length,
                    memories: formatted
                  },
                  null,
                  2
                )
              }
            ]
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
                    note: info.type === "local" ? "Using local storage. Set LH42_URL for full semantic search capabilities." : "Connected to Lakehouse42 with full semantic search."
                  },
                  null,
                  2
                )
              }
            ]
          };
        }
        default:
          return {
            content: [{ type: "text", text: `Unknown tool: ${name}` }],
            isError: true
          };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text", text: `Error: ${message}` }],
        isError: true
      };
    }
  });
  return server;
}
async function runServer(config = {}) {
  const server = await createMemoryServer(config);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  if (config.debug) {
    console.error("[memory-mcp] Server started with stdio transport");
  }
}

// src/index.ts
var isMainModule = process.argv[1]?.includes("memory-mcp") || process.argv[1]?.endsWith("/dist/index.js");
if (isMainModule) {
  runServer({
    debug: process.env.DEBUG === "true"
  }).catch((error) => {
    console.error("[memory-mcp] Fatal error:", error);
    process.exit(1);
  });
}
export {
  LH42Backend,
  LocalBackend,
  createMemoryServer,
  runServer
};
