/**
 * Local Backend
 *
 * Simple in-memory + file storage for standalone mode.
 * Uses JSON file for persistence, keyword matching for search.
 *
 * Limited features compared to Lakehouse42:
 * - No semantic search (keyword only)
 * - No deduplication
 * - No knowledge graph
 * - Basic importance scoring
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { homedir } from "os";
import { randomUUID } from "crypto";

import type {
  Memory,
  MemoryBackend,
  MemorySearchResult,
  RememberInput,
  RecallInput,
  ForgetInput,
  SearchInput,
} from "../types.js";

export interface LocalConfig {
  storagePath?: string;
  debug?: boolean;
}

interface StorageData {
  memories: Memory[];
  version: number;
}

export class LocalBackend implements MemoryBackend {
  private storagePath: string;
  private memories: Memory[] = [];
  private debug: boolean;
  private ready = false;

  constructor(config: LocalConfig = {}) {
    this.storagePath =
      config.storagePath ||
      join(homedir(), ".lakehouse42", "memory-mcp", "memories.json");
    this.debug = config.debug ?? false;
  }

  async initialize(): Promise<void> {
    // Ensure directory exists
    const dir = dirname(this.storagePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    // Load existing memories
    if (existsSync(this.storagePath)) {
      try {
        const data = JSON.parse(
          readFileSync(this.storagePath, "utf-8")
        ) as StorageData;
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

  async remember(input: RememberInput): Promise<Memory> {
    const now = new Date().toISOString();

    const memory: Memory = {
      id: randomUUID(),
      content: input.content,
      type: input.type || "fact",
      importance: input.importance ?? 0.5,
      createdAt: now,
      updatedAt: now,
      metadata: input.metadata,
    };

    this.memories.push(memory);
    await this.save();

    if (this.debug) {
      console.error(`[memory-mcp] Stored memory: ${memory.id}`);
    }

    return memory;
  }

  async recall(input: RecallInput): Promise<MemorySearchResult[]> {
    const results = this.searchMemories(input.query, {
      limit: input.limit,
      types: input.types,
      minImportance: input.minImportance,
    });

    return results;
  }

  async forget(input: ForgetInput): Promise<boolean> {
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

  async search(input: SearchInput): Promise<MemorySearchResult[]> {
    return this.searchMemories(input.query, {
      limit: input.limit,
      types: input.types,
      minScore: input.minScore,
      minImportance: input.minImportance,
    });
  }

  async get(memoryId: string): Promise<Memory | null> {
    return this.memories.find((m) => m.id === memoryId) || null;
  }

  async list(limit = 20, offset = 0): Promise<Memory[]> {
    return this.memories
      .sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      )
      .slice(offset, offset + limit);
  }

  isReady(): boolean {
    return this.ready;
  }

  info(): { type: string; connected: boolean; features: string[] } {
    return {
      type: "local",
      connected: this.ready,
      features: ["keyword-search", "persistence"],
    };
  }

  private searchMemories(
    query: string,
    options: {
      limit?: number;
      types?: string[];
      minScore?: number;
      minImportance?: number;
    } = {}
  ): MemorySearchResult[] {
    const queryWords = query.toLowerCase().split(/\s+/);
    const limit = options.limit ?? 5;

    let filtered = this.memories;

    // Filter by types
    if (options.types?.length) {
      filtered = filtered.filter((m) => options.types!.includes(m.type));
    }

    // Filter by importance
    if (options.minImportance !== undefined) {
      filtered = filtered.filter((m) => m.importance >= options.minImportance!);
    }

    // Score by keyword matching
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

      // Score is percentage of query words matched, weighted by importance
      const baseScore = queryWords.length > 0 ? matchCount / queryWords.length : 0;
      const score = baseScore * (0.5 + memory.importance * 0.5);

      return { memory, score };
    });

    // Filter by min score
    let results = scored.filter((r) => r.score > 0);
    if (options.minScore !== undefined) {
      results = results.filter((r) => r.score >= options.minScore!);
    }

    // Sort by score descending
    results.sort((a, b) => b.score - a.score);

    return results.slice(0, limit);
  }

  private async save(): Promise<void> {
    const data: StorageData = {
      memories: this.memories,
      version: 1,
    };

    writeFileSync(this.storagePath, JSON.stringify(data, null, 2));
  }
}
