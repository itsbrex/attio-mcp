/**
 * Serialization utilities for cache implementations
 * Handles complex object serialization with fallback strategies
 */

import { createHash } from 'crypto';

/**
 * Serialization options
 */
export interface SerializationOptions {
  /** Enable compression */
  compress?: boolean;
  /** Custom replacer for JSON.stringify */
  replacer?: (key: string, value: any) => any;
  /** Custom reviver for JSON.parse */
  reviver?: (key: string, value: any) => any;
  /** Handle circular references */
  handleCircular?: boolean;
  /** Maximum depth for object traversal */
  maxDepth?: number;
}

/**
 * Serialization result
 */
export interface SerializationResult {
  /** Serialized data */
  data: string;
  /** Original size in bytes */
  originalSize: number;
  /** Serialized size in bytes */
  serializedSize: number;
  /** Compression ratio (if compressed) */
  compressionRatio?: number;
  /** Serialization method used */
  method: 'json' | 'string' | 'buffer' | 'custom';
  /** Hash of serialized data */
  hash?: string;
}

/**
 * Custom serializer interface
 */
export interface ISerializer<T = any> {
  serialize(value: T, options?: SerializationOptions): SerializationResult;
  deserialize(data: string, options?: SerializationOptions): T;
  canSerialize(value: any): boolean;
}

/**
 * Default JSON serializer with enhancements
 */
export class JSONSerializer<T = any> implements ISerializer<T> {
  private seen: WeakSet<any>;
  
  constructor() {
    this.seen = new WeakSet();
  }
  
  /**
   * Serialize value to JSON string
   */
  serialize(value: T, options?: SerializationOptions): SerializationResult {
    const startSize = this.estimateSize(value);
    let method: SerializationResult['method'] = 'json';
    let serialized: string;
    
    try {
      if (options?.handleCircular) {
        serialized = this.stringifyWithCircular(value, options);
      } else {
        serialized = JSON.stringify(value, options?.replacer);
      }
    } catch (error) {
      // Fallback to string representation
      if (value !== null && value !== undefined) {
        serialized = String(value);
        method = 'string';
      } else {
        throw error;
      }
    }
    
    return {
      data: serialized,
      originalSize: startSize,
      serializedSize: serialized.length * 2, // Unicode chars
      method,
      hash: this.generateHash(serialized)
    };
  }
  
  /**
   * Deserialize JSON string back to value
   */
  deserialize(data: string, options?: SerializationOptions): T {
    try {
      return JSON.parse(data, options?.reviver);
    } catch (error) {
      // If it was serialized as string, return as-is
      return data as unknown as T;
    }
  }
  
  /**
   * Check if value can be serialized
   */
  canSerialize(value: any): boolean {
    try {
      JSON.stringify(value);
      return true;
    } catch {
      return false;
    }
  }
  
  /**
   * Stringify with circular reference handling
   */
  private stringifyWithCircular(value: any, options?: SerializationOptions): string {
    this.seen = new WeakSet();
    
    const replacer = (key: string, val: any): any => {
      // Handle circular references
      if (val !== null && typeof val === 'object') {
        if (this.seen.has(val)) {
          return '[Circular Reference]';
        }
        this.seen.add(val);
      }
      
      // Apply custom replacer if provided
      if (options?.replacer) {
        return options.replacer(key, val);
      }
      
      return val;
    };
    
    return JSON.stringify(value, replacer);
  }
  
  /**
   * Estimate size of value in bytes
   */
  private estimateSize(value: any): number {
    if (value === null || value === undefined) return 0;
    
    switch (typeof value) {
      case 'string':
        return value.length * 2;
      case 'number':
        return 8;
      case 'boolean':
        return 4;
      case 'object':
        if (value instanceof Date) return 8;
        if (value instanceof Buffer) return value.length;
        if (Array.isArray(value)) {
          return value.reduce((sum, item) => sum + this.estimateSize(item), 24);
        }
        // For objects, estimate based on JSON string length
        try {
          return JSON.stringify(value).length * 2;
        } catch {
          return 1024; // Default for non-serializable
        }
      default:
        return 256;
    }
  }
  
  /**
   * Generate hash of serialized data
   */
  private generateHash(data: string): string {
    return createHash('md5').update(data).digest('hex');
  }
}

/**
 * Serializer for Buffer/Binary data
 */
export class BufferSerializer implements ISerializer<Buffer> {
  serialize(value: Buffer, options?: SerializationOptions): SerializationResult {
    const base64 = value.toString('base64');
    
    return {
      data: base64,
      originalSize: value.length,
      serializedSize: base64.length,
      method: 'buffer',
      compressionRatio: value.length / base64.length
    };
  }
  
  deserialize(data: string): Buffer {
    return Buffer.from(data, 'base64');
  }
  
  canSerialize(value: any): boolean {
    return Buffer.isBuffer(value);
  }
}

/**
 * Composite serializer that tries multiple strategies
 */
export class CompositeSerializer<T = any> implements ISerializer<T> {
  private serializers: Array<{
    name: string;
    serializer: ISerializer;
    priority: number;
  }>;
  
  constructor() {
    this.serializers = [
      { name: 'buffer', serializer: new BufferSerializer(), priority: 1 },
      { name: 'json', serializer: new JSONSerializer(), priority: 2 }
    ];
  }
  
  /**
   * Register a custom serializer
   */
  register(name: string, serializer: ISerializer, priority: number = 10): void {
    this.serializers.push({ name, serializer, priority });
    this.serializers.sort((a, b) => a.priority - b.priority);
  }
  
  /**
   * Serialize using the first applicable serializer
   */
  serialize(value: T, options?: SerializationOptions): SerializationResult {
    for (const { serializer } of this.serializers) {
      if (serializer.canSerialize(value)) {
        return serializer.serialize(value, options);
      }
    }
    
    // Fallback to string representation
    return {
      data: String(value),
      originalSize: 0,
      serializedSize: String(value).length * 2,
      method: 'string'
    };
  }
  
  /**
   * Deserialize based on method hint
   */
  deserialize(data: string, options?: SerializationOptions): T {
    // Try each serializer until one succeeds
    for (const { serializer } of this.serializers) {
      try {
        return serializer.deserialize(data, options);
      } catch {
        // Try next serializer
      }
    }
    
    // Return as-is if all fail
    return data as unknown as T;
  }
  
  canSerialize(value: any): boolean {
    return this.serializers.some(({ serializer }) => serializer.canSerialize(value));
  }
}

/**
 * TTL utilities for cache entries
 */
export class TTLManager {
  private timers: Map<string, NodeJS.Timeout>;
  
  constructor() {
    this.timers = new Map();
  }
  
  /**
   * Schedule expiration callback for a key
   */
  scheduleExpiration(key: string, ttl: number, callback: () => void): void {
    this.cancelExpiration(key);
    
    if (ttl > 0) {
      const timer = setTimeout(() => {
        this.timers.delete(key);
        callback();
      }, ttl);
      
      // Don't block Node.js exit
      if (timer.unref) {
        timer.unref();
      }
      
      this.timers.set(key, timer);
    }
  }
  
  /**
   * Cancel scheduled expiration
   */
  cancelExpiration(key: string): void {
    const timer = this.timers.get(key);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(key);
    }
  }
  
  /**
   * Update TTL for a key
   */
  updateTTL(key: string, ttl: number, callback: () => void): void {
    this.scheduleExpiration(key, ttl, callback);
  }
  
  /**
   * Clear all timers
   */
  clear(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
  }
  
  /**
   * Get remaining TTL for a key
   */
  getRemainingTTL(key: string, originalTTL: number, createdAt: number): number {
    if (originalTTL <= 0) return 0;
    
    const elapsed = Date.now() - createdAt;
    const remaining = originalTTL - elapsed;
    
    return Math.max(0, remaining);
  }
  
  /**
   * Check if entry is expired
   */
  isExpired(ttl: number, createdAt: number): boolean {
    if (ttl <= 0) return false;
    return Date.now() - createdAt > ttl;
  }
  
  /**
   * Dispose of all resources
   */
  dispose(): void {
    this.clear();
  }
}

/**
 * Factory functions for creating serializers
 */
export const Serializers = {
  json: <T = any>() => new JSONSerializer<T>(),
  buffer: () => new BufferSerializer(),
  composite: <T = any>() => new CompositeSerializer<T>(),
  
  /**
   * Create a custom serializer with specific options
   */
  custom: <T = any>(options: SerializationOptions): ISerializer<T> => {
    const serializer = new JSONSerializer<T>();
    return {
      serialize: (value: T) => serializer.serialize(value, options),
      deserialize: (data: string) => serializer.deserialize(data, options),
      canSerialize: (value: any) => serializer.canSerialize(value)
    };
  }
};

/**
 * Size calculation utilities
 */
export class SizeCalculator {
  /**
   * Calculate size of a JavaScript value in bytes
   */
  static calculate(value: any, seen = new WeakSet()): number {
    if (value === null || value === undefined) return 0;
    
    // Prevent circular reference infinite loops
    if (typeof value === 'object' && seen.has(value)) {
      return 0;
    }
    
    switch (typeof value) {
      case 'string':
        return value.length * 2; // Unicode chars
        
      case 'number':
        return 8; // 64-bit float
        
      case 'boolean':
        return 4;
        
      case 'object':
        if (seen.has(value)) return 0;
        seen.add(value);
        
        if (value instanceof Date) {
          return 8; // Timestamp
        }
        
        if (value instanceof Buffer) {
          return value.length;
        }
        
        if (value instanceof ArrayBuffer) {
          return value.byteLength;
        }
        
        if (Array.isArray(value)) {
          let size = 24; // Array overhead
          for (const item of value) {
            size += this.calculate(item, seen);
          }
          return size;
        }
        
        // Regular object
        let size = 24; // Object overhead
        for (const key in value) {
          if (value.hasOwnProperty(key)) {
            size += key.length * 2; // Key string
            size += this.calculate(value[key], seen);
            size += 8; // Property overhead
          }
        }
        return size;
        
      case 'function':
        return 256; // Rough estimate for function
        
      default:
        return 24; // Default overhead
    }
  }
  
  /**
   * Format bytes to human-readable string
   */
  static formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const k = 1024;
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${units[i]}`;
  }
  
  /**
   * Calculate compression ratio
   */
  static compressionRatio(original: number, compressed: number): number {
    if (original === 0) return 0;
    return (1 - compressed / original) * 100;
  }
}