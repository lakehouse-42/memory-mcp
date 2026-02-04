/**
 * Types for the Memory MCP Server
 */

export interface Memory {
  id: string;
  content: string;
  type: MemoryType;
  importance: number;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export type MemoryType =
  | "fact"
  | "preference"
  | "task"
  | "event"
  | "context"
  | "reflection";

export interface MemorySearchResult {
  memory: Memory;
  score: number;
}

export interface RememberInput {
  content: string;
  type?: MemoryType;
  importance?: number;
  metadata?: Record<string, unknown>;
}

export interface RecallInput {
  query: string;
  limit?: number;
  types?: MemoryType[];
  minImportance?: number;
}

export interface ForgetInput {
  memoryId: string;
  reason?: string;
}

export interface SearchInput {
  query: string;
  limit?: number;
  types?: MemoryType[];
  minScore?: number;
  minImportance?: number;
}

/**
 * Backend interface - implemented by Lakehouse and Local backends
 */
export interface MemoryBackend {
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
  info(): { type: string; connected: boolean; features: string[] };
}

/**
 * Configuration for the Memory MCP server
 */
export interface MemoryMCPConfig {
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
