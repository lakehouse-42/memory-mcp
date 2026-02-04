/**
 * Lakehouse42 (LH42) Backend
 *
 * Connects to Lakehouse42 API for full-featured memory with:
 * - Semantic search via BGE-M3 embeddings
 * - 3-tier deduplication
 * - Knowledge graph integration
 * - Temporal history
 */

import type {
  Memory,
  MemoryBackend,
  MemorySearchResult,
  RememberInput,
  RecallInput,
  ForgetInput,
  SearchInput,
} from "../types.js";

export interface LH42Config {
  url: string;
  apiKey: string;
  debug?: boolean;
}

export class LH42Backend implements MemoryBackend {
  private url: string;
  private apiKey: string;
  private debug: boolean;
  private ready = false;

  constructor(config: LH42Config) {
    this.url = config.url.replace(/\/$/, ""); // Remove trailing slash
    this.apiKey = config.apiKey;
    this.debug = config.debug ?? false;
  }

  async initialize(): Promise<void> {
    // Check health endpoint
    try {
      const response = await this.fetch("/health");
      const data = (await response.json()) as { status?: string; mode?: string };

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

  async remember(input: RememberInput): Promise<Memory> {
    const response = await this.fetch("/memory/process", {
      method: "POST",
      body: JSON.stringify({
        content: input.content,
        memory_type: input.type || "fact",
        importance: input.importance ?? 0.5,
        metadata: input.metadata,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to store memory: ${error}`);
    }

    const data = (await response.json()) as Record<string, unknown>;
    return this.toMemory(data);
  }

  async recall(input: RecallInput): Promise<MemorySearchResult[]> {
    const params = new URLSearchParams({
      query: input.query,
      limit: String(input.limit ?? 5),
    });

    if (input.types?.length) {
      params.set("types", input.types.join(","));
    }
    if (input.minImportance !== undefined) {
      params.set("min_importance", String(input.minImportance));
    }

    const response = await this.fetch(`/memory/search?${params}`);

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to recall memories: ${error}`);
    }

    const data = (await response.json()) as { results?: Record<string, unknown>[] };
    return (data.results || []).map((r) => ({
      memory: this.toMemory(r),
      score: (r.score as number) || 0,
    }));
  }

  async forget(input: ForgetInput): Promise<boolean> {
    const response = await this.fetch(`/memory/${input.memoryId}`, {
      method: "DELETE",
      body: JSON.stringify({ reason: input.reason }),
    });

    return response.ok;
  }

  async search(input: SearchInput): Promise<MemorySearchResult[]> {
    const response = await this.fetch("/memory/search", {
      method: "POST",
      body: JSON.stringify({
        query: input.query,
        limit: input.limit ?? 10,
        types: input.types,
        min_score: input.minScore,
        min_importance: input.minImportance,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Search failed: ${error}`);
    }

    const data = (await response.json()) as { results?: Record<string, unknown>[] };
    return (data.results || []).map((r) => ({
      memory: this.toMemory(r),
      score: (r.score as number) || 0,
    }));
  }

  async get(memoryId: string): Promise<Memory | null> {
    const response = await this.fetch(`/memory/${memoryId}`);

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to get memory: ${error}`);
    }

    const data = (await response.json()) as Record<string, unknown>;
    return this.toMemory(data);
  }

  async list(limit = 20, offset = 0): Promise<Memory[]> {
    const params = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
    });

    const response = await this.fetch(`/memory?${params}`);

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to list memories: ${error}`);
    }

    const data = (await response.json()) as { memories?: Record<string, unknown>[] };
    return (data.memories || []).map((m) => this.toMemory(m));
  }

  isReady(): boolean {
    return this.ready;
  }

  info(): { type: string; connected: boolean; features: string[] } {
    return {
      type: "lh42",
      connected: this.ready,
      features: [
        "semantic-search",
        "deduplication",
        "knowledge-graph",
        "temporal-history",
        "importance-decay",
      ],
    };
  }

  private async fetch(path: string, options?: RequestInit): Promise<Response> {
    const url = `${this.url}${path}`;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-API-Key": this.apiKey,
    };

    if (this.debug) {
      console.error(`[memory-mcp] ${options?.method || "GET"} ${path}`);
    }

    return fetch(url, {
      ...options,
      headers: {
        ...headers,
        ...(options?.headers || {}),
      },
    });
  }

  private toMemory(data: Record<string, unknown>): Memory {
    return {
      id: (data.id || data.memory_id) as string,
      content: data.content as string,
      type: (data.type || data.memory_type || "fact") as Memory["type"],
      importance: (data.importance as number) ?? 0.5,
      createdAt: (data.created_at || data.createdAt || new Date().toISOString()) as string,
      updatedAt: (data.updated_at || data.updatedAt || new Date().toISOString()) as string,
      metadata: data.metadata as Record<string, unknown> | undefined,
    };
  }
}
