/**
 * Redis Cache Client with Advanced Features
 * Production-ready caching layer for Temporal workflows
 */

import Redis, { Redis as RedisClient } from 'ioredis';
import { z } from 'zod';
import crypto from 'crypto';

// Cache configuration schema
const CacheConfigSchema = z.object({
  url: z.string().optional(),
  host: z.string().default('localhost'),
  port: z.number().default(6379),
  password: z.string().optional(),
  db: z.number().default(0),
  keyPrefix: z.string().default('temporal:'),
  ttl: z.number().default(3600), // Default 1 hour
  enableOfflineQueue: z.boolean().default(true),
  maxRetriesPerRequest: z.number().default(3),
  retryStrategy: z.function().optional(),
  lazyConnect: z.boolean().default(false),
  enableReadyCheck: z.boolean().default(true)
});

type CacheConfig = z.infer<typeof CacheConfigSchema>;

// Cache entry with metadata
interface CacheEntry<T = any> {
  data: T;
  timestamp: number;
  ttl: number;
  hits: number;
  tags?: string[];
}

/**
 * Redis Cache Client with advanced caching strategies
 */
export class RedisCacheClient {
  private client: RedisClient;
  private subscriber: RedisClient;
  private config: CacheConfig;
  private isConnected: boolean = false;
  private invalidationListeners: Map<string, Set<() => void>> = new Map();

  constructor(config?: Partial<CacheConfig>) {
    // Parse and validate configuration
    this.config = CacheConfigSchema.parse({
      url: process.env.REDIS_URL,
      host: process.env.REDIS_HOST,
      port: process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT) : undefined,
      password: process.env.REDIS_PASSWORD,
      ...config,
      retryStrategy: config?.retryStrategy || ((times: number) => {
        const delay = Math.min(times * 50, 2000);
        console.log(`Redis retry attempt ${times}, delay: ${delay}ms`);
        return delay;
      })
    });

    // Create Redis client
    if (this.config.url) {
      this.client = new Redis(this.config.url);
      this.subscriber = new Redis(this.config.url);
    } else {
      const options = {
        host: this.config.host,
        port: this.config.port,
        password: this.config.password,
        db: this.config.db,
        keyPrefix: this.config.keyPrefix,
        enableOfflineQueue: this.config.enableOfflineQueue,
        maxRetriesPerRequest: this.config.maxRetriesPerRequest,
        retryStrategy: this.config.retryStrategy as ((times: number) => number | void | null) | undefined,
        lazyConnect: this.config.lazyConnect,
        enableReadyCheck: this.config.enableReadyCheck
      };
      
      this.client = new Redis(options);
      this.subscriber = new Redis(options);
    }

    // Set up event handlers
    this.setupEventHandlers();
    
    // Set up pub/sub for cache invalidation
    this.setupPubSub();
  }

  /**
   * Set up Redis event handlers
   */
  private setupEventHandlers(): void {
    this.client.on('connect', () => {
      console.log('Redis client connected');
      this.isConnected = true;
    });

    this.client.on('ready', () => {
      console.log('Redis client ready');
    });

    this.client.on('error', (err) => {
      console.error('Redis client error:', err);
      this.isConnected = false;
    });

    this.client.on('close', () => {
      console.log('Redis connection closed');
      this.isConnected = false;
    });

    this.client.on('reconnecting', () => {
      console.log('Redis client reconnecting...');
    });
  }

  /**
   * Set up pub/sub for cache invalidation
   */
  private setupPubSub(): void {
    this.subscriber.on('message', (channel, message) => {
      if (channel === `${this.config.keyPrefix}invalidate`) {
        this.handleInvalidation(message);
      }
    });

    this.subscriber.subscribe(`${this.config.keyPrefix}invalidate`);
  }

  /**
   * Initialize connection
   */
  async initialize(): Promise<void> {
    try {
      if (!this.isConnected) {
        await this.client.connect();
      }
      await this.client.ping();
      this.isConnected = true;
      console.log('Redis cache client initialized');
    } catch (error) {
      console.error('Failed to initialize Redis:', error);
      throw error;
    }
  }

  /**
   * Get value from cache with metadata
   */
  async get<T = any>(key: string): Promise<T | null> {
    try {
      const fullKey = this.buildKey(key);
      const data = await this.client.get(fullKey);
      
      if (!data) {
        return null;
      }

      const entry: CacheEntry<T> = JSON.parse(data);
      
      // Update hit count
      entry.hits++;
      await this.client.set(fullKey, JSON.stringify(entry), 'EX', entry.ttl);
      
      return entry.data;
    } catch (error) {
      console.error(`Cache get error for key ${key}:`, error);
      return null;
    }
  }

  /**
   * Set value in cache with metadata
   */
  async set<T = any>(
    key: string,
    value: T,
    ttl?: number,
    tags?: string[]
  ): Promise<void> {
    try {
      const fullKey = this.buildKey(key);
      const entry: CacheEntry<T> = {
        data: value,
        timestamp: Date.now(),
        ttl: ttl || this.config.ttl,
        hits: 0,
        tags
      };

      await this.client.set(
        fullKey,
        JSON.stringify(entry),
        'EX',
        entry.ttl
      );

      // Store tags for invalidation
      if (tags && tags.length > 0) {
        for (const tag of tags) {
          await this.client.sadd(`${this.config.keyPrefix}tag:${tag}`, fullKey);
        }
      }
    } catch (error) {
      console.error(`Cache set error for key ${key}:`, error);
    }
  }

  /**
   * Delete value from cache
   */
  async delete(key: string): Promise<void> {
    try {
      const fullKey = this.buildKey(key);
      await this.client.del(fullKey);
    } catch (error) {
      console.error(`Cache delete error for key ${key}:`, error);
    }
  }

  /**
   * Clear all cache entries
   */
  async clear(): Promise<void> {
    try {
      const keys = await this.client.keys(`${this.config.keyPrefix}*`);
      if (keys.length > 0) {
        await this.client.del(...keys);
      }
      console.log(`Cleared ${keys.length} cache entries`);
    } catch (error) {
      console.error('Cache clear error:', error);
    }
  }

  /**
   * Invalidate cache by tags
   */
  async invalidateByTags(tags: string[]): Promise<void> {
    try {
      const keysToInvalidate = new Set<string>();
      
      for (const tag of tags) {
        const tagKey = `${this.config.keyPrefix}tag:${tag}`;
        const keys = await this.client.smembers(tagKey);
        keys.forEach(key => keysToInvalidate.add(key));
        await this.client.del(tagKey);
      }

      if (keysToInvalidate.size > 0) {
        await this.client.del(...Array.from(keysToInvalidate));
        console.log(`Invalidated ${keysToInvalidate.size} cache entries`);
      }

      // Publish invalidation event
      await this.client.publish(
        `${this.config.keyPrefix}invalidate`,
        JSON.stringify({ tags, keys: Array.from(keysToInvalidate) })
      );
    } catch (error) {
      console.error('Cache invalidation error:', error);
    }
  }

  /**
   * Cache decorator for functions
   */
  async withCache<T>(
    key: string,
    fn: () => Promise<T>,
    ttl?: number,
    tags?: string[]
  ): Promise<T> {
    // Try to get from cache
    const cached = await this.get<T>(key);
    if (cached !== null) {
      console.log(`Cache hit for key: ${key}`);
      return cached;
    }

    // Execute function and cache result
    console.log(`Cache miss for key: ${key}`);
    const result = await fn();
    await this.set(key, result, ttl, tags);
    
    return result;
  }

  /**
   * Memoize function with caching
   */
  memoize<T extends (...args: any[]) => Promise<any>>(
    fn: T,
    keyGenerator?: (...args: Parameters<T>) => string,
    ttl?: number
  ): T {
    return (async (...args: Parameters<T>) => {
      const key = keyGenerator 
        ? keyGenerator(...args)
        : this.generateKey(fn.name, args);
      
      return this.withCache(key, () => fn(...args), ttl);
    }) as T;
  }

  /**
   * Batch get multiple keys
   */
  async mget<T = any>(keys: string[]): Promise<(T | null)[]> {
    try {
      const fullKeys = keys.map(key => this.buildKey(key));
      const values = await this.client.mget(...fullKeys);
      
      return values.map(value => {
        if (!value) return null;
        try {
          const entry: CacheEntry<T> = JSON.parse(value);
          return entry.data;
        } catch {
          return null;
        }
      });
    } catch (error) {
      console.error('Batch get error:', error);
      return keys.map(() => null);
    }
  }

  /**
   * Batch set multiple keys
   */
  async mset<T = any>(
    entries: Array<{ key: string; value: T; ttl?: number; tags?: string[] }>
  ): Promise<void> {
    try {
      const pipeline = this.client.pipeline();
      
      for (const { key, value, ttl, tags } of entries) {
        const fullKey = this.buildKey(key);
        const entry: CacheEntry<T> = {
          data: value,
          timestamp: Date.now(),
          ttl: ttl || this.config.ttl,
          hits: 0,
          tags
        };
        
        pipeline.set(fullKey, JSON.stringify(entry), 'EX', entry.ttl);
        
        if (tags && tags.length > 0) {
          for (const tag of tags) {
            pipeline.sadd(`${this.config.keyPrefix}tag:${tag}`, fullKey);
          }
        }
      }
      
      await pipeline.exec();
    } catch (error) {
      console.error('Batch set error:', error);
    }
  }

  /**
   * Implement cache-aside pattern
   */
  async cacheAside<T>(
    key: string,
    loader: () => Promise<T>,
    ttl?: number
  ): Promise<T> {
    // Read from cache
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    // Load from source
    const data = await loader();
    
    // Write to cache
    await this.set(key, data, ttl);
    
    return data;
  }

  /**
   * Implement write-through pattern
   */
  async writeThrough<T>(
    key: string,
    value: T,
    writer: (value: T) => Promise<void>,
    ttl?: number
  ): Promise<void> {
    // Write to source
    await writer(value);
    
    // Write to cache
    await this.set(key, value, ttl);
  }

  /**
   * Implement write-behind pattern (delayed write)
   */
  async writeBehind<T>(
    key: string,
    value: T,
    writer: (value: T) => Promise<void>,
    delay: number = 5000,
    ttl?: number
  ): Promise<void> {
    // Write to cache immediately
    await this.set(key, value, ttl);
    
    // Schedule write to source
    setTimeout(async () => {
      try {
        await writer(value);
      } catch (error) {
        console.error('Write-behind error:', error);
      }
    }, delay);
  }

  /**
   * Build full cache key
   */
  private buildKey(key: string): string {
    return `${this.config.keyPrefix}${key}`;
  }

  /**
   * Generate cache key from function name and arguments
   */
  private generateKey(fnName: string, args: any[]): string {
    const hash = crypto
      .createHash('sha256')
      .update(JSON.stringify(args))
      .digest('hex')
      .substring(0, 8);
    
    return `fn:${fnName}:${hash}`;
  }

  /**
   * Handle cache invalidation message
   */
  private handleInvalidation(message: string): void {
    try {
      const { tags, keys } = JSON.parse(message);
      console.log(`Received invalidation for tags: ${tags}`);
      
      // Notify listeners
      for (const tag of tags || []) {
        const listeners = this.invalidationListeners.get(tag);
        if (listeners) {
          listeners.forEach(listener => listener());
        }
      }
    } catch (error) {
      console.error('Error handling invalidation:', error);
    }
  }

  /**
   * Subscribe to invalidation events
   */
  onInvalidation(tag: string, callback: () => void): () => void {
    if (!this.invalidationListeners.has(tag)) {
      this.invalidationListeners.set(tag, new Set());
    }
    
    this.invalidationListeners.get(tag)!.add(callback);
    
    // Return unsubscribe function
    return () => {
      const listeners = this.invalidationListeners.get(tag);
      if (listeners) {
        listeners.delete(callback);
      }
    };
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{
    keys: number;
    memory: string;
    hits: number;
    misses: number;
  }> {
    const info = await this.client.info('stats');
    const keyCount = await this.client.dbsize();
    
    // Parse stats from info
    const stats = {
      keys: keyCount,
      memory: 'N/A',
      hits: 0,
      misses: 0
    };
    
    const lines = info.split('\r\n');
    for (const line of lines) {
      if (line.startsWith('used_memory_human:')) {
        stats.memory = line.split(':')[1];
      } else if (line.startsWith('keyspace_hits:')) {
        stats.hits = parseInt(line.split(':')[1]);
      } else if (line.startsWith('keyspace_misses:')) {
        stats.misses = parseInt(line.split(':')[1]);
      }
    }
    
    return stats;
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      const result = await this.client.ping();
      return result === 'PONG';
    } catch {
      return false;
    }
  }

  /**
   * Close connections
   */
  async close(): Promise<void> {
    await this.subscriber.unsubscribe();
    await this.subscriber.quit();
    await this.client.quit();
    this.isConnected = false;
    console.log('Redis connections closed');
  }
}

// Singleton instance
let instance: RedisCacheClient | null = null;

/**
 * Get Redis cache client instance
 */
export function getRedisCacheClient(config?: Partial<CacheConfig>): RedisCacheClient {
  if (!instance) {
    instance = new RedisCacheClient(config);
  }
  return instance;
}

export default RedisCacheClient;