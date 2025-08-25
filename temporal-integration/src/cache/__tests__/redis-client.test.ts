/**
 * Unit Tests for Redis Cache Client
 * Comprehensive test coverage for caching operations
 */

import Redis from 'ioredis';
import { RedisCacheClient, getRedisCacheClient } from '../redis-client';

// Mock ioredis
jest.mock('ioredis');
const MockedRedis = Redis as jest.MockedClass<typeof Redis>;

describe('RedisCacheClient', () => {
  let client: RedisCacheClient;
  let mockRedis: jest.Mocked<Redis>;
  let mockSubscriber: jest.Mocked<Redis>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockRedis = {
      connect: jest.fn().mockResolvedValue(undefined),
      ping: jest.fn().mockResolvedValue('PONG'),
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      mget: jest.fn(),
      keys: jest.fn(),
      sadd: jest.fn(),
      smembers: jest.fn(),
      publish: jest.fn(),
      pipeline: jest.fn(() => ({
        set: jest.fn().mockReturnThis(),
        sadd: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([])
      })),
      info: jest.fn(),
      dbsize: jest.fn(),
      quit: jest.fn(),
      on: jest.fn(),
      unsubscribe: jest.fn(),
      subscribe: jest.fn()
    } as any;

    mockSubscriber = {
      ...mockRedis,
      on: jest.fn(),
      subscribe: jest.fn(),
      unsubscribe: jest.fn(),
      quit: jest.fn()
    } as any;

    MockedRedis.mockImplementation((() => mockRedis) as any);

    client = new RedisCacheClient({
      host: 'localhost',
      port: 6379,
      keyPrefix: 'test:'
    });
  });

  afterEach(async () => {
    try {
      await client.close();
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Initialization', () => {
    it('should initialize connection successfully', async () => {
      await client.initialize();

      expect(mockRedis.ping).toHaveBeenCalled();
    });

    it('should handle connection failure', async () => {
      mockRedis.connect.mockRejectedValue(new Error('Connection failed'));

      await expect(client.initialize()).rejects.toThrow('Connection failed');
    });

    it('should set up event handlers', () => {
      expect(mockRedis.on).toHaveBeenCalledWith('connect', expect.any(Function));
      expect(mockRedis.on).toHaveBeenCalledWith('ready', expect.any(Function));
      expect(mockRedis.on).toHaveBeenCalledWith('error', expect.any(Function));
      expect(mockRedis.on).toHaveBeenCalledWith('close', expect.any(Function));
      expect(mockRedis.on).toHaveBeenCalledWith('reconnecting', expect.any(Function));
    });

    it('should set up pub/sub for invalidation', () => {
      expect(mockSubscriber.subscribe).toHaveBeenCalledWith('test:invalidate');
    });
  });

  describe('Basic Cache Operations', () => {
    it('should get cached value successfully', async () => {
      const cacheEntry = {
        data: 'test-value',
        timestamp: Date.now(),
        ttl: 3600,
        hits: 5,
        tags: ['test']
      };

      mockRedis.get.mockResolvedValue(JSON.stringify(cacheEntry));
      mockRedis.set.mockResolvedValue('OK');

      const result = await client.get('test-key');

      expect(result).toBe('test-value');
      expect(mockRedis.get).toHaveBeenCalledWith('test:test-key');
      
      // Should increment hit count
      expect(mockRedis.set).toHaveBeenCalledWith(
        'test:test-key',
        expect.stringContaining('"hits":6'),
        'EX',
        3600
      );
    });

    it('should return null for non-existent key', async () => {
      mockRedis.get.mockResolvedValue(null);

      const result = await client.get('non-existent');

      expect(result).toBeNull();
      expect(mockRedis.get).toHaveBeenCalledWith('test:non-existent');
    });

    it('should handle corrupted cache data gracefully', async () => {
      mockRedis.get.mockResolvedValue('invalid-json');

      const result = await client.get('corrupted-key');

      expect(result).toBeNull();
    });

    it('should set cached value successfully', async () => {
      mockRedis.set.mockResolvedValue('OK');
      mockRedis.sadd.mockResolvedValue(1);

      await client.set('test-key', 'test-value', 1800, ['tag1', 'tag2']);

      expect(mockRedis.set).toHaveBeenCalledWith(
        'test:test-key',
        expect.stringContaining('"data":"test-value"'),
        'EX',
        1800
      );

      // Should set tags
      expect(mockRedis.sadd).toHaveBeenCalledWith('test:tag:tag1', 'test:test-key');
      expect(mockRedis.sadd).toHaveBeenCalledWith('test:tag:tag2', 'test:test-key');
    });

    it('should delete cached value successfully', async () => {
      mockRedis.del.mockResolvedValue(1);

      await client.delete('test-key');

      expect(mockRedis.del).toHaveBeenCalledWith('test:test-key');
    });

    it('should clear all cache entries', async () => {
      mockRedis.keys.mockResolvedValue(['test:key1', 'test:key2', 'test:key3']);
      mockRedis.del.mockResolvedValue(3);

      await client.clear();

      expect(mockRedis.keys).toHaveBeenCalledWith('test:*');
      expect(mockRedis.del).toHaveBeenCalledWith('test:key1', 'test:key2', 'test:key3');
    });

    it('should handle empty cache during clear', async () => {
      mockRedis.keys.mockResolvedValue([]);

      await client.clear();

      expect(mockRedis.keys).toHaveBeenCalledWith('test:*');
      expect(mockRedis.del).not.toHaveBeenCalled();
    });
  });

  describe('Cache Invalidation', () => {
    it('should invalidate cache by tags', async () => {
      mockRedis.smembers
        .mockResolvedValueOnce(['test:key1', 'test:key2'])
        .mockResolvedValueOnce(['test:key3']);
      
      mockRedis.del.mockResolvedValue(1);
      mockRedis.publish.mockResolvedValue(1);

      await client.invalidateByTags(['tag1', 'tag2']);

      expect(mockRedis.smembers).toHaveBeenCalledWith('test:tag:tag1');
      expect(mockRedis.smembers).toHaveBeenCalledWith('test:tag:tag2');
      expect(mockRedis.del).toHaveBeenCalledWith('test:tag:tag1');
      expect(mockRedis.del).toHaveBeenCalledWith('test:tag:tag2');
      expect(mockRedis.del).toHaveBeenCalledWith('test:key1', 'test:key2', 'test:key3');
      expect(mockRedis.publish).toHaveBeenCalledWith(
        'test:invalidate',
        expect.stringContaining('tag1')
      );
    });

    it('should handle empty tag invalidation', async () => {
      mockRedis.smembers.mockResolvedValue([]);
      mockRedis.del.mockResolvedValue(0);

      await client.invalidateByTags(['empty-tag']);

      expect(mockRedis.smembers).toHaveBeenCalledWith('test:tag:empty-tag');
      expect(mockRedis.del).toHaveBeenCalledWith('test:tag:empty-tag');
    });
  });

  describe('Advanced Caching Patterns', () => {
    it('should implement cache-aside pattern', async () => {
      // Cache miss
      mockRedis.get.mockResolvedValueOnce(null);
      mockRedis.set.mockResolvedValue('OK');

      const loader = jest.fn().mockResolvedValue('loaded-data');

      const result = await client.withCache('cache-key', loader, 3600);

      expect(result).toBe('loaded-data');
      expect(mockRedis.get).toHaveBeenCalledWith('test:cache-key');
      expect(loader).toHaveBeenCalled();
      expect(mockRedis.set).toHaveBeenCalled();
    });

    it('should return cached data on cache hit', async () => {
      const cacheEntry = {
        data: 'cached-data',
        timestamp: Date.now(),
        ttl: 3600,
        hits: 0
      };

      mockRedis.get.mockResolvedValue(JSON.stringify(cacheEntry));
      mockRedis.set.mockResolvedValue('OK');

      const loader = jest.fn();

      const result = await client.withCache('cache-key', loader);

      expect(result).toBe('cached-data');
      expect(loader).not.toHaveBeenCalled();
    });

    it('should memoize function calls', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockRedis.set.mockResolvedValue('OK');

      const expensiveFunction = jest.fn().mockResolvedValue('computed-result');
      const memoized = client.memoize(expensiveFunction);

      const result1 = await memoized('arg1', 'arg2');
      const result2 = await memoized('arg1', 'arg2');

      expect(result1).toBe('computed-result');
      expect(result2).toBe('computed-result');
      expect(expensiveFunction).toHaveBeenCalledTimes(1);
    });

    it('should use custom key generator for memoization', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockRedis.set.mockResolvedValue('OK');

      const fn = jest.fn().mockResolvedValue('result');
      const keyGenerator = jest.fn().mockReturnValue('custom-key');
      const memoized = client.memoize(fn, keyGenerator, 1800);

      await memoized('arg1', 'arg2');

      expect(keyGenerator).toHaveBeenCalledWith('arg1', 'arg2');
      expect(mockRedis.get).toHaveBeenCalledWith('test:custom-key');
    });
  });

  describe('Batch Operations', () => {
    it('should batch get multiple keys', async () => {
      const entries = [
        { data: 'value1', timestamp: Date.now(), ttl: 3600, hits: 0 },
        { data: 'value2', timestamp: Date.now(), ttl: 3600, hits: 0 }
      ];

      mockRedis.mget.mockResolvedValue([
        JSON.stringify(entries[0]),
        JSON.stringify(entries[1]),
        null
      ]);

      const result = await client.mget(['key1', 'key2', 'key3']);

      expect(result).toEqual(['value1', 'value2', null]);
      expect(mockRedis.mget).toHaveBeenCalledWith('test:key1', 'test:key2', 'test:key3');
    });

    it('should batch set multiple keys', async () => {
      const mockPipeline = {
        set: jest.fn().mockReturnThis(),
        sadd: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([])
      };

      mockRedis.pipeline.mockReturnValue(mockPipeline as any);

      const entries = [
        { key: 'key1', value: 'value1', ttl: 1800, tags: ['tag1'] },
        { key: 'key2', value: 'value2', ttl: 3600 }
      ];

      await client.mset(entries);

      expect(mockRedis.pipeline).toHaveBeenCalled();
      expect(mockPipeline.set).toHaveBeenCalledTimes(2);
      expect(mockPipeline.sadd).toHaveBeenCalledWith('test:tag:tag1', 'test:key1');
      expect(mockPipeline.exec).toHaveBeenCalled();
    });

    it('should handle batch operation errors', async () => {
      mockRedis.mget.mockRejectedValue(new Error('Network error'));

      const result = await client.mget(['key1', 'key2']);

      expect(result).toEqual([null, null]);
    });
  });

  describe('Cache Patterns', () => {
    it('should implement cache-aside pattern', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockRedis.set.mockResolvedValue('OK');

      const loader = jest.fn().mockResolvedValue('fresh-data');

      const result = await client.cacheAside('fresh-key', loader, 1800);

      expect(result).toBe('fresh-data');
      expect(loader).toHaveBeenCalled();
      expect(mockRedis.set).toHaveBeenCalled();
    });

    it('should implement write-through pattern', async () => {
      mockRedis.set.mockResolvedValue('OK');

      const writer = jest.fn().mockResolvedValue(undefined);
      const data = { id: 1, name: 'test' };

      await client.writeThrough('write-key', data, writer, 1800);

      expect(writer).toHaveBeenCalledWith(data);
      expect(mockRedis.set).toHaveBeenCalled();
    });

    it('should implement write-behind pattern', async () => {
      mockRedis.set.mockResolvedValue('OK');

      const writer = jest.fn().mockResolvedValue(undefined);
      const data = { id: 1, name: 'test' };

      await client.writeBehind('write-behind-key', data, writer, 100, 1800);

      expect(mockRedis.set).toHaveBeenCalled();
      expect(writer).not.toHaveBeenCalled(); // Should be delayed

      // Wait for delayed write
      await new Promise(resolve => setTimeout(resolve, 150));
      expect(writer).toHaveBeenCalledWith(data);
    });
  });

  describe('Statistics and Health', () => {
    it('should return cache statistics', async () => {
      mockRedis.info.mockResolvedValue(
        'keyspace_hits:1000\r\nkeyspace_misses:200\r\nused_memory_human:10.5M\r\n'
      );
      mockRedis.dbsize.mockResolvedValue(500);

      const stats = await client.getStats();

      expect(stats).toEqual({
        keys: 500,
        memory: '10.5M',
        hits: 1000,
        misses: 200
      });
    });

    it('should perform health check successfully', async () => {
      mockRedis.ping.mockResolvedValue('PONG');

      const isHealthy = await client.healthCheck();

      expect(isHealthy).toBe(true);
      expect(mockRedis.ping).toHaveBeenCalled();
    });

    it('should fail health check on error', async () => {
      mockRedis.ping.mockRejectedValue(new Error('Connection failed'));

      const isHealthy = await client.healthCheck();

      expect(isHealthy).toBe(false);
    });
  });

  describe('Event Handling', () => {
    it('should handle invalidation events', () => {
      const callback = jest.fn();
      const unsubscribe = client.onInvalidation('test-tag', callback);

      expect(typeof unsubscribe).toBe('function');

      // Should be able to unsubscribe
      unsubscribe();
    });

    it('should call invalidation listeners', () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();

      client.onInvalidation('tag1', callback1);
      client.onInvalidation('tag1', callback2);

      // Simulate invalidation message
      const mockSubscriberOn = mockSubscriber.on as jest.MockedFunction<typeof mockSubscriber.on>;
      const messageHandler = mockSubscriberOn.mock.calls.find(call => call[0] === 'message')?.[1];

      if (messageHandler) {
        messageHandler('test:invalidate', JSON.stringify({
          tags: ['tag1'],
          keys: ['test:key1']
        }));
      }

      expect(callback1).toHaveBeenCalled();
      expect(callback2).toHaveBeenCalled();
    });
  });

  describe('Connection Management', () => {
    it('should close connections properly', async () => {
      await client.close();

      expect(mockSubscriber.unsubscribe).toHaveBeenCalled();
      expect(mockSubscriber.quit).toHaveBeenCalled();
      expect(mockRedis.quit).toHaveBeenCalled();
    });
  });

  describe('Key Generation', () => {
    it('should build keys with prefix', async () => {
      await client.get('test-key');

      expect(mockRedis.get).toHaveBeenCalledWith('test:test-key');
    });

    it('should generate consistent hash-based keys for functions', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockRedis.set.mockResolvedValue('OK');

      const fn = jest.fn().mockResolvedValue('result');
      const memoized = client.memoize(fn);

      await memoized('arg1', { key: 'value' });

      // Should generate a consistent hash-based key
      expect(mockRedis.get).toHaveBeenCalledWith(
        expect.stringMatching(/^test:fn:.*:[a-f0-9]{8}$/)
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle get errors gracefully', async () => {
      mockRedis.get.mockRejectedValue(new Error('Redis error'));

      const result = await client.get('error-key');

      expect(result).toBeNull();
    });

    it('should handle set errors gracefully', async () => {
      mockRedis.set.mockRejectedValue(new Error('Redis error'));

      // Should not throw
      await expect(client.set('error-key', 'value')).resolves.toBeUndefined();
    });

    it('should handle delete errors gracefully', async () => {
      mockRedis.del.mockRejectedValue(new Error('Redis error'));

      // Should not throw
      await expect(client.delete('error-key')).resolves.toBeUndefined();
    });

    it('should handle invalidation errors gracefully', async () => {
      mockRedis.smembers.mockRejectedValue(new Error('Redis error'));

      // Should not throw
      await expect(client.invalidateByTags(['error-tag'])).resolves.toBeUndefined();
    });
  });

  describe('Configuration', () => {
    it('should use URL configuration', () => {
      const urlClient = new RedisCacheClient({
        url: 'redis://localhost:6379/1'
      });

      expect(MockedRedis).toHaveBeenCalledWith('redis://localhost:6379/1');
    });

    it('should use individual connection parameters', () => {
      const paramClient = new RedisCacheClient({
        host: 'redis-host',
        port: 6380,
        password: 'secret',
        db: 2,
        keyPrefix: 'app:'
      });

      expect(MockedRedis).toHaveBeenCalledWith(
        expect.objectContaining({
          host: 'redis-host',
          port: 6380,
          password: 'secret',
          db: 2,
          keyPrefix: 'app:'
        })
      );
    });

    it('should use environment variables', () => {
      process.env.REDIS_URL = 'redis://env-host:6379';
      process.env.REDIS_HOST = 'env-host';
      process.env.REDIS_PORT = '6380';
      process.env.REDIS_PASSWORD = 'env-password';

      const envClient = new RedisCacheClient();

      expect(MockedRedis).toHaveBeenCalled();

      // Clean up
      delete process.env.REDIS_URL;
      delete process.env.REDIS_HOST;
      delete process.env.REDIS_PORT;
      delete process.env.REDIS_PASSWORD;
    });
  });

  describe('Singleton Pattern', () => {
    it('should return same instance for getRedisCacheClient', () => {
      const instance1 = getRedisCacheClient();
      const instance2 = getRedisCacheClient();

      expect(instance1).toBe(instance2);
    });
  });

  describe('Performance Tests', () => {
    it('should handle high-frequency cache operations', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockRedis.set.mockResolvedValue('OK');

      const operations = Array.from({ length: 1000 }, (_, i) => 
        client.set(`perf-key-${i}`, `value-${i}`)
      );

      const startTime = Date.now();
      await Promise.all(operations);
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(1000); // Should complete within 1 second
      expect(mockRedis.set).toHaveBeenCalledTimes(1000);
    });

    it('should handle concurrent get operations efficiently', async () => {
      const cacheEntry = {
        data: 'cached-value',
        timestamp: Date.now(),
        ttl: 3600,
        hits: 0
      };

      mockRedis.get.mockResolvedValue(JSON.stringify(cacheEntry));
      mockRedis.set.mockResolvedValue('OK');

      const operations = Array.from({ length: 500 }, () => 
        client.get('popular-key')
      );

      const startTime = Date.now();
      const results = await Promise.all(operations);
      const duration = Date.now() - startTime;

      expect(results.every(r => r === 'cached-value')).toBe(true);
      expect(duration).toBeLessThan(500); // Should complete within 500ms
    });
  });

  describe('Edge Cases', () => {
    it('should handle very large cache values', async () => {
      const largeValue = 'x'.repeat(1000000); // 1MB string
      mockRedis.set.mockResolvedValue('OK');

      await client.set('large-key', largeValue);

      expect(mockRedis.set).toHaveBeenCalledWith(
        'test:large-key',
        expect.stringContaining(largeValue),
        'EX',
        3600
      );
    });

    it('should handle special characters in keys and values', async () => {
      const specialKey = 'key:with:colons/and/slashes';
      const specialValue = { unicode: '🚀', emoji: '😀', symbols: '@#$%^&*()' };

      mockRedis.set.mockResolvedValue('OK');

      await client.set(specialKey, specialValue);

      expect(mockRedis.set).toHaveBeenCalledWith(
        `test:${specialKey}`,
        expect.stringContaining(JSON.stringify(specialValue)),
        'EX',
        3600
      );
    });

    it('should handle zero and negative TTL values', async () => {
      mockRedis.set.mockResolvedValue('OK');

      await client.set('zero-ttl', 'value', 0);
      await client.set('negative-ttl', 'value', -1);

      expect(mockRedis.set).toHaveBeenCalledWith(
        'test:zero-ttl',
        expect.any(String),
        'EX',
        0
      );

      expect(mockRedis.set).toHaveBeenCalledWith(
        'test:negative-ttl',
        expect.any(String),
        'EX',
        -1
      );
    });
  });
});