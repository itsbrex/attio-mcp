/**
 * Cache Factory Pattern Implementation
 * Provides unified creation and management of different cache strategies
 */

import {
  ICache,
  ICacheFactory,
  CacheConfig,
  CacheStrategy,
  BaseCache,
  CacheOperationOptions,
  CacheEntry,
  CacheEvent
} from './interface.js';
import { LRUMemoryCache, LRUCacheConfig } from './lru-cache.js';
import { CacheMetricsCollector, MetricsWindow } from './metrics.js';
import { CompositeSerializer, TTLManager } from './serialization.js';

/**
 * Redis-compatible interface for future extensibility
 */
export interface IRedisLikeCache {
  // String operations
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options?: { EX?: number; PX?: number }): Promise<'OK' | null>;
  del(...keys: string[]): Promise<number>;
  exists(...keys: string[]): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  ttl(key: string): Promise<number>;
  
  // Hash operations
  hget(key: string, field: string): Promise<string | null>;
  hset(key: string, field: string, value: string): Promise<number>;
  hdel(key: string, ...fields: string[]): Promise<number>;
  hgetall(key: string): Promise<Record<string, string>>;
  
  // List operations
  lpush(key: string, ...values: string[]): Promise<number>;
  rpush(key: string, ...values: string[]): Promise<number>;
  lpop(key: string): Promise<string | null>;
  rpop(key: string): Promise<string | null>;
  lrange(key: string, start: number, stop: number): Promise<string[]>;
  
  // Set operations
  sadd(key: string, ...members: string[]): Promise<number>;
  srem(key: string, ...members: string[]): Promise<number>;
  smembers(key: string): Promise<string[]>;
  sismember(key: string, member: string): Promise<number>;
  
  // Utility
  flushall(): Promise<'OK'>;
  flushdb(): Promise<'OK'>;
  ping(): Promise<'PONG'>;
}

/**
 * Redis adapter for memory cache
 * Provides Redis-like interface using in-memory cache
 */
export class RedisLikeMemoryCache implements IRedisLikeCache {
  private cache: ICache<string, any>;
  private hashStore: Map<string, Map<string, string>>;
  private listStore: Map<string, string[]>;
  private setStore: Map<string, Set<string>>;
  
  constructor(cache: ICache<string, any>) {
    this.cache = cache;
    this.hashStore = new Map();
    this.listStore = new Map();
    this.setStore = new Map();
  }
  
  // String operations
  async get(key: string): Promise<string | null> {
    const value = this.cache.get(key);
    return value !== undefined ? String(value) : null;
  }
  
  async set(key: string, value: string, options?: { EX?: number; PX?: number }): Promise<'OK'> {
    const ttl = options?.EX ? options.EX * 1000 : options?.PX || 0;
    this.cache.set(key, value, { ttl });
    return 'OK';
  }
  
  async del(...keys: string[]): Promise<number> {
    let deleted = 0;
    for (const key of keys) {
      if (this.cache.delete(key)) deleted++;
      // Also delete from specialized stores
      this.hashStore.delete(key);
      this.listStore.delete(key);
      this.setStore.delete(key);
    }
    return deleted;
  }
  
  async exists(...keys: string[]): Promise<number> {
    let count = 0;
    for (const key of keys) {
      if (this.cache.has(key) || this.hashStore.has(key) || 
          this.listStore.has(key) || this.setStore.has(key)) {
        count++;
      }
    }
    return count;
  }
  
  async expire(key: string, seconds: number): Promise<number> {
    return this.cache.touch(key, seconds * 1000) ? 1 : 0;
  }
  
  async ttl(key: string): Promise<number> {
    const entry = this.cache.getEntry(key);
    if (!entry) return -2; // Key doesn't exist
    if (entry.ttl === 0) return -1; // No expiration
    const remaining = entry.expiresAt - Date.now();
    return Math.max(0, Math.floor(remaining / 1000));
  }
  
  // Hash operations
  async hget(key: string, field: string): Promise<string | null> {
    const hash = this.hashStore.get(key);
    return hash?.get(field) || null;
  }
  
  async hset(key: string, field: string, value: string): Promise<number> {
    if (!this.hashStore.has(key)) {
      this.hashStore.set(key, new Map());
    }
    const hash = this.hashStore.get(key)!;
    const isNew = !hash.has(field);
    hash.set(field, value);
    return isNew ? 1 : 0;
  }
  
  async hdel(key: string, ...fields: string[]): Promise<number> {
    const hash = this.hashStore.get(key);
    if (!hash) return 0;
    
    let deleted = 0;
    for (const field of fields) {
      if (hash.delete(field)) deleted++;
    }
    
    if (hash.size === 0) {
      this.hashStore.delete(key);
    }
    
    return deleted;
  }
  
  async hgetall(key: string): Promise<Record<string, string>> {
    const hash = this.hashStore.get(key);
    return hash ? Object.fromEntries(hash) : {};
  }
  
  // List operations
  async lpush(key: string, ...values: string[]): Promise<number> {
    if (!this.listStore.has(key)) {
      this.listStore.set(key, []);
    }
    const list = this.listStore.get(key)!;
    list.unshift(...values);
    return list.length;
  }
  
  async rpush(key: string, ...values: string[]): Promise<number> {
    if (!this.listStore.has(key)) {
      this.listStore.set(key, []);
    }
    const list = this.listStore.get(key)!;
    list.push(...values);
    return list.length;
  }
  
  async lpop(key: string): Promise<string | null> {
    const list = this.listStore.get(key);
    return list?.shift() || null;
  }
  
  async rpop(key: string): Promise<string | null> {
    const list = this.listStore.get(key);
    return list?.pop() || null;
  }
  
  async lrange(key: string, start: number, stop: number): Promise<string[]> {
    const list = this.listStore.get(key);
    if (!list) return [];
    
    // Handle negative indices
    if (start < 0) start = Math.max(0, list.length + start);
    if (stop < 0) stop = list.length + stop;
    
    return list.slice(start, stop + 1);
  }
  
  // Set operations
  async sadd(key: string, ...members: string[]): Promise<number> {
    if (!this.setStore.has(key)) {
      this.setStore.set(key, new Set());
    }
    const set = this.setStore.get(key)!;
    const sizeBefore = set.size;
    
    for (const member of members) {
      set.add(member);
    }
    
    return set.size - sizeBefore;
  }
  
  async srem(key: string, ...members: string[]): Promise<number> {
    const set = this.setStore.get(key);
    if (!set) return 0;
    
    let removed = 0;
    for (const member of members) {
      if (set.delete(member)) removed++;
    }
    
    if (set.size === 0) {
      this.setStore.delete(key);
    }
    
    return removed;
  }
  
  async smembers(key: string): Promise<string[]> {
    const set = this.setStore.get(key);
    return set ? Array.from(set) : [];
  }
  
  async sismember(key: string, member: string): Promise<number> {
    const set = this.setStore.get(key);
    return set?.has(member) ? 1 : 0;
  }
  
  // Utility
  async flushall(): Promise<'OK'> {
    this.cache.clear();
    this.hashStore.clear();
    this.listStore.clear();
    this.setStore.clear();
    return 'OK';
  }
  
  async flushdb(): Promise<'OK'> {
    return this.flushall();
  }
  
  async ping(): Promise<'PONG'> {
    return 'PONG';
  }
}

/**
 * Hybrid cache combining multiple strategies
 */
export class HybridCache<K = string, V = any> extends BaseCache<K, V> {
  private l1Cache: ICache<K, V>; // Fast, small L1 cache
  private l2Cache: ICache<K, V>; // Larger, slower L2 cache
  private writeThrough: boolean;
  
  constructor(config: CacheConfig & { l1Size?: number; l2Size?: number; writeThrough?: boolean }) {
    super(config);
    
    // Create L1 cache (10% of total size)
    this.l1Cache = new LRUMemoryCache<K, V>({
      ...config,
      maxSize: config.l1Size || Math.floor(config.maxSize! * 0.1)
    });
    
    // Create L2 cache (90% of total size)
    this.l2Cache = new LRUMemoryCache<K, V>({
      ...config,
      maxSize: config.l2Size || Math.floor(config.maxSize! * 0.9)
    });
    
    this.writeThrough = config.writeThrough !== false;
  }
  
  get(key: K): V | undefined {
    // Check L1 first
    let value = this.l1Cache.get(key);
    
    if (value !== undefined) {
      this.stats.hits++;
      this.updateHitRate();
      return value;
    }
    
    // Check L2
    value = this.l2Cache.get(key);
    
    if (value !== undefined) {
      // Promote to L1
      this.l1Cache.set(key, value);
      this.stats.hits++;
      this.updateHitRate();
      return value;
    }
    
    this.stats.misses++;
    this.updateHitRate();
    return undefined;
  }
  
  set(key: K, value: V, options?: CacheOperationOptions): boolean {
    // Always set in L1
    const l1Success = this.l1Cache.set(key, value, options);
    
    // Write-through to L2 if enabled
    if (this.writeThrough) {
      this.l2Cache.set(key, value, options);
    }
    
    return l1Success;
  }
  
  has(key: K): boolean {
    return this.l1Cache.has(key) || this.l2Cache.has(key);
  }
  
  delete(key: K): boolean {
    const l1Deleted = this.l1Cache.delete(key);
    const l2Deleted = this.l2Cache.delete(key);
    return l1Deleted || l2Deleted;
  }
  
  clear(): void {
    this.l1Cache.clear();
    this.l2Cache.clear();
  }
  
  size(): number {
    return this.l1Cache.size() + this.l2Cache.size();
  }
  
  keys(): K[] {
    const keys = new Set<K>();
    this.l1Cache.keys().forEach(k => keys.add(k));
    this.l2Cache.keys().forEach(k => keys.add(k));
    return Array.from(keys);
  }
  
  values(): V[] {
    // Combine values, L1 takes precedence
    const valueMap = new Map<K, V>();
    this.l2Cache.entries().forEach(([k, v]) => valueMap.set(k, v));
    this.l1Cache.entries().forEach(([k, v]) => valueMap.set(k, v));
    return Array.from(valueMap.values());
  }
  
  entries(): Array<[K, V]> {
    const entryMap = new Map<K, V>();
    this.l2Cache.entries().forEach(([k, v]) => entryMap.set(k, v));
    this.l1Cache.entries().forEach(([k, v]) => entryMap.set(k, v));
    return Array.from(entryMap.entries());
  }
  
  getEntry(key: K): CacheEntry<V> | undefined {
    return this.l1Cache.getEntry(key) || this.l2Cache.getEntry(key);
  }
  
  touch(key: K, ttl?: number): boolean {
    const l1Touch = this.l1Cache.touch(key, ttl);
    const l2Touch = this.l2Cache.touch(key, ttl);
    return l1Touch || l2Touch;
  }
  
  cleanup(): number {
    return this.l1Cache.cleanup() + this.l2Cache.cleanup();
  }
  
  prune(): number {
    return this.l1Cache.prune() + this.l2Cache.prune();
  }
  
  getMemoryUsage(): number | undefined {
    const l1Memory = this.l1Cache.getMemoryUsage();
    const l2Memory = this.l2Cache.getMemoryUsage();
    
    if (l1Memory === undefined && l2Memory === undefined) return undefined;
    return (l1Memory || 0) + (l2Memory || 0);
  }
  
  async warm(entries: Array<[K, V]>, options?: CacheOperationOptions): Promise<void> {
    // Warm L2 cache with all entries
    await this.l2Cache.warm(entries, options);
    
    // Warm L1 cache with most recent entries
    const recentEntries = entries.slice(-Math.floor(entries.length * 0.1));
    await this.l1Cache.warm(recentEntries, options);
  }
  
  export(): Array<[K, CacheEntry<V>]> {
    const exported = new Map<K, CacheEntry<V>>();
    
    // L2 entries first
    this.l2Cache.export().forEach(([k, v]) => exported.set(k, v));
    
    // L1 entries override
    this.l1Cache.export().forEach(([k, v]) => exported.set(k, v));
    
    return Array.from(exported.entries());
  }
  
  import(data: Array<[K, CacheEntry<V>]>): boolean {
    // Import to L2
    return this.l2Cache.import(data);
  }
  
  dispose(): void {
    this.l1Cache.dispose();
    this.l2Cache.dispose();
    super.dispose();
  }
}

/**
 * Cache Factory Implementation
 */
export class CacheFactory implements ICacheFactory {
  private strategies: Map<string, new (config: CacheConfig) => ICache>;
  private metricsCollector: CacheMetricsCollector;
  private instances: Map<string, ICache>;
  
  constructor() {
    this.strategies = new Map();
    this.metricsCollector = new CacheMetricsCollector();
    this.instances = new Map();
    
    // Register built-in strategies
    this.registerBuiltInStrategies();
  }
  
  /**
   * Create a cache instance with specified strategy
   */
  create<K = string, V = any>(
    strategy: CacheStrategy | string,
    config?: CacheConfig
  ): ICache<K, V> {
    const Implementation = this.strategies.get(strategy);
    
    if (!Implementation) {
      throw new Error(`Unknown cache strategy: ${strategy}`);
    }
    
    const cache = new Implementation(config || {}) as ICache<K, V>;
    
    // Attach metrics collector
    this.attachMetrics(cache);
    
    // Store instance for management
    const instanceId = `${strategy}_${Date.now()}`;
    this.instances.set(instanceId, cache);
    
    return cache;
  }
  
  /**
   * Create cache with graceful degradation
   */
  createWithFallback<K = string, V = any>(
    preferredStrategy: CacheStrategy | string,
    fallbackStrategy: CacheStrategy | string = CacheStrategy.MEMORY,
    config?: CacheConfig
  ): ICache<K, V> {
    try {
      return this.create<K, V>(preferredStrategy, config);
    } catch (error) {
      console.warn(`Failed to create ${preferredStrategy} cache, falling back to ${fallbackStrategy}`);
      return this.create<K, V>(fallbackStrategy, config);
    }
  }
  
  /**
   * Create Redis-compatible cache
   */
  createRedisLike(config?: CacheConfig): IRedisLikeCache {
    const cache = this.create(CacheStrategy.LRU, config);
    return new RedisLikeMemoryCache(cache);
  }
  
  /**
   * Register a custom cache implementation
   */
  register(strategy: string, implementation: new (config: CacheConfig) => ICache): void {
    this.strategies.set(strategy, implementation);
  }
  
  /**
   * Get available cache strategies
   */
  getStrategies(): string[] {
    return Array.from(this.strategies.keys());
  }
  
  /**
   * Get metrics for all cache instances
   */
  getMetrics(): any {
    return this.metricsCollector.export('json');
  }
  
  /**
   * Dispose of all cache instances
   */
  disposeAll(): void {
    for (const cache of this.instances.values()) {
      cache.dispose();
    }
    this.instances.clear();
    this.metricsCollector.dispose();
  }
  
  // Private methods
  
  /**
   * Register built-in cache strategies
   */
  private registerBuiltInStrategies(): void {
    this.strategies.set(CacheStrategy.MEMORY, LRUMemoryCache);
    this.strategies.set(CacheStrategy.LRU, LRUMemoryCache);
    this.strategies.set(CacheStrategy.HYBRID, HybridCache);
    
    // LFU can be added later
    // this.strategies.set(CacheStrategy.LFU, LFUMemoryCache);
    
    // Redis strategy would require actual Redis connection
    // this.strategies.set(CacheStrategy.REDIS, RedisCache);
  }
  
  /**
   * Attach metrics collection to cache
   */
  private attachMetrics<K, V>(cache: ICache<K, V>): void {
    // Subscribe to cache events for metrics
    cache.on(CacheEvent.HIT, () => {
      this.metricsCollector.increment('cache.hits');
    });
    
    cache.on(CacheEvent.MISS, () => {
      this.metricsCollector.increment('cache.misses');
    });
    
    cache.on(CacheEvent.SET, () => {
      this.metricsCollector.increment('cache.sets');
    });
    
    cache.on(CacheEvent.DELETE, () => {
      this.metricsCollector.increment('cache.deletes');
    });
    
    cache.on(CacheEvent.EVICT, (event) => {
      this.metricsCollector.increment(`cache.evictions.${event.reason}`);
    });
    
    // Periodically collect cache stats
    setInterval(() => {
      const stats = cache.getStats();
      this.metricsCollector.recordCacheStats(stats);
    }, MetricsWindow.MINUTE);
  }
}

/**
 * Default factory instance
 */
export const cacheFactory = new CacheFactory();

/**
 * Convenience functions for creating caches
 */
export function createCache<K = string, V = any>(
  strategy: CacheStrategy = CacheStrategy.LRU,
  config?: CacheConfig
): ICache<K, V> {
  return cacheFactory.create<K, V>(strategy, config);
}

export function createRedisLikeCache(config?: CacheConfig): IRedisLikeCache {
  return cacheFactory.createRedisLike(config);
}

export function createHybridCache<K = string, V = any>(config?: CacheConfig): ICache<K, V> {
  return cacheFactory.create<K, V>(CacheStrategy.HYBRID, config);
}