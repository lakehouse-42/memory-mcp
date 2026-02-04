#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';

/**
 * Types for the Memory MCP Server
 */
interface Memory {
    id: string;
    content: string;
    type: MemoryType;
    importance: number;
    createdAt: string;
    updatedAt: string;
    metadata?: Record<string, unknown>;
}
type MemoryType = "fact" | "preference" | "task" | "event" | "context" | "reflection";
interface MemorySearchResult {
    memory: Memory;
    score: number;
}
interface RememberInput {
    content: string;
    type?: MemoryType;
    importance?: number;
    metadata?: Record<string, unknown>;
}
interface RecallInput {
    query: string;
    limit?: number;
    types?: MemoryType[];
    minImportance?: number;
}
interface ForgetInput {
    memoryId: string;
    reason?: string;
}
interface SearchInput {
    query: string;
    limit?: number;
    types?: MemoryType[];
    minScore?: number;
    minImportance?: number;
}
/**
 * Backend interface - implemented by Lakehouse and Local backends
 */
interface MemoryBackend {
    /** Initialize the backend */
    initialize(): Promise<void>;
    /** Store a new memory */
    remember(input: RememberInput): Promise<Memory>;
    /** Search memories by semantic similarity */
    recall(input: RecallInput): Promise<MemorySearchResult[]>;
    /** Delete a memory */
    forget(input: ForgetInput): Promise<boolean>;
    /** Advanced search with filters */
    search(input: SearchInput): Promise<MemorySearchResult[]>;
    /** Get a specific memory by ID */
    get(memoryId: string): Promise<Memory | null>;
    /** List all memories (paginated) */
    list(limit?: number, offset?: number): Promise<Memory[]>;
    /** Check if backend is ready */
    isReady(): boolean;
    /** Get backend info */
    info(): {
        type: string;
        connected: boolean;
        features: string[];
    };
}
/**
 * Configuration for the Memory MCP server
 */
interface MemoryMCPConfig {
    /** Lakehouse42 API URL (if using LH42 backend) */
    lh42Url?: string;
    /** Lakehouse42 API key */
    apiKey?: string;
    /** Local storage path (for SQLite fallback) */
    localStoragePath?: string;
    /** Default memory type */
    defaultMemoryType?: MemoryType;
    /** Default importance for new memories */
    defaultImportance?: number;
    /** Enable debug logging */
    debug?: boolean;
}

/**
 * Memory MCP Server
 *
 * Provides persistent memory tools for AI assistants via MCP protocol.
 */

/**
 * Create and start the Memory MCP server
 */
declare function createMemoryServer(config?: MemoryMCPConfig): Promise<Server>;
/**
 * Run the Memory MCP server with stdio transport
 */
declare function runServer(config?: MemoryMCPConfig): Promise<void>;

/**
 * Lakehouse42 (LH42) Backend
 *
 * Connects to Lakehouse42 API for full-featured memory with:
 * - Semantic search via BGE-M3 embeddings
 * - 3-tier deduplication
 * - Knowledge graph integration
 * - Temporal history
 */

interface LH42Config {
    url: string;
    apiKey: string;
    debug?: boolean;
}
declare class LH42Backend implements MemoryBackend {
    private url;
    private apiKey;
    private debug;
    private ready;
    constructor(config: LH42Config);
    initialize(): Promise<void>;
    remember(input: RememberInput): Promise<Memory>;
    recall(input: RecallInput): Promise<MemorySearchResult[]>;
    forget(input: ForgetInput): Promise<boolean>;
    search(input: SearchInput): Promise<MemorySearchResult[]>;
    get(memoryId: string): Promise<Memory | null>;
    list(limit?: number, offset?: number): Promise<Memory[]>;
    isReady(): boolean;
    info(): {
        type: string;
        connected: boolean;
        features: string[];
    };
    private fetch;
    private toMemory;
}

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

interface LocalConfig {
    storagePath?: string;
    debug?: boolean;
}
declare class LocalBackend implements MemoryBackend {
    private storagePath;
    private memories;
    private debug;
    private ready;
    constructor(config?: LocalConfig);
    initialize(): Promise<void>;
    remember(input: RememberInput): Promise<Memory>;
    recall(input: RecallInput): Promise<MemorySearchResult[]>;
    forget(input: ForgetInput): Promise<boolean>;
    search(input: SearchInput): Promise<MemorySearchResult[]>;
    get(memoryId: string): Promise<Memory | null>;
    list(limit?: number, offset?: number): Promise<Memory[]>;
    isReady(): boolean;
    info(): {
        type: string;
        connected: boolean;
        features: string[];
    };
    private searchMemories;
    private save;
}

export { type ForgetInput, LH42Backend, LocalBackend, type Memory, type MemoryBackend, type MemoryMCPConfig, type MemorySearchResult, type MemoryType, type RecallInput, type RememberInput, type SearchInput, createMemoryServer, runServer };
