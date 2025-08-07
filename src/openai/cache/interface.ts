/**
 * Unified Cache Interface for OpenAI Module
 * Provides a standard interface for different cache implementations
 */

/**
 * Cache configuration options
 */
export interface CacheConfig {
  /** Maximum number of items to store in cache */
  maxSize?: number;
  /** Maximum memory size in bytes (optional) */
  maxMemory?: number;
  /** Default TTL in milliseconds (0 = no expiration) */
  defaultTTL?: number;
  /** Enable automatic cleanup of expired items */
  autoCleanup?: boolean;
  /** Cleanup interval in milliseconds */
  cleanupInterval?: number;
  /** Custom serialization function */
  serialize?: <T>(value: T) => string;
  /** Custom deserialization function */
  deserialize?: <T>(value: string) => T;
  /** Enable metrics collection */
  enableMetrics?: boolean;
  /** Callback when item is evicted */
  onEviction?: <K, V>(key: K, value: V, reason: EvictionReason) => void;
}

/**
 * Reasons for cache eviction
 */
export enum EvictionReason {
  SIZE = 'size',
  MEMORY = 'memory',
  TTL = 'ttl',
  MANUAL = 'manual',
  REPLACED = 'replaced'
}

/**
 * Cache statistics
 */
export interface CacheStats {
  /** Total number of cache hits */
  hits: number;
  /** Total number of cache misses */
  misses: number;
  /** Hit rate percentage (0-100) */
  hitRate: number;
  /** Number of items currently in cache */
  size: number;
  /** Maximum size configured */
  maxSize: number;
  /** Memory usage in bytes (if available) */
  memoryUsage?: number;
  /** Maximum memory configured (if available) */
  maxMemory?: number;
  /** Number of evictions by reason */
  evictions: Record<EvictionReason, number>;
  /** Average access time in milliseconds */
  avgAccessTime?: number;
  /** Average write time in milliseconds */
  avgWriteTime?: number;
}

/**
 * Cache entry metadata
 */
export interface CacheEntry<T> {
  /** The cached value */
  value: T;
  /** Timestamp when entry was created */
  createdAt: number;
  /** Timestamp when entry was last accessed */
  lastAccessedAt: number;
  /** TTL in milliseconds (0 = no expiration) */
  ttl: number;
  /** Expiration timestamp (0 = no expiration) */
  expiresAt: number;
  /** Number of times this entry has been accessed */
  accessCount: number;
  /** Size in bytes (if calculated) */
  size?: number;
}

/**
 * Options for cache operations
 */
export interface CacheOperationOptions {
  /** TTL for this specific operation (overrides default) */
  ttl?: number;
  /** Skip serialization for this operation */
  skipSerialization?: boolean;
  /** Force cache refresh even if entry exists */
  forceRefresh?: boolean;
}

/**
 * Unified cache interface supporting both sync and async operations
 */
export interface ICache<K = string, V = any> {
  // Synchronous operations
  
  /**
   * Get a value from cache
   * @returns The cached value or undefined if not found/expired
   */
  get(key: K): V | undefined;
  
  /**
   * Set a value in cache
   * @returns True if successfully set
   */
  set(key: K, value: V, options?: CacheOperationOptions): boolean;
  
  /**
   * Check if key exists and is not expired
   */
  has(key: K): boolean;
  
  /**
   * Delete a key from cache
   * @returns True if key was deleted
   */
  delete(key: K): boolean;
  
  /**
   * Clear all entries from cache
   */
  clear(): void;
  
  /**
   * Get the current size of the cache
   */
  size(): number;
  
  /**
   * Get all keys in cache
   */
  keys(): K[];
  
  /**
   * Get all values in cache
   */
  values(): V[];
  
  /**
   * Get all entries as key-value pairs
   */
  entries(): Array<[K, V]>;
  
  // Asynchronous operations
  
  /**
   * Async get with optional cache-aside pattern support
   * @param factory Function to create value if not in cache
   */
  getAsync(key: K, factory?: () => Promise<V>, options?: CacheOperationOptions): Promise<V | undefined>;
  
  /**
   * Async set operation
   */
  setAsync(key: K, value: V, options?: CacheOperationOptions): Promise<boolean>;
  
  /**
   * Async check if key exists
   */
  hasAsync(key: K): Promise<boolean>;
  
  /**
   * Async delete operation
   */
  deleteAsync(key: K): Promise<boolean>;
  
  /**
   * Async clear operation
   */
  clearAsync(): Promise<void>;
  
  // Batch operations
  
  /**
   * Get multiple values at once
   */
  getMany(keys: K[]): Map<K, V>;
  
  /**
   * Set multiple values at once
   */
  setMany(entries: Array<[K, V]>, options?: CacheOperationOptions): boolean;
  
  /**
   * Delete multiple keys at once
   */
  deleteMany(keys: K[]): number;
  
  // Metadata and statistics
  
  /**
   * Get cache statistics
   */
  getStats(): CacheStats;
  
  /**
   * Reset statistics
   */
  resetStats(): void;
  
  /**
   * Get metadata for a specific entry
   */
  getEntry(key: K): CacheEntry<V> | undefined;
  
  /**
   * Update TTL for an existing entry
   */
  touch(key: K, ttl?: number): boolean;
  
  // Cache management
  
  /**
   * Manually trigger cleanup of expired entries
   */
  cleanup(): number;
  
  /**
   * Prune cache to stay within size/memory limits
   */
  prune(): number;
  
  /**
   * Get memory usage (if available)
   */
  getMemoryUsage(): number | undefined;
  
  /**
   * Warm cache with initial data
   */
  warm(entries: Array<[K, V]>, options?: CacheOperationOptions): Promise<void>;
  
  /**
   * Export cache contents for persistence
   */
  export(): Array<[K, CacheEntry<V>]>;
  
  /**
   * Import cache contents from persistence
   */
  import(data: Array<[K, CacheEntry<V>]>): boolean;
  
  // Event handling
  
  /**
   * Subscribe to cache events
   */
  on(event: CacheEvent, handler: CacheEventHandler<K, V>): void;
  
  /**
   * Unsubscribe from cache events
   */
  off(event: CacheEvent, handler: CacheEventHandler<K, V>): void;
  
  /**
   * Dispose of cache resources
   */
  dispose(): void;
}

/**
 * Cache events
 */
export enum CacheEvent {
  HIT = 'hit',
  MISS = 'miss',
  SET = 'set',
  DELETE = 'delete',
  EVICT = 'evict',
  EXPIRE = 'expire',
  CLEAR = 'clear',
  ERROR = 'error'
}

/**
 * Cache event handler
 */
export type CacheEventHandler<K, V> = (event: {
  type: CacheEvent;
  key?: K;
  value?: V;
  reason?: EvictionReason;
  error?: Error;
  timestamp: number;
}) => void;

/**
 * Abstract base class for cache implementations
 */
export abstract class BaseCache<K = string, V = any> implements ICache<K, V> {
  protected config: Required<CacheConfig>;
  protected stats: CacheStats;
  protected eventHandlers: Map<CacheEvent, Set<CacheEventHandler<K, V>>>;
  
  constructor(config: CacheConfig = {}) {
    this.config = {
      maxSize: config.maxSize || 1000,
      maxMemory: config.maxMemory || 0,
      defaultTTL: config.defaultTTL || 0,
      autoCleanup: config.autoCleanup !== false,
      cleanupInterval: config.cleanupInterval || 60000,
      serialize: config.serialize || ((v) => JSON.stringify(v)),
      deserialize: config.deserialize || ((v) => JSON.parse(v)),
      enableMetrics: config.enableMetrics !== false,
      onEviction: config.onEviction || (() => {})
    };
    
    this.stats = {
      hits: 0,
      misses: 0,
      hitRate: 0,
      size: 0,
      maxSize: this.config.maxSize,
      memoryUsage: 0,
      maxMemory: this.config.maxMemory,
      evictions: {
        [EvictionReason.SIZE]: 0,
        [EvictionReason.MEMORY]: 0,
        [EvictionReason.TTL]: 0,
        [EvictionReason.MANUAL]: 0,
        [EvictionReason.REPLACED]: 0
      }
    };
    
    this.eventHandlers = new Map();
  }
  
  // Abstract methods to be implemented by subclasses
  abstract get(key: K): V | undefined;
  abstract set(key: K, value: V, options?: CacheOperationOptions): boolean;
  abstract has(key: K): boolean;
  abstract delete(key: K): boolean;
  abstract clear(): void;
  abstract size(): number;
  abstract keys(): K[];
  abstract values(): V[];
  abstract entries(): Array<[K, V]>;
  
  // Default implementations for async operations (can be overridden)
  async getAsync(key: K, factory?: () => Promise<V>, options?: CacheOperationOptions): Promise<V | undefined> {
    let value = this.get(key);
    
    if (value === undefined && factory) {
      value = await factory();
      if (value !== undefined) {
        this.set(key, value, options);
      }
    }
    
    return value;
  }
  
  async setAsync(key: K, value: V, options?: CacheOperationOptions): Promise<boolean> {
    return this.set(key, value, options);
  }
  
  async hasAsync(key: K): Promise<boolean> {
    return this.has(key);
  }
  
  async deleteAsync(key: K): Promise<boolean> {
    return this.delete(key);
  }
  
  async clearAsync(): Promise<void> {
    this.clear();
  }
  
  // Default batch operations
  getMany(keys: K[]): Map<K, V> {
    const result = new Map<K, V>();
    for (const key of keys) {
      const value = this.get(key);
      if (value !== undefined) {
        result.set(key, value);
      }
    }
    return result;
  }
  
  setMany(entries: Array<[K, V]>, options?: CacheOperationOptions): boolean {
    let success = true;
    for (const [key, value] of entries) {
      if (!this.set(key, value, options)) {
        success = false;
      }
    }
    return success;
  }
  
  deleteMany(keys: K[]): number {
    let count = 0;
    for (const key of keys) {
      if (this.delete(key)) {
        count++;
      }
    }
    return count;
  }
  
  // Statistics
  getStats(): CacheStats {
    return { ...this.stats };
  }
  
  resetStats(): void {
    this.stats.hits = 0;
    this.stats.misses = 0;
    this.stats.hitRate = 0;
    for (const reason in this.stats.evictions) {
      this.stats.evictions[reason as EvictionReason] = 0;
    }
  }
  
  // Event handling
  on(event: CacheEvent, handler: CacheEventHandler<K, V>): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);
  }
  
  off(event: CacheEvent, handler: CacheEventHandler<K, V>): void {
    this.eventHandlers.get(event)?.delete(handler);
  }
  
  protected emit(event: CacheEvent, data: Partial<Parameters<CacheEventHandler<K, V>>[0]> = {}): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      const eventData = {
        type: event,
        timestamp: Date.now(),
        ...data
      };
      handlers.forEach(handler => handler(eventData as Parameters<CacheEventHandler<K, V>>[0]));
    }
  }
  
  protected updateHitRate(): void {
    const total = this.stats.hits + this.stats.misses;
    this.stats.hitRate = total > 0 ? (this.stats.hits / total) * 100 : 0;
  }
  
  // Abstract methods for subclasses to implement
  abstract getEntry(key: K): CacheEntry<V> | undefined;
  abstract touch(key: K, ttl?: number): boolean;
  abstract cleanup(): number;
  abstract prune(): number;
  abstract getMemoryUsage(): number | undefined;
  abstract warm(entries: Array<[K, V]>, options?: CacheOperationOptions): Promise<void>;
  abstract export(): Array<[K, CacheEntry<V>]>;
  abstract import(data: Array<[K, CacheEntry<V>]>): boolean;
  abstract dispose(): void;
}

/**
 * Cache factory interface
 */
export interface ICacheFactory {
  /**
   * Create a cache instance with specified strategy
   */
  create<K = string, V = any>(strategy: CacheStrategy, config?: CacheConfig): ICache<K, V>;
  
  /**
   * Register a custom cache implementation
   */
  register(strategy: string, implementation: new (config: CacheConfig) => ICache): void;
  
  /**
   * Get available cache strategies
   */
  getStrategies(): string[];
}

/**
 * Built-in cache strategies
 */
export enum CacheStrategy {
  MEMORY = 'memory',
  LRU = 'lru',
  LFU = 'lfu',
  REDIS = 'redis',
  HYBRID = 'hybrid'
}